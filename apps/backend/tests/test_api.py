from fastapi.testclient import TestClient
import httpx
from app.main import app


def test_operation_progress_and_manual_status_are_visible_to_admin():
    with TestClient(app) as client:
        login = client.post("/api/login", json={"username": "admin", "password": "manutailor-demo"}).json()
        headers = {"Authorization": "Bearer " + login["token"]}
        created = client.post("/api/manuals", headers=headers, data={
            "title": "進捗確認", "text": "電源を入れます。", "operation_id": "upload-progress-test",
        })
        assert created.status_code == 200
        progress = client.get("/api/operations/upload-progress-test", headers=headers).json()
        assert progress == {"stage": "完了", "detail": "原文と整理後のデータを保存しました。", "percent": 100}
        listed = next(item for item in client.get("/api/manuals", headers=headers).json()
                      if item["id"] == created.json()["id"])
        assert listed["organization_status"] == "provisional"
        assert listed["incomplete_count"] == 0


def test_environment_settings_are_visible_without_exposing_keys(monkeypatch):
    monkeypatch.setenv("GENERATION_PROVIDER", "openai_compatible")
    monkeypatch.setenv("GENERATION_MODEL", "local-generation")
    monkeypatch.setenv("GENERATION_API_KEY", "private-test-value")
    with TestClient(app) as client:
        result = client.post("/api/login", json={"username": "admin", "password": "manutailor-demo"}).json()
        response = client.get("/api/settings", headers={"Authorization": "Bearer " + result["token"]})
        assert response.json()["generation_provider"] == "openai_compatible"
        assert response.json()["generation_model"] == "local-generation"
        assert "private-test-value" not in response.text


def test_primary_keys_can_be_saved_from_settings_without_being_returned():
    from app.api_credentials import primary_api_key
    from app.db import connect
    from app.main import settings_from_db
    from app.providers import FailoverProvider, get_provider

    with TestClient(app) as client:
        with connect() as db:
            old_settings = db.execute("SELECT value FROM settings WHERE key='ai'").fetchone()
            old_keys = list(db.execute("SELECT * FROM primary_api_credentials"))
        try:
            token = client.post("/api/login", json={
                "username": "admin", "password": "manutailor-demo",
            }).json()["token"]
            headers = {"Authorization": "Bearer " + token}
            current = client.get("/api/settings", headers=headers).json()
            response = client.put("/api/settings", headers=headers, json={
                **current,
                "generation_provider": "gemini",
                "validation_provider": "gemini",
                "generation_model": "gemini-test",
                "validation_model": "gemini-test",
                "generation_api_key": "secret-generation-test",
                "validation_api_key": "secret-validation-test",
            })
            assert response.status_code == 200, response.text
            fetched = client.get("/api/settings", headers=headers).json()
            assert fetched["generation_key_status"] == "saved"
            assert fetched["validation_key_status"] == "saved"
            assert "secret-generation-test" not in str(fetched)
            assert "secret-validation-test" not in str(fetched)
            assert primary_api_key("generation", "gemini") == "secret-generation-test"
            assert primary_api_key("generation", "openai_compatible") is None
            assert primary_api_key("validation", "gemini") == "secret-validation-test"
            provider = get_provider(settings_from_db(), "generation")
            selected = provider.providers[0] if isinstance(provider, FailoverProvider) else provider
            assert selected.key == "secret-generation-test"
            with connect() as db:
                saved = db.execute("SELECT value FROM settings WHERE key='ai'").fetchone()[0]
                encrypted = [row[0] for row in db.execute(
                    "SELECT encrypted_key FROM primary_api_credentials")]
            assert "secret-generation-test" not in saved + "".join(encrypted)
            unchanged = client.put("/api/settings", headers=headers, json={
                **fetched, "generation_api_key": "", "validation_api_key": "",
            })
            assert unchanged.status_code == 200
            assert primary_api_key("generation", "gemini") == "secret-generation-test"
        finally:
            with connect() as db:
                db.execute("DELETE FROM primary_api_credentials")
                db.executemany("INSERT INTO primary_api_credentials VALUES(?,?,?,?)", old_keys)
                if old_settings:
                    db.execute("INSERT OR REPLACE INTO settings VALUES('ai',?)", (old_settings[0],))
                else:
                    db.execute("DELETE FROM settings WHERE key='ai'")


