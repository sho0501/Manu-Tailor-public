import sqlite3
from io import BytesIO

from PIL import Image

from fastapi.testclient import TestClient

from app.main import app


def admin_headers(client):
    result = client.post("/api/login", json={"username": "admin", "password": "manutailor-demo"})
    return {"Authorization": "Bearer " + result.json()["token"]}


def test_folder_category_assignment_and_auto_classification(monkeypatch):
    async def fake_request(self, system, payload):
        assert "manual" in system.lower()
        assert payload["title"] == "備品の準備"
        return {"folder_name": "作業", "category_name": "備品"}

    monkeypatch.setattr("app.main.settings_from_db", lambda: {
        "generation_provider": "openai_compatible", "generation_model": "test-model"
    })
    monkeypatch.setattr("app.main.OpenAICompatibleProvider.request", fake_request)
    with TestClient(app) as client:
        headers = admin_headers(client)
        folder = client.post("/api/folders", headers=headers, json={"name": "作業"}).json()
        other = client.post("/api/folders", headers=headers, json={"name": "安全"}).json()
        category = client.post(
            f"/api/folders/{folder['id']}/categories", headers=headers, json={"name": "コピー"}
        ).json()
        manual = client.post("/api/manuals", headers=headers, data={
            "title": "備品の準備", "text": "1. 備品を準備してください。",
            "folder_id": folder["id"], "category_id": category["id"],
        }).json()
        detail = client.get(f"/api/manuals/{manual['id']}", headers=headers).json()
        assert detail["folder_name"] == "作業"
        assert detail["category_name"] == "コピー"
        assert client.put(f"/api/manuals/{manual['id']}/classification", headers=headers, json={
            "folder_id": other["id"], "category_id": category["id"]
        }).status_code == 400
        result = client.post(f"/api/manuals/{manual['id']}/auto-classify", headers=headers)
        assert result.status_code == 200
        assert result.json()["category_name"] == "備品"
        taxonomy = client.get("/api/taxonomy", headers=headers).json()
        assert any(c["name"] == "備品" for f in taxonomy for c in f["categories"])
        assert client.get(f"/api/manuals/{manual['id']}", headers=headers).json()["category_name"] == "備品"
        monkeypatch.setattr("app.main.settings_from_db", lambda: {
            "generation_provider": "mock", "validation_provider": "mock"
        })
        target = next(item for item in client.get("/api/users", headers=headers).json()
                      if item["username"] == "demo")
        generation = client.post("/api/generations", headers=headers, json={
            "manual_id": manual["id"], "user_id": target["id"],
        }).json()
        for action in ("approve", "publish"):
            assert client.post(f"/api/generations/{generation['id']}/{action}", headers=headers).status_code == 200
        user_login = client.post("/api/login", json={
            "username": "demo", "password": "manutailor-demo",
        }).json()
        user_headers = {"Authorization": "Bearer " + user_login["token"]}
        delivered = client.get("/api/generations", headers=user_headers).json()
        assert next(item for item in delivered if item["id"] == generation["id"])["category_name"] == "備品"


def test_existing_database_gains_classification_columns(tmp_path, monkeypatch):
    import app.db as database

    path = tmp_path / "old.sqlite3"
    with sqlite3.connect(path) as connection:
        connection.execute(
            "CREATE TABLE manuals (id TEXT PRIMARY KEY,title TEXT NOT NULL,"
            "mode TEXT NOT NULL,current_version INTEGER NOT NULL)"
        )
        connection.execute("INSERT INTO manuals VALUES('old','旧手順','speed',1)")
    monkeypatch.setattr(database, "DB", path)
    database.init_db()
    with database.connect() as connection:
        row = connection.execute("SELECT folder_id,category_id FROM manuals WHERE id='old'").fetchone()
        assert tuple(row) == (None, None)
        assert "parent_id" in {column[1] for column in connection.execute("PRAGMA table_info(folders)")}


def test_nested_folders_categories_and_cycle_rejection():
    with TestClient(app) as client:
        headers = admin_headers(client)
        root = client.post("/api/folders", headers=headers, json={"name": "会社"}).json()
        child = client.post("/api/folders", headers=headers,
                            json={"name": "部署", "parent_id": root["id"]}).json()
        category = client.post(f"/api/folders/{child['id']}/categories", headers=headers,
                               json={"name": "操作"}).json()
        taxonomy = client.get("/api/taxonomy", headers=headers).json()
        assert next(folder for folder in taxonomy if folder["id"] == child["id"])["parent_id"] == root["id"]
        assert category["folder_id"] == child["id"]
        assert client.put(f"/api/folders/{root['id']}", headers=headers,
                          json={"parent_id": child["id"]}).status_code == 400
        manual = client.post("/api/manuals", headers=headers, data={
            "title": "部署の操作", "text": "1. 電源を入れてください。",
            "folder_id": child["id"], "category_id": category["id"],
        }).json()
        listed = client.get("/api/manuals", headers=headers).json()
        item = next(item for item in listed if item["id"] == manual["id"])
        assert [part["name"] for part in item["folder_path"]] == ["会社", "部署"]
        assert item["category_name"] == "操作"


def test_delete_failed_generation_and_source_manual(monkeypatch):
    from app.providers import MockAIProvider
    from app.db import connect

    monkeypatch.setattr("app.main.get_provider", lambda settings, purpose: MockAIProvider())
    with TestClient(app) as client:
        headers = admin_headers(client)
        user_id = next(item["id"] for item in client.get("/api/users", headers=headers).json()
                       if item["username"] == "demo")
        manual = client.post("/api/manuals", headers=headers,
                             data={"title": "削除対象", "text": "1. 電源を入れてください。"}).json()
        generation = client.post("/api/generations", headers=headers,
                                 json={"manual_id": manual["id"], "user_id": user_id}).json()
        assert generation["report"]["status"] == "pass"
        with connect() as db:
            db.execute("UPDATE generations SET status='INCOMPLETE' WHERE id=?", (generation["id"],))
        assert client.delete(f"/api/generations/{generation['id']}", headers=headers).status_code == 200
        assert client.get(f"/api/generations/{generation['id']}", headers=headers).status_code == 404
        second = client.post("/api/generations", headers=headers,
                             json={"manual_id": manual["id"], "user_id": user_id}).json()
        assert client.delete(f"/api/manuals/{manual['id']}", headers=headers).status_code == 200
        assert client.get(f"/api/manuals/{manual['id']}", headers=headers).status_code == 404
        assert client.get(f"/api/generations/{second['id']}", headers=headers).status_code == 404


def test_delete_manual_removes_unreferenced_upload():
    from app.config import ROOT

    picture = BytesIO()
    Image.new("RGB", (20, 20), "red").save(picture, format="PNG")
    with TestClient(app) as client:
        headers = admin_headers(client)
        created = client.post("/api/manuals", headers=headers,
                              data={"title": "画像の削除", "text": "1. 確認してください。"},
                              files={"file": ("picture.png", picture.getvalue(), "image/png")}).json()
        image_name = created["document"]["images"][0]["image_path"]
        assert (ROOT / "uploads" / image_name).exists()
        assert client.delete(f"/api/manuals/{created['id']}", headers=headers).status_code == 200
        assert not (ROOT / "uploads" / image_name).exists()
