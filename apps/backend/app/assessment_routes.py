import json
import asyncio
import hashlib
import time
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .assessment_bank import BANK, SKILLS
from .assessment_engine import estimates, recommend, should_stop
from .assessment_language import select_for_preferences
from .assessment_questions import QuestionGeneratorAgent
from .db import audit, connect, encode, now, uid


def init_assessment():
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS assessments (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), state TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS question_reviews (
          question_id TEXT NOT NULL, version INTEGER NOT NULL, reviewer TEXT NOT NULL,
          reviewed_at TEXT NOT NULL, PRIMARY KEY(question_id,version));
        CREATE TABLE IF NOT EXISTS presentation_events (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
          value REAL NOT NULL, created_at TEXT NOT NULL);
        """)


class Preferences(BaseModel):
    language: Literal["ja", "ja-easy", "en", "zh", "vi", "other"] = "ja"
    japanese_reading: Literal["none", "kana", "comfortable"] | None = None
    japanese_frequency: Literal["daily", "sometimes", "rarely", "not_asked"] = "not_asked"
    short: bool = True
    visual: float = Field(0.5, ge=0, le=1)
    furigana: bool = False
    font_scale: float = Field(1.2, ge=1, le=1.6)
    line_spacing: float = Field(1.7, ge=1.3, le=2.5)


class Start(BaseModel):
    mode: Literal["quick", "detailed"] = "quick"
    preferences: Preferences = Field(default_factory=Preferences)


class Answer(BaseModel):
    question_id: str
    answer: int | list[int]
    shown_at: datetime
    response_time_ms: int = Field(ge=0, le=3600000)
    interrupted: bool = False
    skipped: bool = False


class Event(BaseModel):
    kind: Literal["back", "source", "dwell", "font", "zoom", "furigana"]
    value: float = Field(1, ge=0, le=3600000)


def save(db, id: str, state: dict):
    db.execute("UPDATE assessments SET state=?,updated_at=? WHERE id=?", (encode(state), now(), id))


def owned(db, id: str, user: dict) -> dict:
    row = db.execute("SELECT * FROM assessments WHERE id=? AND user_id=?", (id, user["id"])).fetchone()
    if not row:
        raise HTTPException(404, "チェックが見つかりません")
    return json.loads(row["state"])


def public(id: str, state: dict) -> dict:
    q = state.get("question")
    allowed = (
        "id",
        "prompt",
        "choices",
        "question_type",
        "diagram",
        "memory_seconds",
        "recall",
        "format",
        "language",
    )
    result = state.get("result")
    return dict(
        id=id,
        status=state["status"],
        answered=len(state["history"]),
        mode=state["mode"],
        question={k: q[k] for k in allowed if k in q} if q else None,
        result={k: result[k] for k in ("profile", "recommendations", "limitations")} if result else None,
    )


async def next_question(state: dict, settings: dict):
    q, reason = select_for_preferences(state["history"], state["preferences"])
    # At most 25% bounded generated tasks; anchors and paired trials remain primary.
    if (
        len(state["history"]) >= 6
        and len(state["history"]) % 4 == 3
        and not state["history"][-1]["question"].get("pair")
        and state["preferences"].get("japanese_reading", "comfortable") == "comfortable"
        and state["preferences"].get("language", "ja") != "ja-easy"
    ):
        try:
            generated = await asyncio.wait_for(QuestionGeneratorAgent().generate(state, settings), timeout=10)
        except TimeoutError:
            generated = None
        if generated:
            q, reason = generated, "適応生成枠：検証可能な短い指示の追加確認"
    # Rotate answer positions without changing selection or the canonical bank version.
    offset = int(
        hashlib.sha256(f"{state.get('nonce', '')}:{len(state['history'])}:{q['id']}".encode()).hexdigest()[
            :8
        ],
        16,
    ) % len(q["choices"])
    n = len(q["choices"])
    q["choices"] = q["choices"][offset:] + q["choices"][:offset]
    answer = q["correct_answer"]
    q["correct_answer"] = (
        [(v - offset) % n for v in answer] if isinstance(answer, list) else (answer - offset) % n
    )
    state.update(question=q, selection_reason=reason, issued_at=time.time())


def router(current_user, admin, settings_from_db):
    routes = APIRouter(prefix="/api")

    @routes.post("/assessments")
    async def start(body: Start, user: dict = Depends(current_user)):
        id = uid()
        preferences = body.preferences.model_dump()
        preferences["japanese_reading"] = body.preferences.japanese_reading or {
            "ja": "comfortable",
            "ja-easy": "kana",
        }.get(body.preferences.language, "none")
        state: dict = dict(
            mode=body.mode,
            nonce=id,
            preferences=preferences,
            history=[],
            status="active",
            started=time.time(),
            skills={},
        )
        await next_question(state, settings_from_db())
        with connect() as db:
            db.execute(
                "INSERT INTO assessments VALUES(?,?,?,?,?)", (id, user["id"], encode(state), now(), now())
            )
        return public(id, state)

    @routes.get("/assessments/{id}")
    def get(id: str, user: dict = Depends(current_user)):
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            state = owned(db, id, user)
            # Recover a process interruption during candidate generation using a bank item.
            if (
                state["status"] == "selecting"
                and time.time() - state.get("selecting_started", state["issued_at"]) > 30
            ):
                try:
                    q, reason = select_for_preferences(state["history"], state["preferences"])
                    state.update(status="active", question=q, selection_reason=reason, issued_at=time.time())
                except ValueError:
                    state.update(
                        status="complete",
                        question=None,
                        stop_reason="bank_exhausted",
                        result=recommend(state["history"], state["preferences"], json.loads(user["profile"])),
                    )
                save(db, id, state)
            return public(id, state)

    @routes.post("/assessments/{id}/answers")
    async def answer(id: str, body: Answer, user: dict = Depends(current_user)):
        # Claim the question in a short transaction before awaiting an external provider.
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            state = owned(db, id, user)
            q = state.get("question")
            if state["status"] != "active" or not q or q["id"] != body.question_id:
                raise HTTPException(409, "現在の質問を読み直してください")
            values = body.answer if isinstance(body.answer, list) else [body.answer]
            if any(isinstance(v, bool) or v not in range(len(q["choices"])) for v in values):
                raise HTTPException(422, "選択肢が正しくありません")
            if not body.skipped and (
                (
                    q["question_type"] == "sequence"
                    and (
                        not isinstance(body.answer, list) or sorted(values) != list(range(len(q["choices"])))
                    )
                )
                or (q["question_type"] != "sequence" and not isinstance(body.answer, int))
            ):
                raise HTTPException(422, "回答形式が正しくありません")
            wall_ms = max(0, int((time.time() - state["issued_at"]) * 1000))
            record = dict(
                question=q,
                answer=body.answer,
                correct=None if body.skipped else body.answer == q["correct_answer"],
                skipped=body.skipped,
                shown_at=body.shown_at.isoformat(),
                answered_at=now(),
                response_time_ms=min(body.response_time_ms, wall_ms),
                interrupted=body.interrupted,
                selection_reason=state["selection_reason"],
            )
            state["history"].append(record)
            state["skills"] = estimates(state["history"])
            record["posterior"] = state["skills"][q["skill_tags"][0]]
            state.update(status="selecting", question=None, selecting_started=time.time())
            save(db, id, state)
        reason = should_stop(state["history"], state["mode"], time.time() - state["started"], state["preferences"])
        try:
            if not reason:
                await next_question(state, settings_from_db())
        except ValueError:
            reason = "bank_exhausted"
        if reason:
            state.update(
                status="complete",
                stop_reason=reason,
                question=None,
                result=recommend(state["history"], state["preferences"], json.loads(user["profile"])),
            )
        else:
            state["status"] = "active"
        with connect() as db:
            save(db, id, state)
        return public(id, state)

    @routes.post("/assessments/{id}/finish")
    def finish(id: str, user: dict = Depends(current_user)):
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            state = owned(db, id, user)
            if state["status"] == "selecting":
                raise HTTPException(409, "次の質問を準備しています")
            if state["status"] != "complete":
                state.update(
                    status="complete",
                    question=None,
                    stop_reason="user_finished",
                    result=recommend(state["history"], state["preferences"], json.loads(user["profile"])),
                )
                save(db, id, state)
        return public(id, state)

    @routes.post("/assessments/{id}/apply")
    def apply(id: str, user: dict = Depends(current_user)):
        with connect() as db:
            state = owned(db, id, user)
            if state["status"] != "complete":
                raise HTTPException(409, "チェックを終えてから適用してください")
            profile = state["result"]["profile"]
            # Consent is never inferred from answers, nor restored from an old assessment.
            profile["telemetry_consent"] = json.loads(user["profile"]).get("telemetry_consent", False)
            db.execute("UPDATE users SET profile=? WHERE id=?", (encode(profile), user["id"]))
            audit(db, user["id"], "assessment_applied", id)
        return profile

    @routes.get("/admin/assessments/{user_id}")
    def debug(user_id: str, user: dict = Depends(admin)):
        with connect() as db:
            audit(db, user["id"], "assessment_viewed", user_id)
            rows = db.execute(
                "SELECT * FROM assessments WHERE user_id=? ORDER BY created_at DESC LIMIT 10", (user_id,)
            ).fetchall()
            return dict(
                labels=SKILLS,
                sessions=[
                    dict(id=r["id"], created_at=r["created_at"], **json.loads(r["state"])) for r in rows
                ],
            )

    @routes.get("/admin/question-bank")
    def bank(user: dict = Depends(admin)):
        with connect() as db:
            reviews = {
                (r["question_id"], r["version"]): dict(r)
                for r in db.execute("SELECT * FROM question_reviews")
            }
        return [{**q, "human_review": reviews.get((q["id"], q["version"]))} for q in BANK]

    @routes.post("/admin/question-bank/{question_id}/review")
    def review(question_id: str, user: dict = Depends(admin)):
        q = next((q for q in BANK if q["id"] == question_id), None)
        if not q:
            raise HTTPException(404, "問題が見つかりません")
        with connect() as db:
            db.execute(
                "INSERT OR REPLACE INTO question_reviews VALUES(?,?,?,?)",
                (question_id, q["version"], user["id"], now()),
            )
            audit(db, user["id"], "question_reviewed", question_id, {"version": q["version"]})
        return {"ok": True}

    @routes.post("/presentation-events")
    def event(body: Event, user: dict = Depends(current_user)):
        if not json.loads(user["profile"]).get("telemetry_consent"):
            raise HTTPException(403, "表示改善の記録に同意していません")
        with connect() as db:
            db.execute(
                "INSERT INTO presentation_events VALUES(?,?,?,?,?)",
                (uid(), user["id"], body.kind, body.value, now()),
            )
            db.execute(
                "DELETE FROM presentation_events WHERE user_id=? AND id NOT IN (SELECT id FROM presentation_events WHERE user_id=? ORDER BY created_at DESC LIMIT 500)",
                (user["id"], user["id"]),
            )
        return {"ok": True}

    @routes.get("/presentation-suggestions")
    def suggestions(user: dict = Depends(current_user)):
        if not json.loads(user["profile"]).get("telemetry_consent"):
            return []
        with connect() as db:
            rows = db.execute(
                "SELECT kind,COUNT(*) AS n,MAX(value) AS value FROM presentation_events WHERE user_id=? GROUP BY kind",
                (user["id"],),
            ).fetchall()
        return (
            [
                {
                    "message": "1手順ずつ、少し大きな文字で確認してみますか？",
                    "profile_patch": {"steps_per_screen": 1, "font_scale": 1.3},
                }
            ]
            if any(r["n"] >= 3 and r["kind"] in ("back", "font", "source") for r in rows)
            else []
        )

    return routes
