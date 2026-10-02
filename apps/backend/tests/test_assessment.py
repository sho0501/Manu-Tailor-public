from copy import deepcopy
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.assessment_bank import BY_ID
from app.assessment_engine import comparison, estimates, posterior, recommend, select, should_stop
from app.assessment_questions import QuestionValidator, QuestionGeneratorAgent
from app.assessment_demo import demo_history
from app.assessment_language import select_for_preferences
from app.profile_prediction import ProfilePredictionModel, FEATURE_NAMES, TARGETS, feature_vector


def observation(id, correct=True, ms=4000, **extra):
    return dict(question=deepcopy(BY_ID[id]), correct=correct, response_time_ms=ms, **extra)


def test_bayesian_update_uses_difficulty_not_correct_ratio_or_speed():
    easy = posterior([observation("kanji-basic")], "kanji_reading")
    hard = posterior([observation("kanji-hard")], "kanji_reading")
    assert hard["estimate"] > easy["estimate"]
    assert 0 < easy["confidence"] < 1
    assert posterior([observation("kanji-basic", ms=60000)], "kanji_reading") == {
        **easy,
        "average_response_time_ms": 60000,
    }
    assert estimates([])["kanji_reading"]["samples"] == 0


def test_kanji_difficulty_progression_and_supported_followup():
    history = []
    ids = []
    for _ in range(9):
        q, reason = select(history)
        ids.append(q["id"])
        history.append(dict(question=q, correct=q["id"] != "kanji-hard", response_time_ms=4000))
        assert reason
    assert (
        ids.index("kanji-basic") < ids.index("kanji-mid") < ids.index("kanji-hard") < ids.index("kanji-ruby")
    )
    assert recommend(history, {}, {})["profile"]["furigana"]


def test_within_person_comparison_ignores_interruptions_and_separates_preference():
    history = [
        observation("density-long", ms=8400),
        observation("density-short", ms=3200),
        observation("visual-text", False),
        observation("visual-mixed"),
    ]
    gain = comparison(history, "density", "long", "short")
    assert gain["time_gain"] > 0.5
    history[0]["interrupted"] = True
    assert comparison(history, "density", "long", "short")["time_gain"] == 0
    result = recommend(history, {"visual": 0, "short": False}, {})
    assert result["preferences"]["visual"] == 0
    assert result["performance"]["visual"]["gain"] == 1
    assert result["profile"]["visual_support"] >= 0.7


def test_stop_requires_coverage_and_uncertainty_reduction():
    assert should_stop([], "quick", 0) is None
    assert should_stop([observation("kanji-hard")] * 12, "quick", 0) is None
    h = []
    for _ in range(24):
        q, _ = select(h)
        h.append(dict(question=q, correct=True, response_time_ms=3000))
        if should_stop(h, "quick", 0):
            break
    assert should_stop(h, "quick", 0) == "confidence_reached"
    assert len(h) < 24
    assert should_stop([], "quick", 180) == "time_budget"


def test_question_validator_rejects_free_prose_and_invalid_choices():
    target = {"target_skill": "instruction_comprehension"}
    q = QuestionValidator.validate({"color": "青", "object": "箱"}, target)
    assert len(set(q["choices"])) == len(q["choices"])
    assert q["choices"][q["correct_answer"]] == "青い箱"
    with pytest.raises(ValueError):
        QuestionValidator.validate({"color": "青", "object": "薬"}, target)
    with pytest.raises(ValueError):
        QuestionValidator.validate({"color": "青", "object": "箱", "prompt": "unvalidated"}, target)


def test_generation_fallback_is_bounded(monkeypatch):
    import asyncio

    calls = []

    async def bad(*args):
        calls.append(1)
        return {"color": "unknown", "object": "箱"}

    monkeypatch.setattr("app.assessment_questions.OpenAICompatibleProvider.request", bad)
    assert (
        asyncio.run(
            QuestionGeneratorAgent().generate({"history": []}, {"generation_provider": "openai_compatible"})
        )
        is None
    )
    assert len(calls) == 2


