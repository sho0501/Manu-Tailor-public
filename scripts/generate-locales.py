"""Generate checked, bundled translations using the server's compatible provider.

Run explicitly during development. Never runs at app startup; no key goes into
the browser bundle. Only static interface text and virtual questions are sent.
"""
import json
import os
from pathlib import Path
import re
import sys
import time
import unicodedata

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "backend"))
from app.assessment_bank import BANK  # noqa: E402

load_dotenv(ROOT / ".env")
URL = os.environ["GENERATION_BASE_URL"].rstrip("/") + "/chat/completions"
MODEL = os.environ["GENERATION_MODEL"]


def request(system, payload):
    for attempt in range(6):
        r = httpx.post(URL, headers={"Authorization": "Bearer " + os.environ["GENERATION_API_KEY"]},
                       json={"model": MODEL, "temperature": 0, "max_completion_tokens": 6000, "response_format": {"type": "json_object"},
                             "messages": [{"role": "system", "content": system}, {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}]}, timeout=90)
        if r.status_code == 429 and attempt < 5:
            delay = re.search(r"try again in ([\d.]+)s", r.text)
            time.sleep(min(45, float(delay[1]) + 2 if delay else 15))
            continue
        if not r.is_success:
            detail = str(r.json().get("error", {}).get("message", ""))[:500].replace(os.environ["GENERATION_API_KEY"], "[redacted]")
            raise RuntimeError(f"Translation request HTTP {r.status_code}: {detail}")
        return json.loads(r.json()["choices"][0]["message"]["content"])
    raise RuntimeError("Translation retry limit")


def main():
    labels = set()
    for path in (ROOT / "apps/client/src").glob("*.tsx"):
        for match in re.finditer(r'\bt\(("(?:\\.|[^"\\])*")\)', path.read_text(encoding="utf-8")):
            labels.add(json.loads(match[1]))
    labels.update(["短い文章", "まとまりのある文章", "1手順ずつ表示", "3手順をまとめて表示", "漢字にふりがな", "通常の漢字表記", "図と文章を併用", "文章を中心に表示", "注意事項を強調", "少数の仮想問題からの暫定的な表示提案です。同じ内容の繰り返しによる練習効果も含みます。", "日本語の読みやすさは今回は測っていません。選んだ言語での表示の好みを確認しました。", "日本語の読解問題です。読めない場合は飛ばせます。"])
    labels.discard("英語（問題は現在日本語）")
    labels.discard("その他（問題は現在日本語）")
    labels.update(["選んだ言語で表示を案内", "日本語の読みは今回は確認しません"])
    labels.update([
        "どちらの文章が読みやすいですか？", "図と文章、どの表示がよいですか？",
        "漢字にふりがなを付けますか？", "ふりがなは必要ありません",
        "どの文字サイズが読みやすいですか？", "どの行間が読みやすいですか？",
        "どのくらい詳しく確認しますか？",
    ])
    ui_path = ROOT / "apps/client/src/locales.json"
    question_path = ROOT / "apps/backend/app/localized_questions.json"
    ui = json.loads(ui_path.read_text(encoding="utf-8")) if ui_path.exists() else {}
    questions = json.loads(question_path.read_text(encoding="utf-8")) if question_path.exists() else {}
    eligible = [q for q in BANK if q["skill_tags"][0] not in ("hiragana_reading", "katakana_reading", "kanji_reading", "vocabulary_comprehension")]
    originals = {q["id"]: {k: q[k] for k in ("prompt", "choices", "recall") if k in q} for q in eligible}
    for locale, name in {"en": "plain English", "ja-easy": "easy Japanese in hiragana (no kanji; keep numerals)", "zh": "Simplified Chinese", "vi": "Vietnamese"}.items():
        missing = {k: k for k in sorted(labels) if k not in ui.get(locale, {})}
        if missing:
            keys = list(missing)
            for start in range(0, len(keys), 35):
                batch = keys[start:start+35]
                source = {str(i): k for i,k in enumerate(batch)}
                translated = request("Translate each JSON value into " + name + ". Keep numeric keys EXACTLY unchanged. Return only the same JSON object. Use friendly, concise UI text. Preserve numbers, placeholders and meaning. Do not add medical diagnoses. Values must be plain strings without markup.", source)
                if set(translated) != set(source) or any(not isinstance(v, str) or not v.strip() for v in translated.values()):
                    raise ValueError("Invalid UI translation schema")
                ui.setdefault(locale, {}).update({k: translated[str(i)] for i,k in enumerate(batch)})
                ui_path.write_text(json.dumps(ui, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if locale not in questions:
            translated = request("Translate virtual comprehension tasks into " + name + ". Return the same JSON structure with unchanged IDs and field names. Keep the number and ORDER of choices EXACTLY. Preserve negation, numbers, units, arrows, order and correct answer meaning. Preserve differences between long/short and text/diagram variants. Never reveal answers. No actual physical actions. Translate choices too.", originals)
            if set(translated) != set(originals):
                raise ValueError("Question IDs changed")
            for id, original in originals.items():
                target = translated[id]
                if set(target) != set(original) or len(target["choices"]) != len(original["choices"]) or len(set(target["choices"])) != len(target["choices"]):
                    raise ValueError("Invalid translated choices")
                if not isinstance(target["prompt"], str) or any(not isinstance(c, str) for c in target["choices"]):
                    raise ValueError("Invalid question text")
                source_numbers = sorted(re.findall(r"\d+", unicodedata.normalize("NFKC", original["prompt"])))
                target_numbers = sorted(re.findall(r"\d+", unicodedata.normalize("NFKC", target["prompt"])))
                if source_numbers != target_numbers:
                    raise ValueError(f"Question numbers changed: {id}")
            review = request('You are an independent translation reviewer. Compare each original and translation. Verify choice ORDER preserves every original option meaning, correct answers remain correct, negation/direction/numbers remain unchanged, no answer is leaked, every task remains solvable. Return JSON {"passed": boolean, "issues": [string]}. Reject meaning changes. Do not diagnose anyone.', {"source": originals, "translated": translated})
            if review.get("passed") is not True:
                raise ValueError("Translation review rejected: " + str(review.get("issues", [])))
            questions[locale] = translated
            question_path.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(locale, "UI labels", len(ui[locale]), "questions", len(questions[locale]), "verified", flush=True)


if __name__ == "__main__":
    main()
