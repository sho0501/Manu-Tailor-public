from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from app.document_split import (
    classification_groups, expand_group_plan, outline_fallback_plan, split_document,
)
from app.ingestion import structure
from app.main import app
from app.models import ImageBlock, SourceSection


def test_split_plan_must_cover_all_steps_and_keeps_each_figure_once():
    image = ImageBlock(id="figure", image_path="figure.png", page=1,
                       source_reference="page:1")
    document = structure([(1, "1. スチームを選ぶ。\n2. 加熱する。")], "電子レンジ", [image])
    first, second = [block.id for block in document.blocks]
    proposal = {"folder_name": "電子レンジ", "sections": [
        {"category_name": "調理方法", "title": "スチームレンジの使い方",
         "source_block_ids": [first], "image_ids": ["figure"]},
        {"category_name": "調理方法", "title": "加熱の仕方",
         "source_block_ids": [second], "image_ids": ["figure"]},
    ]}
    _, parts = split_document(document, proposal)
    assert [part.title for part in parts] == ["スチームレンジの使い方", "加熱の仕方"]
    assert parts[0].document.images[0].id == "figure"
    assert parts[0].document.blocks[0].image_ids == ["figure"]
    assert parts[1].document.images == []
    proposal["sections"][1]["source_block_ids"] = [first]
    try:
        split_document(document, proposal)
        assert False, "duplicate IDs must be rejected"
    except ValueError:
        pass


def test_bookmark_groups_expand_to_every_original_step():
    document = structure([(1, "準備\n電源を入れる"), (2, "加熱\n開始する")], "取説")
    document.source_sections = [
        SourceSection(id="page:1-1", title="準備", start_page=1, end_page=1),
        SourceSection(id="page:2-2", title="加熱", start_page=2, end_page=2),
    ]
    groups = classification_groups(document)
    assert len(groups) == 2
    proposal = {"folder_name": "電子レンジ", "sections": [
        {"title": "準備と加熱", "category_name": "調理方法",
         "source_group_ids": [group["id"] for group in groups]},
    ]}
    expanded = expand_group_plan(document, proposal, groups)
    assert len(expanded["sections"][0]["source_block_ids"]) == 4
    assert len(split_document(document, expanded)[1][0].document.blocks) == 4
    fallback = expand_group_plan(document, outline_fallback_plan(document, groups), groups)
    assert sum(len(part.document.blocks) for part in split_document(document, fallback)[1]) == 4
    proposal["sections"][0]["source_group_ids"] = [groups[0]["id"]] * 2
    try:
        expand_group_plan(document, proposal, groups)
        assert False, "duplicate and missing chapter IDs must be rejected"
    except ValueError:
        pass