def test_folder_and_category_deletion_include_nested_manuals():
    from app.db import connect, now, uid

    with TestClient(app) as client:
        token = client.post("/api/login", json={
            "username": "admin", "password": "manutailor-demo",
        }).json()["token"]
        headers = {"Authorization": "Bearer " + token}
        root, child, sibling = uid(), uid(), uid()
        category, sibling_category = uid(), uid()
        root_manual, child_manual, sibling_manual = uid(), uid(), uid()
        with connect() as db:
            db.execute("INSERT INTO folders(id,name,parent_id) VALUES(?,?,NULL)",
                       (root, "削除対象" + root))
            db.execute("INSERT INTO folders(id,name,parent_id) VALUES(?,?,?)",
                       (child, "子" + child, root))
            db.execute("INSERT INTO folders(id,name,parent_id) VALUES(?,?,NULL)",
                       (sibling, "残す" + sibling))
            db.execute("INSERT INTO categories VALUES(?,?,?)", (category, child, "分類"))
            db.execute("INSERT INTO categories VALUES(?,?,?)", (sibling_category, sibling, "残す分類"))
            for manual_id, folder_id, category_id in (
                (root_manual, root, None), (child_manual, child, category),
                (sibling_manual, sibling, sibling_category),
            ):
                db.execute("INSERT INTO manuals VALUES(?,?,?,?,?,?)",
                           (manual_id, manual_id, "normal", 1, folder_id, category_id))
                db.execute("INSERT INTO manual_versions VALUES(?,?,?,?,?,?)",
                           (uid(), manual_id, 1, '{"images":[]}', None, now()))
            active_generation = uid()
            version_id = db.execute(
                "SELECT id FROM manual_versions WHERE manual_id=?", (child_manual,)).fetchone()[0]
            admin_id = db.execute("SELECT id FROM users WHERE username='admin'").fetchone()[0]
            db.execute("INSERT INTO generations VALUES(?,?,?,?,?,?,?,?,?,?)",
                       (active_generation, version_id, admin_id, "{}", "[]", "{}",
                        "DRAFT", "mock", None, now()))
        blocked = client.delete(f"/api/folders/{root}", headers=headers)
        assert blocked.status_code == 409
        with connect() as db:
            assert db.execute("SELECT 1 FROM folders WHERE id=?", (root,)).fetchone()
            assert db.execute("SELECT 1 FROM manuals WHERE id=?", (child_manual,)).fetchone()
            db.execute("DELETE FROM generations WHERE id=?", (active_generation,))
        response = client.delete(f"/api/folders/{root}", headers=headers)
        assert response.status_code == 200, response.text
        assert response.json()["folder_count"] == 2
        assert response.json()["manual_count"] == 2
        with connect() as db:
            assert not db.execute("SELECT 1 FROM folders WHERE id IN (?,?)", (root, child)).fetchone()
            assert not db.execute("SELECT 1 FROM manuals WHERE id IN (?,?)",
                                  (root_manual, child_manual)).fetchone()
            assert db.execute("SELECT 1 FROM manuals WHERE id=?", (sibling_manual,)).fetchone()
        response = client.delete(f"/api/folders/{sibling}/categories/{sibling_category}",
                                 headers=headers)
        assert response.status_code == 200, response.text
        assert response.json()["manual_count"] == 1
        with connect() as db:
            assert db.execute("SELECT 1 FROM folders WHERE id=?", (sibling,)).fetchone()
            assert not db.execute("SELECT 1 FROM manuals WHERE id=?", (sibling_manual,)).fetchone()


