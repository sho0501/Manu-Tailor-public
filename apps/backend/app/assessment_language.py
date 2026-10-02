"""Localized trials do not count as observations of Japanese reading."""

import json
from pathlib import Path
from copy import deepcopy

from .assessment_bank import BANK, features
from .assessment_engine import information_gain, posterior, select


def select_for_preferences(history: list[dict], preferences: dict) -> tuple[dict, str]:
    locale = preferences.get("language", "ja")
    reading = preferences.get("japanese_reading", "comfortable")
    if reading == "comfortable" and locale != "ja-easy":
        q, reason = select(history)
        q["language"] = "ja"
        return q, reason
    target = "ja-easy" if locale in ("ja", "ja-easy", "other") else locale
    translations = json.loads(
        Path(__file__).with_name("localized_questions.json").read_text(encoding="utf-8")
    )[target]
    seen = {a["question"]["id"] for a in history}
    pool = []
    for source in BANK:
        if source["id"] in seen or source["id"] not in translations:
            continue
        q = deepcopy(source)
        q.update(translations[q["id"]])
        q.update(
            language=target,
            origin="localized_bank",
            calibration_status="localized_provisional",
            review_status="machine_translation_reviewed_pending_human_review",
        )
        q["features"] = features(q)
        pool.append(q)
    if not pool:
        raise ValueError("bank_exhausted")
    for id in ("instruction", "visual-text", "visual-mixed", "visual-visual"):
        for q in pool:
            if q["id"] == id:
                return q, "希望言語で初期確認。日本語の読みは未測定として保持。"
    if history and history[-1]["question"].get("pair"):
        paired = [q for q in pool if q.get("pair") == history[-1]["question"].get("pair")]
        if paired:
            return paired[0], "希望言語内で同じ内容の表示形式を比較"
    candidates = [
        q
        for q in pool
        if q.get("format") not in ("short", "split", "highlight")
        or any(a["question"].get("pair") == q.get("pair") for a in history)
    ]
    q = max(candidates, key=lambda q: information_gain(q, posterior(history, q["skill_tags"][0])["weights"]))
    return q, "希望言語内の期待情報利得で選択。日本語力との比較はしない。"