def test_four_simulated_display_results():
    results = {
        case: recommend(demo_history(case), {"short": case != "B", "visual": 0 if case == "B" else 0.8}, {})[
            "profile"
        ]
        for case in "ABCD"
    }
    assert results["A"]["furigana"] and results["A"]["max_sentence_chars"] == 28
    assert results["B"]["steps_per_screen"] == 3
    assert results["C"]["negation_support"] > 0.8 and results["C"]["steps_per_screen"] == 1
    assert results["D"]["furigana"] and results["D"]["visual_support"] >= 0.8


def test_model_requires_consent_labels_and_group_holdout(tmp_path):
    with pytest.raises(ValueError):
        ProfilePredictionModel.train([])
    rows = []
    for group in range(12):
        for j in range(5):
            rows.append(
                dict(
                    group=str(group),
                    consent=True,
                    features=[float(j % 2)] * len(FEATURE_NAMES),
                    targets={t: bool(j % 2) for t in TARGETS},
                )
            )
    model = ProfilePredictionModel.train(rows)
    path = tmp_path / "models" / "profile" / "test.json"
    model.save(path)
    assert path.exists()
    assert all(m["brier_score"] < 0.15 for m in model.model["metrics"].values())
    result = recommend([], {}, {})
    assert len(feature_vector(result)) == len(FEATURE_NAMES)
    assert set(model.predict(result)) == set(TARGETS)
    rows[0]["consent"] = False
    with pytest.raises(ValueError):
        ProfilePredictionModel.train(rows)


def test_assessment_api_ownership_no_answer_leak_apply_and_review():
    with TestClient(app) as client:

        def login(name):
            r = client.post("/api/login", json={"username": name, "password": "manutailor-demo"}).json()
            return {"Authorization": "Bearer " + r["token"]}, r["user"]

        headers, user = login("demo")
        other, _ = login("visual")
        admin, _ = login("admin")
        assessment = client.post("/api/assessments", headers=headers, json={}).json()
        id = assessment["id"]
        assert "correct_answer" not in str(assessment) and "skills" not in assessment
        assert client.get(f"/api/assessments/{id}", headers=other).status_code == 404
        assert client.post(f"/api/assessments/{id}/apply", headers=headers).status_code == 409
        assert client.get(f"/api/admin/assessments/{user['id']}", headers=headers).status_code == 403
        body = dict(
            question_id=assessment["question"]["id"],
            answer=0,
            shown_at=datetime.now(timezone.utc).isoformat(),
            response_time_ms=1000,
        )
        assert (
            client.post(
                f"/api/assessments/{id}/answers", headers=headers, json={**body, "answer": 99}
            ).status_code
            == 422
        )
        answer_response = client.post(f"/api/assessments/{id}/answers", headers=headers, json=body)
        assert answer_response.status_code == 200
        assert client.post(f"/api/assessments/{id}/answers", headers=headers, json=body).status_code == 409
        result = client.post(f"/api/assessments/{id}/finish", headers=headers).json()
        assert result["result"]["profile"]["steps_per_screen"] == 1
        applied = client.post(f"/api/assessments/{id}/apply", headers=headers)
        assert applied.status_code == 200
        debug = client.get(f"/api/admin/assessments/{user['id']}", headers=admin).json()
        assert debug["sessions"][0]["history"][0]["posterior"]["samples"] == 1
        assert client.post("/api/admin/question-bank/hiragana/review", headers=admin).status_code == 200
        assert client.get("/api/admin/question-bank", headers=admin).json()[0]["human_review"]
        from app.db import connect, now

        with connect() as db:
            db.execute(
                "INSERT OR REPLACE INTO question_reviews VALUES(?,?,?,?)",
                ("kanji-mid", 0, "previous-reviewer", now()),
            )
        current_bank = client.get("/api/admin/question-bank", headers=admin).json()
        assert next(q for q in current_bank if q["id"] == "kanji-mid")["human_review"] is None
        assert (
            client.post("/api/presentation-events", headers=headers, json={"kind": "back"}).status_code == 403
        )
        profile = applied.json()
        client.put("/api/profile", headers=headers, json={**profile, "telemetry_consent": True})
        for _ in range(3):
            assert (
                client.post("/api/presentation-events", headers=headers, json={"kind": "back"}).status_code
                == 200
            )
        assert client.get("/api/presentation-suggestions", headers=headers).json()
        assert client.get("/api/me", headers=headers).json()["profile"]["font_scale"] == profile["font_scale"]
        client.put("/api/profile", headers=headers, json={**profile, "telemetry_consent": False})
        assert client.get("/api/presentation-suggestions", headers=headers).json() == []