def test_bulk_delete_deduplicates_nested_selections_and_rolls_back():
    from app.db import connect, now, uid

    with TestClient(app) as client:
        token = client.post("/api/login", json={
            "username": "admin", "password": "manutailor-demo",
        }).json()["token"]
        headers = {"Authorization": "Bearer " + token}
        root, child, category, manual_id = uid(), uid(), uid(), uid()
        with connect() as db:
            db.execute("INSERT INTO folders(id,name,parent_id) VALUES(?,?,NULL)",
                       (root, "一括" + root))
            db.execute("INSERT INTO folders(id,name,parent_id) VALUES(?,?,?)",
                       (child, "子" + child, root))
            db.execute("INSERT INTO categories VALUES(?,?,?)", (category, child, "一括分類"))
            db.execute("INSERT INTO manuals VALUES(?,?,?,?,?,?)",
                       (manual_id, "一括対象", "normal", 1, child, category))
            db.execute("INSERT INTO manual_versions VALUES(?,?,?,?,?,?)",
                       (uid(), manual_id, 1, '{"images":[]}', None, now()))
        request = {"folder_ids": [root, child], "category_ids": [category],
                   "manual_ids": [manual_id]}
        missing = client.post("/api/manuals/bulk-delete", headers=headers,
                              json={**request, "manual_ids": [manual_id, "missing"]})
        assert missing.status_code == 404
        with connect() as db:
            assert db.execute("SELECT 1 FROM folders WHERE id=?", (root,)).fetchone()
        response = client.post("/api/manuals/bulk-delete", headers=headers, json=request)
        assert response.status_code == 200, response.text
        assert response.json() == {"manual_count": 1, "folder_count": 2, "category_count": 1}
        with connect() as db:
            assert not db.execute("SELECT 1 FROM folders WHERE id IN (?,?)", (root, child)).fetchone()
            assert not db.execute("SELECT 1 FROM manuals WHERE id=?", (manual_id,)).fetchone()


def test_retry_bound_and_failed_report_blocks_publication(monkeypatch):
    from app.providers import MockAIProvider
    from app.db import connect

    class BadProvider(MockAIProvider):
        calls = 0

        async def generate(self, document, profile, feedback):
            self.calls += 1
            blocks = await super().generate(document, profile, feedback)
            for block in blocks:
                block.generated_text = block.generated_text.replace("10kg", "100kg")
            return blocks

        async def validate(self, document, blocks):
            return True, "LLM mistakenly accepts"

    provider = BadProvider()
    monkeypatch.setattr("app.main.get_provider", lambda settings, purpose: provider)
    with TestClient(app) as client:
        login = client.post("/api/login", json={"username": "admin", "password": "manutailor-demo"}).json()
        headers = {"Authorization": "Bearer " + login["token"]}
        users = client.get("/api/users", headers=headers).json()
        target = next(u for u in users if u["username"] == "demo")
        manual = client.post(
            "/api/manuals",
            headers=headers,
            data={"title": "荷重検証", "mode": "safety", "text": "1. 10kgまで載せてください。"},
        ).json()
        result = client.post(
            "/api/generations", headers=headers, json={
                "manual_id": manual["id"], "user_id": target["id"],
                "operation_id": "generation-progress-test",
            }
        ).json()
        assert provider.calls == 3
        assert result["report"]["status"] == "fail"
        assert client.get("/api/operations/generation-progress-test", headers=headers).json()["stage"] == "検品未完了"
        assert client.get("/api/generations/" + result["id"], headers=headers).json()["status"] == "INCOMPLETE"
        listed = next(item for item in client.get("/api/manuals", headers=headers).json()
                      if item["id"] == manual["id"])
        assert listed["incomplete_count"] == 1
        candidates = client.post("/api/manuals/incomplete-generations", headers=headers,
                                 json={"manual_ids": [manual["id"]]}).json()
        assert [item["id"] for item in candidates] == [result["id"]]
        assert (
            client.post("/api/generations/" + result["id"] + "/approve", headers=headers).status_code == 409
        )
        assert (
            client.post("/api/generations/" + result["id"] + "/publish", headers=headers).status_code == 409
        )
        with connect() as db:
            job = db.execute(
                "SELECT attempts FROM generation_jobs WHERE generation_id=?", (result["id"],)
            ).fetchone()
            assert job["attempts"] == 3
        monkeypatch.setattr("app.main.get_provider", lambda settings, purpose: MockAIProvider())
        retry = client.post(
            "/api/generations/" + result["id"] + "/regenerate", headers=headers,
        )
        assert retry.status_code == 200, retry.text
        assert retry.json()["id"] == result["id"]
        assert retry.json()["report"]["status"] == "pass"
        assert client.get("/api/generations/" + result["id"], headers=headers).json()["status"] == "NEEDS_REVIEW"
        assert client.post("/api/manuals/incomplete-generations", headers=headers,
                           json={"manual_ids": [manual["id"]]}).json() == []
        listed = next(item for item in client.get("/api/manuals", headers=headers).json()
                      if item["id"] == manual["id"])
        assert listed["incomplete_count"] == 0
        assert client.post(
            "/api/generations/" + result["id"] + "/regenerate", headers=headers,
        ).status_code == 409


