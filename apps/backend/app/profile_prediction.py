"""Small optional logistic models, trained only from explicitly labelled examples.

No training is run at startup. Predictions are suggestions, never profile writes.
The Bayesian assessment remains the default until real holdout data is available.
"""

import json
import math
from pathlib import Path

FEATURE_NAMES = [
    "kanji_estimate",
    "sentence_estimate",
    "negation_estimate",
    "furigana_gain",
    "short_gain",
    "visual_gain",
    "visual_preference",
    "short_preference",
]
TARGETS = ["use_furigana", "short_sentence", "prefer_images", "one_task_per_screen", "highlight_warnings"]


def feature_vector(result: dict) -> list[float]:
    s, p, pref = result["skills"], result["performance"], result["preferences"]
    return (
        [s[k]["estimate"] for k in ("kanji_reading", "sentence_comprehension", "negation_comprehension")]
        + [p[k]["gain"] for k in ("furigana", "short", "visual")]
        + [pref.get("visual", 0.5), float(pref.get("short", True))]
    )


def probability(weights: list[float], features: list[float]) -> float:
    z = weights[0] + sum(w * x for w, x in zip(weights[1:], features))
    return 1 / (1 + math.exp(-max(-30.0, min(30.0, z))))


class ProfilePredictionModel:
    def __init__(self, model: dict):
        if model.get("features") != FEATURE_NAMES or model.get("version") != 1:
            raise ValueError("モデルの特徴量または版が一致しません")
        self.model = model

    def predict(self, result: dict) -> dict:
        x = feature_vector(result)
        return {k: probability(w, x) for k, w in self.model["weights"].items()}

    def save(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.model, ensure_ascii=False, indent=2), encoding="utf-8")

    @classmethod
    def train(cls, rows: list[dict]):
        # Group separation prevents repeated trials from one person leaking into holdout.
        groups = sorted({r["group"] for r in rows})
        if len(rows) < 50 or len(groups) < 10:
            raise ValueError("同意済み・ラベル付き50件、異なる10利用者以上が必要です")
        if any(
            not r.get("consent")
            or len(r["features"]) != len(FEATURE_NAMES)
            or any(not math.isfinite(x) or abs(x) > 2 for x in r["features"])
            for r in rows
        ):
            raise ValueError("同意または特徴量を確認してください")
        held_out = set(groups[::5])
        train = [r for r in rows if r["group"] not in held_out]
        test = [r for r in rows if r["group"] in held_out]
        weights, metrics = {}, {}
        for target in TARGETS:
            if any(type(r["targets"].get(target)) is not bool for r in rows):
                raise ValueError("表示形式ごとの人間による適合ラベルが必要です")
            if len({r["targets"][target] for r in train}) < 2:
                raise ValueError("学習側に両方の適合ラベルが必要です")
            w = [0.0] * (len(FEATURE_NAMES) + 1)
            for _ in range(600):
                gradient = [0.0] * len(w)
                for r in train:
                    error = probability(w, r["features"]) - r["targets"][target]
                    for j, x in enumerate([1.0] + r["features"]):
                        gradient[j] += error * x
                w = [
                    v - 0.15 * (g / len(train) + (0.01 * v if j else 0))
                    for j, (v, g) in enumerate(zip(w, gradient))
                ]
            weights[target] = w
            metrics[target] = dict(
                brier_score=sum((probability(w, r["features"]) - r["targets"][target]) ** 2 for r in test)
                / len(test),
                holdout_samples=len(test),
            )
        return cls(
            dict(
                version=1,
                features=FEATURE_NAMES,
                weights=weights,
                metrics=metrics,
                automatic_application=False,
            )
        )


if __name__ == "__main__":
    import argparse
    from .config import ROOT

    parser = argparse.ArgumentParser(description="同意済みの表示適合データから小規模モデルを学習")
    parser.add_argument("dataset", type=Path)
    args = parser.parse_args()
    model = ProfilePredictionModel.train(json.loads(args.dataset.read_text(encoding="utf-8")))
    model.save(ROOT / "models" / "profile" / "logistic-v1.json")
    print(json.dumps(model.model["metrics"], ensure_ascii=False, indent=2))