@pytest.mark.parametrize("language", ["en", "zh", "vi", "ja-easy"])
def test_localized_assessment_does_not_test_japanese_reading(language):
    import re

    from app.db import connect

    reading = "kana" if language == "ja-easy" else "none"
    q, _ = select_for_preferences([], {"language": language, "japanese_reading": reading})
    assert q["language"] == language
    assert q["skill_tags"][0] not in {
        "hiragana_reading", "katakana_reading", "kanji_reading", "vocabulary_comprehension"
    }
    if language == "ja-easy":
        assert not re.search(r"[一-龯]", q["prompt"] + "".join(q["choices"]))
    with TestClient(app) as client:
        user = client.post("/api/login", json={"username": "demo", "password": "manutailor-demo"}).json()
        admin = client.post("/api/login", json={"username": "admin", "password": "manutailor-demo"}).json()
        headers = {"Authorization": "Bearer " + user["token"]}
        admin_headers = {"Authorization": "Bearer " + admin["token"]}
        response = client.post("/api/assessments", headers=headers, json={"preferences": {"language": language}})
        assert response.status_code == 200
        state = response.json()
        assert state["question"]["language"] == language
        skipped = client.post(
            f"/api/assessments/{state['id']}/answers",
            headers=headers,
            json={"question_id": state["question"]["id"], "answer": 0, "skipped": True,
                  "shown_at": datetime.now(timezone.utc).isoformat(), "response_time_ms": 500},
        )
        assert skipped.status_code == 200
        with connect() as db:
            row = db.execute("SELECT state FROM assessments WHERE id=?", (state["id"],)).fetchone()
        import json
        saved = json.loads(row["state"])
        assert saved["preferences"]["japanese_frequency"] == "not_asked"
        assert saved["history"][0]["correct"] is None
        assert saved["history"][0]["posterior"]["samples"] == 0
        final = client.post(f"/api/assessments/{state['id']}/finish", headers=headers).json()
        assert final["result"]["profile"]["japanese_reading"] == reading
        assert final["result"]["profile"]["language"] == language
        debug = client.get(f"/api/admin/assessments/{user['user']['id']}", headers=admin_headers)
        assert debug.status_code == 200


def test_easy_japanese_content_has_no_kanji_and_all_locales_cover_bank():
    import json
    import re
    from pathlib import Path

    from app.assessment_bank import BANK

    root = Path(__file__).resolve().parents[3]
    questions = json.loads((root / "apps/backend/app/localized_questions.json").read_text(encoding="utf-8"))
    labels = json.loads((root / "apps/client/src/locales.json").read_text(encoding="utf-8"))
    expected = {q["id"] for q in BANK if q["skill_tags"][0] not in {
        "hiragana_reading", "katakana_reading", "kanji_reading", "vocabulary_comprehension"
    }}
    for language in ("en", "ja-easy", "zh", "vi"):
        assert set(questions[language]) == expected
    assert not re.search(r"[一-龯]", json.dumps(questions["ja-easy"], ensure_ascii=False))
    assert all(not re.search(r"[一-龯]", value) for value in labels["ja-easy"].values())
