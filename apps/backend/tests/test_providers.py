import asyncio
import json

import httpx
from fastapi.testclient import TestClient
from PIL import Image

from app.db import connect
from app.ingestion import structure
from app.models import Profile
from app.main import app
from app.providers import (OpenAICompatibleProvider, MockAIProvider, GeminiProvider,
                           FailoverProvider, describe_provider_failure, get_provider)


def test_openai_compatible_transport_and_independent_prompts(monkeypatch):
    document = structure([(1, "10kgまで載せてください。")], "load")
    blocks = asyncio.run(MockAIProvider().generate(document, Profile(), []))
    captured = []

    def handler(request):
        body = json.loads(request.content)
        captured.append(body)
        content = (
            {"blocks": [b.model_dump() for b in blocks]}
            if len(captured) == 1
            else {"passed": True, "reason": "consistent"}
        )
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(content)}}]})

    original = httpx.AsyncClient
    monkeypatch.setattr(
        "app.providers.httpx.AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs),
    )
    settings = {
        "generation_base_url": "http://127.0.0.1:8080/v1",
        "generation_model": "local",
        "validation_base_url": "http://127.0.0.1:8080/v1",
        "validation_model": "reviewer",
    }
    generated = asyncio.run(
        OpenAICompatibleProvider(settings, "generation").generate(document, Profile(), [])
    )
    passed, _ = asyncio.run(OpenAICompatibleProvider(settings, "validation").validate(document, generated))
    assert passed
    assert captured[0]["model"] == "local"
    assert captured[1]["model"] == "reviewer"
    assert captured[0]["messages"][0] != captured[1]["messages"][0]