def test_provider_error_stays_visible_as_incomplete_and_can_be_regenerated(monkeypatch):
    from app.providers import MockAIProvider

    class UnavailableProvider(MockAIProvider):
        async def generate(self, document, profile, feedback):
            raise RuntimeError("provider unavailable")

    monkeypatch.setattr("app.main.get_provider", lambda settings, purpose: UnavailableProvider())
    with TestClient(app) as client:
        login = client.post("/api/login", json={
            "username": "admin", "password": "manutailor-demo",
        }).json()
        headers = {"Authorization": "Bearer " + login["token"]}
        target = next(u for u in client.get("/api/users", headers=headers).json()
                      if u["username"] == "demo")
        manual_id = client.post("/api/manuals", headers=headers, data={
            "title": "接続再試行", "text": "1. 電源を確認してください。",
        }).json()["id"]
        failed = client.post("/api/generations", headers=headers, json={
            "manual_id": manual_id, "user_id": target["id"],
        })
        assert failed.status_code == 502
        incomplete = next(g for g in client.get("/api/generations", headers=headers).json()
                          if g["manual_id"] == manual_id)
        assert incomplete["status"] == "INCOMPLETE"
        assert incomplete["report"]["issues"][0]["code"] == "generation_failed"
        monkeypatch.setattr("app.main.get_provider", lambda settings, purpose: MockAIProvider())
        recovered = client.post(
            "/api/generations/" + incomplete["id"] + "/regenerate", headers=headers,
        )
        assert recovered.status_code == 200, recovered.text
        assert recovered.json()["id"] == incomplete["id"]
        assert recovered.json()["report"]["status"] == "pass"


def test_validation_quota_retry_reuses_saved_generated_blocks(monkeypatch):
    from app.providers import MockAIProvider

    class CountingGenerator(MockAIProvider):
        calls = 0

        async def generate(self, document, profile, feedback):
            self.calls += 1
            return await super().generate(document, profile, feedback)

    class LimitedValidator(MockAIProvider):
        calls = 0

        async def validate(self, document, blocks):
            self.calls += 1
            if self.calls == 1:
                request = httpx.Request("POST", "https://example.invalid/validate")
                response = httpx.Response(429, request=request)
                raise httpx.HTTPStatusError("quota", request=request, response=response)
            return await super().validate(document, blocks)

    generator, validator = CountingGenerator(), LimitedValidator()
    monkeypatch.setattr("app.main.get_provider", lambda settings, purpose:
                        generator if purpose == "generation" else validator)
    with TestClient(app) as client:
        login = client.post("/api/login", json={
            "username": "admin", "password": "manutailor-demo",
        }).json()
        headers = {"Authorization": "Bearer " + login["token"]}
        target = next(user for user in client.get("/api/users", headers=headers).json()
                      if user["username"] == "demo")
        manual_id = client.post("/api/manuals", headers=headers, data={
            "title": "検品再開", "text": "電源を確認してください。",
        }).json()["id"]
        failed = client.post("/api/generations", headers=headers, json={
            "manual_id": manual_id, "user_id": target["id"],
        })
        assert failed.status_code == 429
        assert "検品用AI" in failed.json()["detail"]
        incomplete = next(item for item in client.get("/api/generations", headers=headers).json()
                          if item["manual_id"] == manual_id)
        assert incomplete["blocks"]
        retry = client.post(f"/api/generations/{incomplete['id']}/regenerate", headers=headers)
        assert retry.status_code == 200, retry.text
        assert retry.json()["report"]["status"] == "pass"
        assert generator.calls == 1
        assert validator.calls == 2


