"""Versioned, bounded virtual tasks. Calibration is provisional, not a clinical scale."""

import re

SKILLS = {
    "hiragana_reading": "ひらがな",
    "katakana_reading": "カタカナ",
    "kanji_reading": "漢字表記",
    "vocabulary_comprehension": "語彙",
    "sentence_comprehension": "文章量",
    "instruction_comprehension": "指示",
    "negation_comprehension": "否定表現",
    "conditional_comprehension": "条件",
    "sequence_comprehension": "順序",
    "numeracy": "数字",
    "units": "単位",
    "time": "時刻",
    "diagram_comprehension": "図と文章",
    "icon_recognition": "アイコン",
    "warning_recognition": "注意表示",
    "memory_support": "一度の情報量",
}


def features(q: dict) -> dict:
    text = q["prompt"]
    kanji = re.findall(r"[一-龯]", text)
    sentences = max(1, len(re.findall(r"[。！？\n]", text)))
    return dict(
        character_count=len(text),
        sentence_count=sentences,
        kanji_ratio=len(kanji) / max(1, len(text)),
        unique_kanji_count=len(set(kanji)),
        average_sentence_length=len(text) / sentences,
        number_count=len(re.findall(r"\d+", text)),
        unit_count=len(re.findall(r"kg|mm|cm|分|秒|個", text)),
        negation_count=len(re.findall(r"ない|禁止", text)),
        step_count=q.get("steps", 1),
        image_present=bool(q.get("diagram")),
        choice_count=len(q["choices"]),
    )


def item(id: str, skill: str, difficulty: float, prompt: str, choices: list[str], answer=0, **extra) -> dict:
    q = dict(
        id=id,
        version=1,
        language="ja",
        skill_tags=[skill],
        difficulty=difficulty,
        discrimination=1.6,
        question_type="multiple_choice",
        prompt=prompt,
        choices=choices,
        correct_answer=answer,
        explanation=choices[answer] if isinstance(answer, int) else "表示の順序",
        estimated_time_sec=10,
        validated=True,
        review_status="curated_pending_human_review",
        origin="bank",
        **extra,
    )
    q["features"] = features(q)
    q["kanji_category"] = (
        "workplace_vocabulary"
        if difficulty >= 0.7
        else "common_words"
        if difficulty >= 0.4
        else "basic_words"
    )
    q["calibration_status"] = "provisional_not_grade_assessment"
    return q


BANK = [
    item(
        "hiragana",
        "hiragana_reading",
        0.1,
        "『はこを あけてください』。何をしますか？",
        ["はこを あける", "はこを とじる", "はこを おく"],
    ),
    item("kanji-basic", "kanji_reading", 0.15, "『右』の読み方は？", ["みぎ", "ひだり", "うえ"]),
    item(
        "instruction",
        "instruction_comprehension",
        0.15,
        "『赤いボタンを押す』という説明です。どのボタンですか？",
        ["赤いボタン", "青いボタン", "白いボタン"],
    ),
    item("kanji-mid", "kanji_reading", 0.45, "『確認』の読み方は？", ["かくにん", "かくじん", "こうにん"]),
    item(
        "kanji-hard",
        "kanji_reading",
        0.8,
        "『使用前に装置を点検する』。最初に何をしますか？",
        ["装置の状態を調べる", "使用を終える", "装置をしまう"],
        pair="furigana",
        format="plain",
    ),
    item(
        "kanji-ruby",
        "kanji_reading",
        0.35,
        "『使用前（つかうまえ）に装置（きかい）を点検（しらべる）する』。最初に何をしますか？",
        ["きかいの状態を調べる", "使用を終える", "きかいをしまう"],
        pair="furigana",
        format="supported",
    ),
    item(
        "katakana", "katakana_reading", 0.2, "『スタート』と同じ言葉は？", ["スタート", "ストップ", "セット"]
    ),
    item(
        "vocabulary",
        "vocabulary_comprehension",
        0.5,
        "『回収』は使ったものを集めることです。回収するのはどれ？",
        ["使った紙を集める", "新しい紙を出す", "紙を使う"],
    ),
    item(
        "negation",
        "negation_comprehension",
        0.4,
        "仮想の説明『電源を切らないでください』。説明と合うのは？",
        ["電源を切らない", "電源を切る"],
    ),
    item(
        "condition",
        "conditional_comprehension",
        0.65,
        "仮想の説明『ランプがつくまでボタンを押さない』。押せるのは？",
        ["ランプがついた後", "ランプがつく前"],
    ),
    item(
        "sequence",
        "sequence_comprehension",
        0.35,
        "説明の順にカードを並べてください。①箱を開ける ②中身を出す ③箱を片付ける",
        ["中身を出す", "箱を片付ける", "箱を開ける"],
        [2, 0, 1],
        steps=3,
    ),
    item(
        "sequence-before",
        "sequence_comprehension",
        0.6,
        "箱を片付ける前に中身を出します。先にするのは？",
        ["中身を出す", "箱を片付ける"],
    ),
    item("number", "numeracy", 0.25, "紙を12枚用意する説明です。何枚ですか？", ["12枚", "21枚", "2枚"]),
    item("unit", "units", 0.4, "1kgは1000gです。2kgと同じ重さは？", ["2000g", "200g", "20g"]),
    item("time", "time", 0.45, "10時から10分待ちます。終わる時刻は？", ["10時10分", "10時01分", "11時"]),
    item("icon", "icon_recognition", 0.25, "🔊 は音が出る印です。音の印は？", ["🔊", "📄", "📦"]),
]

for fmt, prompt in [
    ("long", "箱を開けて中身を出した後、箱を片付けてから机を拭きます。"),
    ("short", "1. 箱を開ける。\n2. 中身を出す。\n3. 箱を片付ける。\n4. 机を拭く。"),
]:
    BANK.append(
        item(
            "density-" + fmt,
            "sentence_comprehension",
            0.5,
            prompt + "最後にするのは？",
            ["机を拭く", "箱を開ける", "中身を出す"],
            pair="density",
            format=fmt,
            steps=4,
        )
    )
for fmt, prompt in [
    ("text", "青い箱は机の右側、赤い箱は左側に置く説明です。"),
    ("mixed", "青い箱は右側です。図も見てください。"),
    ("visual", "図を見てください。"),
]:
    BANK.append(
        item(
            "visual-" + fmt,
            "diagram_comprehension",
            0.35,
            prompt + "青い箱はどちら？",
            ["右側", "左側"],
            pair="visual",
            format=fmt,
            diagram=fmt != "text",
        )
    )
for fmt, prompt in [
    ("plain", "青い箱を取り、机の右側に置く。"),
    ("split", "1. 青い箱を取る。\n2. 机の右側に置く。"),
]:
    BANK.append(
        item(
            "memory-" + fmt,
            "memory_support",
            0.5,
            prompt,
            ["机の右側", "机の左側", "棚の中"],
            pair="memory",
            format=fmt,
            memory_seconds=5,
            recall="箱をどこに置きますか？",
            steps=2,
        )
    )
for fmt in ("plain", "highlight"):
    BANK.append(
        item(
            "warning-" + fmt,
            "warning_recognition",
            0.4,
            "箱を開けます。注意：中のカードを残してください。箱を片付けます。残すものは？",
            ["カード", "箱", "どちらも残さない"],
            pair="warning",
            format=fmt,
        )
    )
for q in BANK:
    if isinstance(q["correct_answer"], list):
        q["question_type"] = "sequence"

BY_ID = {q["id"]: q for q in BANK}