def test_temporary_503_recovers_after_backoff(monkeypatch):
    attempts = []
    delays = []

    def handler(request):
        attempts.append(request)
        if len(attempts) < 4:
            return httpx.Response(503)
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"ok":true}'}}]})

    async def fake_sleep(seconds):
        delays.append(seconds)

    original = httpx.AsyncClient
    monkeypatch.setattr("app.providers.httpx.AsyncClient",
                        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    monkeypatch.setattr("app.providers.asyncio.sleep", fake_sleep)
    provider = OpenAICompatibleProvider({"generation_base_url": "https://example.test/v1"},
                                        "generation", "test-only-key")
    assert asyncio.run(provider.request("test", {"ping": 1})) == {"ok": True}
    assert len(attempts) == 4
    assert delays == [1, 2, 4]


def test_gemini_provider_uses_its_own_key_and_model(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-only-key")
    provider = get_provider({"generation_provider": "gemini", "generation_model": "gemini-3.8-flash"}, "generation")
    assert isinstance(provider, GeminiProvider)
    assert provider.model == "gemini-3.8-flash"
    assert provider.url == "https://generativelanguage.googleapis.com/v1beta/openai"
    assert provider.key == "test-only-key"


def test_generation_backup_can_validate_when_no_validation_backup(monkeypatch):
    def credentials(purpose, *, with_keys=False):
        assert with_keys
        if purpose == "validation":
            return []
        return [{"id": "backup-id", "purpose": "generation", "name": "予備API",
                 "provider": "gemini", "model": "gemini-test", "api_key": "test-only-key"}]

    monkeypatch.setattr("app.providers.backup_credentials", credentials)
    provider = get_provider({"validation_provider": "openai_compatible",
                             "validation_model": "reviewer"}, "validation")
    assert isinstance(provider, FailoverProvider)
    assert isinstance(provider.providers[1], GeminiProvider)
    assert provider.providers[1].credential_id == "backup-id:validation"
    assert provider.providers[1].credential_name == "予備API（検品兼用）"


def test_failure_summary_names_each_ai_without_exposing_keys(monkeypatch):
    monkeypatch.setattr("app.providers.record_api_limit", lambda *args: None)

    def handler(request):
        return httpx.Response(429, json={"error": "quota"})

    original = httpx.AsyncClient
    monkeypatch.setattr("app.providers.httpx.AsyncClient",
                        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    primary = GeminiProvider({"validation_model": "gemini-primary"}, "validation", "secret-primary")
    backup = GeminiProvider({"validation_model": "gemini-backup"}, "validation", "secret-backup")
    backup.credential_name = "予備API（検品兼用）"
    provider = FailoverProvider([primary, backup])
    try:
        asyncio.run(provider.request("test", {"text": "source"}))
        assert False, "all providers should fail"
    except httpx.HTTPStatusError as error:
        summary = describe_provider_failure(provider, error)
    assert "メインAPI（検品）［Gemini / gemini-primary］: HTTP 429" in summary
    assert "予備API（検品兼用）［Gemini / gemini-backup］: HTTP 429" in summary
    assert "secret-primary" not in summary
    assert "secret-backup" not in summary


def test_gemini_split_sends_figure_with_its_id(tmp_path, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-only-key")
    path = tmp_path / "diagram.png"
    Image.new("RGB", (100, 50), "blue").save(path)
    captured = []

    async def fake_messages(self, messages):
        captured.extend(messages)
        return {"folder_name": "機器", "sections": []}

    monkeypatch.setattr("app.providers.GeminiProvider._request_messages", fake_messages)
    provider = GeminiProvider({"generation_model": "gemini-3.8-flash"}, "generation")
    asyncio.run(provider.request_with_figures("Split", {"title": "機器"}, [("figure-id", path)]))
    parts = captured[1]["content"]
    assert parts[1]["text"] == "Figure ID: figure-id"
    assert parts[2]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_backup_key_takes_over_after_quota_notice_without_exposing_secret(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "primary-test-key")
    calls = []

    def handler(request):
        calls.append(request.headers.get("authorization"))
        if calls[-1] == "Bearer primary-test-key":
            return httpx.Response(429, json={"error": "quota"})
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"ok":true}'}}]})

    original = httpx.AsyncClient
    monkeypatch.setattr(
        "app.providers.httpx.AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs),
    )
    with TestClient(app) as client:
        token = client.post("/api/login", json={
            "username": "admin", "password": "manutailor-demo",
        }).json()["token"]
        headers = {"Authorization": "Bearer " + token}
        assert client.get("/api/settings/backup-apis").status_code in {401, 403}
        with connect() as db:
            db.execute("DELETE FROM api_limit_events WHERE credential_id='primary:generation'")
            db.execute("DELETE FROM notifications WHERE kind='api_limit' AND title LIKE 'API利用制限: メインAPI%'")
        created = client.post("/api/settings/backup-apis", headers=headers, json={
            "purpose": "generation", "name": "予備Gemini", "provider": "gemini",
            "model": "gemini-3.8-flash", "api_key": "backup-test-key",
        })
        assert created.status_code == 200, created.text
        credential_id = created.json()["id"]
        try:
            listed = client.get("/api/settings/backup-apis", headers=headers)
            assert "backup-test-key" not in listed.text
            with connect() as db:
                encrypted = db.execute(
                    "SELECT encrypted_key FROM api_credentials WHERE id=?", (credential_id,)
                ).fetchone()[0]
            assert "backup-test-key" not in encrypted
            assert listed.json()["backups"][-1]["name"] == "予備Gemini"
            provider = get_provider({"generation_provider": "gemini",
                                     "generation_model": "gemini-3.8-flash"}, "generation")
            assert isinstance(provider, FailoverProvider)
            assert asyncio.run(provider.request("test", {"text": "source"})) == {"ok": True}
            assert calls == ["Bearer primary-test-key", "Bearer backup-test-key"]
            notices = client.get("/api/notifications", headers=headers).json()
            quota_notices = [n for n in notices if n["kind"] == "api_limit" and "メインAPI" in n["title"]]
            assert len(quota_notices) == 1
            asyncio.run(provider.request("test", {"text": "source"}))
            notices_after_retry = client.get("/api/notifications", headers=headers).json()
            assert len([n for n in notices_after_retry if n["kind"] == "api_limit"
                        and "メインAPI" in n["title"]]) == 1
            assert any(event["credential_id"] == "primary:generation"
                       for event in client.get("/api/settings/backup-apis", headers=headers).json()["limits"])
        finally:
            assert client.delete(f"/api/settings/backup-apis/{credential_id}", headers=headers).status_code == 200