def test_generation_resumes_from_saved_chunks_after_api_failure(monkeypatch):
    from app.db import connect, now, uid
    from app.models import Document, SourceBlock
    from app.providers import MockAIProvider

    class InterruptedGenerator(MockAIProvider):
        calls = 0

        async def generate(self, document, profile, feedback):
            self.calls += 1
            if self.calls == 2:
                request = httpx.Request("POST", "https://example.invalid/generate")
                response = httpx.Response(429, request=request)
                raise httpx.HTTPStatusError("quota", request=request, response=response)
            return await super().generate(document, profile, feedback)

    generator = InterruptedGenerator()
    monkeypatch.setattr("app.main.get_provider", lambda settings, purpose:
                        generator if purpose == "generation" else MockAIProvider())
    with TestClient(app) as client:
        token = client.post("/api/login", json={
            "username": "admin", "password": "manutailor-demo",
        }).json()["token"]
        headers = {"Authorization": "Bearer " + token}
        target = next(user for user in client.get("/api/users", headers=headers).json()
                      if user["username"] == "demo")
        manual_id, version_id = uid(), uid()
        document = Document(title="途中保存", organization_status="ai", blocks=[
            SourceBlock(id=uid(), source_page=1, source_block=index,
                        source_text=f"手順{index}を確認してください。")
            for index in range(1, 9)
        ])
        with connect() as db:
            db.execute("INSERT INTO manuals VALUES(?,?,?,?,?,?)",
                       (manual_id, "途中保存", "normal", 1, None, None))
            db.execute("INSERT INTO manual_versions VALUES(?,?,?,?,?,?)",
                       (version_id, manual_id, 1, document.model_dump_json(), None, now()))
        failed = client.post("/api/generations", headers=headers, json={
            "manual_id": manual_id, "user_id": target["id"],
        })
        assert failed.status_code == 429
        incomplete = next(item for item in client.get("/api/generations", headers=headers).json()
                          if item["manual_id"] == manual_id)
        assert incomplete["status"] == "INCOMPLETE"
        assert len(incomplete["blocks"]) == 6
        assert incomplete["saved_source_count"] == 6
        assert incomplete["source_count"] == 8
        with connect() as db:
            checkpoint = db.execute("SELECT completed_sources FROM generation_checkpoints WHERE generation_id=?",
                                    (incomplete["id"],)).fetchone()
        assert checkpoint["completed_sources"] == 6
        retry = client.post(f"/api/generations/{incomplete['id']}/regenerate", headers=headers)
        assert retry.status_code == 200, retry.text
        assert retry.json()["report"]["status"] == "pass"
        assert generator.calls == 3
        result = client.get(f"/api/generations/{incomplete['id']}", headers=headers).json()
        assert len(result["blocks"]) == 8
        assert result["saved_source_count"] == 0
        with connect() as db:
            assert not db.execute("SELECT 1 FROM generation_checkpoints WHERE generation_id=?",
                                  (incomplete["id"],)).fetchone()


def test_startup_marks_interrupted_generation_retryable_without_losing_checkpoint():
    from app.db import connect, now, uid
    from app.models import ConsistencyReport

    with TestClient(app) as client:
        token = client.post("/api/login", json={
            "username": "admin", "password": "manutailor-demo",
        }).json()["token"]
        headers = {"Authorization": "Bearer " + token}
        manual_id = client.post("/api/manuals", headers=headers, data={
            "title": "再起動時の途中保存", "text": "電源を確認してください。",
        }).json()["id"]
        generation_id = uid()
        with connect() as db:
            version_id = db.execute("SELECT id FROM manual_versions WHERE manual_id=?",
                                    (manual_id,)).fetchone()[0]
            target = db.execute("SELECT id,profile FROM users WHERE username='demo'").fetchone()
            report = ConsistencyReport(status="fail", issues=[], checks={}, semantic_score=0)
            db.execute("INSERT INTO generations VALUES(?,?,?,?,?,?,?,?,?,?)",
                       (generation_id, version_id, target["id"], target["profile"], "[]",
                        report.model_dump_json(), "DRAFT", "{}", None, now()))
            db.execute("INSERT INTO generation_checkpoints VALUES(?,?,?,?,?,?,?)",
                       (generation_id, version_id, 1, 0, "[]", "[]", now()))
    with TestClient(app):
        with connect() as db:
            assert db.execute("SELECT status FROM generations WHERE id=?",
                              (generation_id,)).fetchone()["status"] == "INCOMPLETE"
            assert db.execute("SELECT 1 FROM generation_checkpoints WHERE generation_id=?",
                              (generation_id,)).fetchone()


