import secrets

from .db import audit, connect, encode, now, password_hash, uid
from .ingestion import structure
from .models import Profile
from .providers import MockAIProvider
from .validation import inspect

SAMPLE = """1. コピー機の電源が入っていることを確認してください。
2. 原稿カバーを開けてください。原稿を左上の印に合わせて置いてください。
3. 原稿カバーを閉じてください。用紙サイズをA4に設定してください。
4. 部数を1部に設定してください。
5. 「スタート」ボタンを押してください。
注意：動作中は電源を切らないでください。
6. 印刷された資料を取り出してください。原稿を忘れずに回収してください。"""


async def seed():
    with connect() as db:
        if db.execute("SELECT id FROM users LIMIT 1").fetchone():
            return
        profiles = [
            ("admin", "管理者", "admin", Profile()),
            ("demo", "青木 はる", "user", Profile(font_scale=1.2)),
            (
                "visual",
                "図で確認する利用者",
                "user",
                Profile(visual_support=1, preferred_information_style="visual"),
            ),
            ("detail", "細かく確認する利用者", "user", Profile(step_granularity=1)),
            (
                "text",
                "文章で確認する利用者",
                "user",
                Profile(
                    preferred_sentence_length="normal", visual_support=0.1, preferred_information_style="text"
                ),
            ),
        ]
        user_ids = []
        for username, name, role, profile in profiles:
            user_id, salt = uid(), secrets.token_hex(16)
            db.execute(
                "INSERT INTO users VALUES(?,?,?,?,?,?,?)",
                (
                    user_id,
                    name,
                    username,
                    role,
                    salt,
                    password_hash("manutailor-demo", salt),
                    profile.model_dump_json(),
                ),
            )
            user_ids.append((user_id, role, profile))
        for title, mode, text in [
            ("コピー機でA4資料をコピーする", "speed", SAMPLE),
            (
                "台車に荷物を載せる",
                "safety",
                "1. 必ず保護メガネを装着してください。\n2. 荷物は10kgまで載せてください。\n警告：上限を超えて載せないでください。\n3. 周囲に人がいないことを確認してください。",
            ),
        ]:
            manual_id, version_id = uid(), uid()
            document = structure([(1, text)], title)
            db.execute(
                "INSERT INTO manuals(id,title,mode,current_version) VALUES(?,?,?,1)",
                (manual_id, title, mode),
            )
            db.execute(
                "INSERT INTO manual_versions VALUES(?,?,1,?,NULL,?)",
                (version_id, manual_id, document.model_dump_json(), now()),
            )
            for user_id, role, profile in user_ids:
                if role == "admin":
                    continue
                blocks = await MockAIProvider().generate(document, profile, [])
                report = inspect(document, blocks, mode)
                report.llm_status = "mock_exact_text"
                report.checks["independent_validation"] = True
                generation_id = uid()
                db.execute(
                    "INSERT INTO generations VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (
                        generation_id,
                        version_id,
                        user_id,
                        profile.model_dump_json(),
                        encode([b.model_dump() for b in blocks]),
                        report.model_dump_json(),
                        "PUBLISHED",
                        encode({"generation": "mock", "validation": "mock"}),
                        user_ids[0][0],
                        now(),
                    ),
                )
                db.execute(
                    "INSERT INTO notifications VALUES(?,?,?,?,?,?,0)",
                    (uid(), user_id, generation_id, "新しいマニュアルが届きました", "new", now()),
                )
                audit(db, user_ids[0][0], "demo_seed_published", generation_id)


if __name__ == "__main__":
    import asyncio
    from .db import init_db

    init_db()
    asyncio.run(seed())
