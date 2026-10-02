"""Finite-grid Bayesian item model and within-person presentation comparisons."""

import math
from copy import deepcopy
from .assessment_bank import BANK, BY_ID, SKILLS
from .models import Profile

GRID = [i / 40 for i in range(41)]
CORE = [
    "hiragana_reading",
    "kanji_reading",
    "instruction_comprehension",
    "negation_comprehension",
    "sentence_comprehension",
    "diagram_comprehension",
]


def likelihood(theta: float, q: dict) -> float:
    guessing = 1 / max(2, len(q["choices"])) if q["question_type"] != "sequence" else 1 / 6
    return guessing + (1 - guessing - 0.03) / (
        1 + math.exp(-7 * q["discrimination"] * (theta - q["difficulty"]))
    )


def entropy(weights: list[float]) -> float:
    return -sum(p * math.log(p) for p in weights if p > 0)


def posterior(history: list[dict], skill: str) -> dict:
    weights = [1 / len(GRID)] * len(GRID)
    answers = [a for a in history if skill in a["question"]["skill_tags"] and a.get("correct") is not None]
    for a in answers:
        weights = [
            w * (likelihood(t, a["question"]) if a["correct"] else 1 - likelihood(t, a["question"]))
            for t, w in zip(GRID, weights)
        ]
        total = sum(weights)
        weights = [w / total for w in weights]
    estimate = sum(t * w for t, w in zip(GRID, weights))
    variance = sum(w * (t - estimate) ** 2 for t, w in zip(GRID, weights))
    return dict(
        estimate=estimate,
        confidence=max(0, 1 - variance / 0.0875),
        samples=len(answers),
        weights=weights,
        average_response_time_ms=sum(a["response_time_ms"] for a in answers) / max(1, len(answers)),
    )


def estimates(history: list[dict]) -> dict:
    return {s: {k: v for k, v in posterior(history, s).items() if k != "weights"} for s in SKILLS}


def information_gain(q: dict, weights: list[float]) -> float:
    probabilities = [likelihood(t, q) for t in GRID]
    yes = sum(w * p for w, p in zip(weights, probabilities))
    a = [w * p / yes for w, p in zip(weights, probabilities)]
    b = [w * (1 - p) / (1 - yes) for w, p in zip(weights, probabilities)]
    return entropy(weights) - yes * entropy(a) - (1 - yes) * entropy(b)


def select(history: list[dict]) -> tuple[dict, str]:
    seen = {a["question"]["id"] for a in history}
    # Begin with easy, comprehensible anchors; complete matched comparisons together.
    for id in ("hiragana", "kanji-basic", "instruction", "visual-text", "visual-mixed", "visual-visual"):
        if id not in seen:
            return deepcopy(BY_ID[id]), "初期スクリーニング・図と文章の比較"
    if history:
        last = history[-1]["question"]
        if last.get("pair"):
            for q in BANK:
                if q.get("pair") == last["pair"] and q["id"] not in seen:
                    return deepcopy(q), "同じ内容の表示形式を比較"
    # Follow the initial kanji item with calibrated levels before comparing notation.
    if "kanji-mid" not in seen:
        return deepcopy(BY_ID["kanji-mid"]), "初期の漢字表記から難易度を段階的に確認"
    if "kanji-hard" not in seen and "kanji-ruby" not in seen:
        p = posterior(history, "kanji_reading")
        id = "kanji-hard" if p["estimate"] >= 0.6 else "kanji-ruby"
        return deepcopy(BY_ID[id]), f"漢字表記の事後推定 {p['estimate']:.2f} に応じた難易度確認"
    candidates = [
        q
        for q in BANK
        if q["id"] not in seen
        and not (
            q.get("format") in ("short", "split", "highlight")
            and not any(a["question"].get("pair") == q.get("pair") for a in history)
        )
    ]
    if not candidates:
        raise ValueError("bank_exhausted")
    scores = []
    for q in candidates:
        p = posterior(history, q["skill_tags"][0])
        score = information_gain(q, p["weights"]) + (
            0.18 if not p["samples"] and q["skill_tags"][0] in CORE else 0.07 if not p["samples"] else 0
        )
        scores.append((score, q, p))
    _, q, p = max(scores, key=lambda x: x[0])
    return deepcopy(
        q
    ), f"未測定領域と期待情報利得を優先。確信度 {p['confidence']:.2f}、難易度 {q['difficulty']:.2f}"


def should_stop(history: list[dict], mode: str, elapsed: float, preferences: dict | None = None) -> str | None:
    stats = estimates(history)
    minimum = 12 if mode == "quick" else 20
    required = CORE if mode == "quick" else list(SKILLS)
    if preferences and (preferences.get("japanese_reading", "comfortable") != "comfortable" or preferences.get("language") == "ja-easy"):
        required = [s for s in required if s not in ("hiragana_reading", "katakana_reading", "kanji_reading", "vocabulary_comprehension")]
    threshold = 0.22 if mode == "quick" else 0.45
    if (
        len(history) >= minimum
        and all(stats[s]["samples"] and stats[s]["confidence"] >= 0.08 for s in required)
        and sum(stats[s]["confidence"] for s in required) / len(required) >= threshold
    ):
        return "confidence_reached"
    if elapsed >= (180 if mode == "quick" else 600):
        return "time_budget"
    if len(history) >= (24 if mode == "quick" else len(BANK) + 10):
        return "question_budget"
    return None