def test_pdf_is_extracted_then_split_into_category_manuals(monkeypatch):
    monkeypatch.setattr("app.ingestion.render_pdf_page", lambda path, page: None)
    async def fake_request(self, system, payload):
        if "Organize source text" in system:
            first, second = [line["id"] for line in payload["lines"]]
            return {"sections": [
                {"title": "スチーム", "kind": "step", "tags": ["調理"], "line_ids": [first]},
                {"title": "掃除", "kind": "step", "tags": ["清掃"], "line_ids": [second]},
            ], "excluded_line_ids": []}
        assert "electronic oven" in system
        assert len(payload["blocks"]) == 2
        assert len(payload["images"]) == 1
        first, second = [block["id"] for block in payload["blocks"]]
        return {"folder_name": "電子レンジ", "sections": [
            {"category_name": "調理方法", "title": "スチームレンジの使い方",
             "source_block_ids": [first], "image_ids": [payload["images"][0]["id"]]},
            {"category_name": "お手入れ", "title": "庫内の掃除",
             "source_block_ids": [second], "image_ids": []},
        ]}

    monkeypatch.setattr("app.main.settings_from_db", lambda: {
        "generation_provider": "openai_compatible", "generation_model": "test-model",
    })
    monkeypatch.setattr("app.main.OpenAICompatibleProvider.request", fake_request)
    pdf = BytesIO()
    Image.new("RGB", (100, 80), "white").save(pdf, format="PDF")
    with TestClient(app) as client:
        login = client.post("/api/login", json={
            "username": "admin", "password": "manutailor-demo",
        }).json()
        headers = {"Authorization": "Bearer " + login["token"]}
        result = client.post("/api/manuals", headers=headers, data={
            "title": "電子レンジ取説", "text": "1. スチームを選ぶ。\n2. 庫内を拭く。",
            "split_into_manuals": "true",
        }, files={"file": ("oven.pdf", pdf.getvalue(), "application/pdf")})
        assert result.status_code == 200, result.text
        assert result.json()["source_blocks"] == 2
        assert result.json()["source_images"] == 1
        created = result.json()["manuals"]
        assert [(item["folder_name"], item["category_name"], item["title"])
                for item in created] == [
            ("電子レンジ", "調理方法", "スチームレンジの使い方"),
            ("電子レンジ", "お手入れ", "庫内の掃除"),
        ]
        steam = client.get(f"/api/manuals/{created[0]['id']}", headers=headers).json()
        cleaning = client.get(f"/api/manuals/{created[1]['id']}", headers=headers).json()
        assert len(steam["document"]["images"]) == 1
        assert len(cleaning["document"]["images"]) == 0
        assert steam["source_file"].endswith(".pdf")
        assert steam["document"]["raw_pages"] == [
            {"page": 1, "text": "1. スチームを選ぶ。\n2. 庫内を拭く。"}
        ]
        source = client.get(f"/api/manuals/{result.json()['source_manual_id']}", headers=headers).json()
        assert source["document"]["raw_pages"] == steam["document"]["raw_pages"]
        assert source["document"]["organization_status"] == "ai"
        assert len(steam["document"]["blocks"]) == 1
        assert len(cleaning["document"]["blocks"]) == 1


def test_split_failure_keeps_full_original_for_admin(monkeypatch):
    async def unavailable(self, system, payload):
        raise RuntimeError("quota")

    monkeypatch.setattr("app.main.settings_from_db", lambda: {
        "generation_provider": "openai_compatible", "generation_model": "test-model",
    })
    monkeypatch.setattr("app.main.OpenAICompatibleProvider.request", unavailable)
    with TestClient(app) as client:
        login = client.post("/api/login", json={
            "username": "admin", "password": "manutailor-demo",
        }).json()
        headers = {"Authorization": "Bearer " + login["token"]}
        original = "調理方法\nスチームを選ぶ。\n\nお願い\nやけどに注意してください。"
        before = {row["id"] for row in client.get("/api/manuals", headers=headers).json()}
        result = client.post("/api/manuals", headers=headers, data={
            "title": "保存確認", "text": original, "split_into_manuals": "true",
        })
        assert result.status_code == 502
        after = client.get("/api/manuals", headers=headers).json()
        created = next(row for row in after if row["id"] not in before)
        source = client.get(f"/api/manuals/{created['id']}", headers=headers).json()
        assert source["document"]["raw_pages"] == [{"page": 1, "text": original}]
        assert source["document"]["organization_status"] == "provisional"


def test_long_document_uses_outline_when_ai_is_unavailable(monkeypatch):
    async def unavailable(self, system, payload):
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr("app.main.settings_from_db", lambda: {
        "generation_provider": "openai_compatible", "generation_model": "test-model",
    })
    monkeypatch.setattr("app.main.OpenAICompatibleProvider.request", unavailable)
    content = "\n".join(f"{number}. 手順{number}" for number in range(121))
    with TestClient(app) as client:
        token = client.post("/api/login", json={
            "username": "admin", "password": "manutailor-demo",
        }).json()["token"]
        result = client.post("/api/manuals", headers={"Authorization": "Bearer " + token}, data={
            "title": "電子レンジ取扱説明書", "text": content, "split_into_manuals": "true",
        })
        assert result.status_code == 200, result.text
        assert result.json()["classification_method"] == "outline_fallback"
        assert result.json()["source_blocks"] == 1
