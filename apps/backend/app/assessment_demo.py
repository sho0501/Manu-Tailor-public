"""Clearly marked simulated users; never mixed into real training data."""

import secrets
import json
from .assessment_bank import BANK
from .assessment_engine import estimates, recommend
from .db import connect, encode, now, password_hash, uid, audit
from .models import Document, Profile
from .providers import MockAIProvider
from .validation import inspect


def demo_history(case: str) -> list[dict]:
    history: list[dict] = []
    for q in BANK:
        correct = True
        ms = 3500
        if case == "A":
            ms = 12000 if q["id"] == "kanji-hard" else 3500
        if case == "C":
            correct = q["id"] not in (
                "negation",
                "condition",
                "memory-plain",
                "warning-plain",
                "density-long",
            )
        if case == "D":
            correct = q.get("format") in ("supported", "mixed", "visual", "short", "split", "highlight")
        answer = q["correct_answer"] if correct else (1 if q["correct_answer"] == 0 else 0)
        history.append(
            dict(
                question=q,
                correct=correct,
                answer=answer,
                response_time_ms=ms,
                shown_at=now(),
                answered_at=now(),
                interrupted=False,
                selection_reason="合成データによる表示デモ。実測ではありません。",
                posterior=estimates(history + [dict(question=q, correct=correct, response_time_ms=ms)])[
                    q["skill_tags"][0]
                ],
            )
        )
    return history


def seed_assessment_demos():
    with connect() as db:
        for case in "ABCD":
            username = "assessment-" + case.lower()
            if db.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone():
                continue
            history = demo_history(case)
            preferences = dict(
                short=case != "B",
                visual=0 if case == "B" else 0.8,
                language="ja",
                font_scale=1.2,
                line_spacing=1.7,
            )
            result = recommend(history, preferences, {})
            id, salt = uid(), secrets.token_hex(16)
            db.execute(
                "INSERT INTO users VALUES(?,?,?,?,?,?,?)",
                (
                    id,
                    f"表示デモ {case}（合成）",
                    username,
                    "user",
                    salt,
                    password_hash("manutailor-demo", salt),
                    encode(result["profile"]),
                ),
            )
            state = dict(
                mode="detailed",
                history=history,
                preferences=preferences,
                skills=estimates(history),
                status="complete",
                question=None,
                result=result,
                stop_reason="simulated_demo",
                synthetic=True,
            )
            db.execute("INSERT INTO assessments VALUES(?,?,?,?,?)", (uid(), id, encode(state), now(), now()))


async def seed_assessment_manuals():
    with connect() as db:
        version = db.execute(
            "SELECT v.* FROM manual_versions v JOIN manuals m ON m.id=v.manual_id AND m.current_version=v.version WHERE m.title='コピー機でA4資料をコピーする' AND m.mode='speed' AND v.version=1 LIMIT 1"
        ).fetchone()
        if not version:
            return
        for row in db.execute(
            "SELECT * FROM users WHERE username IN ('assessment-a','assessment-b','assessment-c','assessment-d')"
        ).fetchall():
            if db.execute("SELECT id FROM generations WHERE user_id=? LIMIT 1", (row["id"],)).fetchone():
                continue
            document = Document.model_validate_json(version["document"])
            profile = Profile.model_validate(json.loads(row["profile"]))
            blocks = await MockAIProvider().generate(document, profile, [])
            report = inspect(document, blocks, "speed")
            report.llm_status = "mock_exact_text"
            report.checks["independent_validation"] = True
            id = uid()
            db.execute(
                "INSERT INTO generations VALUES(?,?,?,?,?,?,?,?,?,?)",
                (
                    id,
                    version["id"],
                    row["id"],
                    profile.model_dump_json(),
                    encode([b.model_dump() for b in blocks]),
                    report.model_dump_json(),
                    "PUBLISHED" if report.status == "pass" else "NEEDS_REVIEW",
                    encode({"generation": "mock", "validation": "mock", "synthetic": True}),
                    "synthetic-demo",
                    now(),
                ),
            )
            audit(db, "synthetic-demo", "assessment_demo_seed", id)