def comparison(history: list[dict], pair: str, baseline: str, supported: str) -> dict:
    def matches(fmt):
        return [
            a
            for a in history
            if a["question"].get("pair") == pair
            and a["question"].get("format") == fmt
            and a.get("correct") is not None
        ]

    a, b = matches(baseline), matches(supported)
    if not a or not b:
        return dict(gain=0.0, measured=False, samples=0, time_gain=0.0)
    accuracy = sum(x["correct"] for x in b) / len(b) - sum(x["correct"] for x in a) / len(a)
    # Time is only comparable within a person, on correct, uninterrupted paired trials.
    ta = [
        x["response_time_ms"]
        for x in a
        if x["correct"] and not x.get("interrupted") and x["response_time_ms"] >= 500
    ]
    tb = [
        x["response_time_ms"]
        for x in b
        if x["correct"] and not x.get("interrupted") and x["response_time_ms"] >= 500
    ]
    speed = max(-1.0, min(1.0, 1 - (sum(tb) / len(tb)) / (sum(ta) / len(ta)))) if ta and tb else 0.0
    return dict(gain=accuracy + 0.25 * speed, measured=True, samples=len(a) + len(b), time_gain=speed)


def recommend(history: list[dict], preferences: dict, base: dict) -> dict:
    stats = estimates(history)
    gains = {
        "furigana": comparison(history, "furigana", "plain", "supported"),
        "short": comparison(history, "density", "long", "short"),
        "visual": comparison(history, "visual", "text", "mixed"),
        "diagram": comparison(history, "visual", "text", "visual"),
        "memory": comparison(history, "memory", "plain", "split"),
        "warning": comparison(history, "warning", "plain", "highlight"),
    }

    def supported(skill):
        return stats[skill]["samples"] == 0 or stats[skill]["estimate"] < 0.5

    short = (
        preferences.get("short", True) or gains["short"]["gain"] > 0.05 or supported("sentence_comprehension")
    )
    ruby = (
        preferences.get("furigana", False) or gains["furigana"]["gain"] > 0.05 or supported("kanji_reading")
    )
    visual = max(0.15, min(1.0, 0.35 + 0.35 * preferences.get("visual", 0.5) + 0.4 * gains["visual"]["gain"]))
    localized = preferences.get("japanese_reading", "comfortable") != "comfortable" or preferences.get("language") == "ja-easy"
    if preferences.get("japanese_reading") == "none":
        ruby = False
    if supported("instruction_comprehension" if localized else "hiragana_reading"):
        visual = max(0.8, visual)
    one = (
        short
        or supported("negation_comprehension")
        or supported("sequence_comprehension")
        or gains["memory"]["gain"] > 0.05
    )
    profile = Profile.model_validate(base).model_dump()
    profile.update(
        preferred_sentence_length="short" if short else "normal",
        text_complexity=0.3 if short else 0.7,
        furigana=ruby,
        use_furigana=ruby,
        visual_support=visual,
        prefer_images=visual >= 0.6,
        preferred_information_style="visual" if visual >= 0.6 else "text",
        step_granularity=1.0 if one else 0.4,
        working_memory_support=0.9 if one else 0.3,
        max_sentence_chars=28 if short else 70,
        steps_per_screen=1 if one else 3,
        font_scale=preferences.get("font_scale", 1.2),
        line_spacing=preferences.get("line_spacing", 1.7),
        highlight_warnings=True,
        highlight_level=1.0,
        rewrite_negation_when_safe=supported("negation_comprehension"),
        negation_support=0.9 if supported("negation_comprehension") else 0.3,
        use_bullets=True,
        language=preferences.get("language", "ja"),
        japanese_reading=preferences.get("japanese_reading", "comfortable"),
    )
    return dict(
        profile=profile,
        performance=gains,
        visual_support_effect=gains["visual"]["gain"],
        text_support_effect=-gains["visual"]["gain"],
        skills=stats,
        preferences=preferences,
        recommendations=[
            *( ["選んだ言語で表示を案内"] if localized else [] ),
            "短い文章" if short else "まとまりのある文章",
            "1手順ずつ表示" if one else "3手順をまとめて表示",
            "漢字にふりがな" if ruby else "日本語の読みは今回は確認しません" if localized else "通常の漢字表記",
            "図と文章を併用" if visual >= 0.6 else "文章を中心に表示",
            "注意事項を強調",
        ],
        limitations="日本語の読みやすさは今回は測っていません。選んだ言語での表示の好みを確認しました。"
        if preferences.get("japanese_reading", "comfortable") != "comfortable"
        or preferences.get("language") == "ja-easy"
        else "少数の仮想問題からの暫定的な表示提案です。同じ内容の繰り返しによる練習効果も含みます。",
    )