def test_failed_retry_after_source_edit_keeps_previous_draft(monkeypatch):
    from app.providers import MockAIProvider

    class RejectingValidator(MockAIProvider):
        async def validate(self, document, blocks):
            return False, "review needed"

    class UnavailableGenerator(MockAIProvider):
        async def generate(self, document, profile, feedback):
            raise RuntimeError("provider unavailable")

    monkeypatch.setattr("app.main.get_provider", lambda settings, purpose:
                        MockAIProvider() if purpose == "generation" else RejectingValidator())
    with TestClient(app) as client:
        token = client.post("/api/login", json={
            "username": "admin", "password": "manutailor-demo",
        }).json()["token"]
        headers = {"Authorization": "Bearer " + token}
        target = next(user for user in client.get("/api/users", headers=headers).json()
                      if user["username"] == "demo")
        manual_id = client.post("/api/manuals", headers=headers, data={
            "title": "下書き保持", "text": "電源を確認してください。",
        }).json()["id"]
        generated = client.post("/api/generations", headers=headers, json={
            "manual_id": manual_id, "user_id": target["id"],
        }).json()
        draft_before = client.get(f"/api/generations/{generated['id']}", headers=headers).json()
        assert draft_before["status"] == "INCOMPLETE"
        assert draft_before["blocks"]
        source = client.get(f"/api/manuals/{manual_id}", headers=headers).json()["document"]["blocks"][0]
        edited = client.put(f"/api/manuals/{manual_id}/blocks/{source['id']}", headers=headers,
                            json={"source_text": "主電源を確認してください。", "kind": "step", "tags": []})
        assert edited.status_code == 200
        monkeypatch.setattr("app.main.get_provider", lambda settings, purpose:
                            UnavailableGenerator() if purpose == "generation" else MockAIProvider())
        failed = client.post(f"/api/generations/{generated['id']}/regenerate", headers=headers)
        assert failed.status_code == 502
        draft_after = client.get(f"/api/generations/{generated['id']}", headers=headers).json()
        assert draft_after["blocks"] == draft_before["blocks"]
        assert draft_after["version"] == draft_before["version"]


def test_vertical_slice_and_access_control():
    with TestClient(app) as client:
        login = client.post("/api/login", json={"username": "admin", "password": "manutailor-demo"})
        admin = {"Authorization": "Bearer " + login.json()["token"]}
        user_login = client.post(
            "/api/login", json={"username": "demo", "password": "manutailor-demo"}
        ).json()
        user = {"Authorization": "Bearer " + user_login["token"]}
        assert client.get("/api/users", headers=user).status_code == 403
        assert client.put("/api/profile", headers=user, json={"font_scale": 1.4}).status_code == 200
        upload = client.post(
            "/api/manuals",
            headers=admin,
            data={"title": "テスト", "mode": "safety"},
            files={
                "file": (
                    "../../sample.txt",
                    "1. 10kgまで載せてください。\n注意：電源を切らないでください。".encode(),
                    "text/plain",
                )
            },
        )
        assert upload.status_code == 200
        manual_id = upload.json()["id"]
        generated = client.post(
            "/api/generations",
            headers=admin,
            json={"manual_id": manual_id, "user_id": user_login["user"]["id"]},
        )
        assert generated.status_code == 200
        generation_id = generated.json()["id"]
        assert generated.json()["report"]["status"] == "pass"
        assert client.get(f"/api/generations/{generation_id}", headers=user).status_code == 404
        assert client.post(f"/api/generations/{generation_id}/publish", headers=admin).status_code == 409
        assert client.post(f"/api/generations/{generation_id}/approve", headers=admin).status_code == 200
        assert client.post(f"/api/generations/{generation_id}/publish", headers=admin).status_code == 200
        detail = client.get(f"/api/generations/{generation_id}", headers=user).json()
        assert detail["blocks"][0]["source_block_ids"][0] == detail["document"]["blocks"][0]["id"]
        assert any(
            n["generation_id"] == generation_id for n in client.get("/api/notifications", headers=user).json()
        )
        assert client.get("/api/files/" + detail["source_file"], headers=user).status_code == 200
        client.post(
            "/api/manuals",
            headers=admin,
            data={
                "title": "更新",
                "mode": "safety",
                "manual_id": manual_id,
                "text": "1. 5kgまで載せてください。",
            },
        )
        assert client.get(f"/api/generations/{generation_id}", headers=user).json()["stale"]
        assert (
            client.post(
                "/api/manuals",
                headers=admin,
                data={"title": "禁止"},
                files={"file": ("bad.html", b"<script>", "text/html")},
            ).status_code
            == 400
        )
        assert client.get("/api/files/missing", headers=user).status_code == 404
