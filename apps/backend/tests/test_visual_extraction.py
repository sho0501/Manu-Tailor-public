import asyncio

from PIL import Image

from app.models import Document, ImageBlock, RawPage, VisualGroup
from app.providers import GeminiProvider
from app.source_organization import organize_source
from app.visual_extraction import extract_visual_pages


class VisionProvider(GeminiProvider):
    def __init__(self, response):
        self.response = response
        self.calls = 0

    async def request_with_page(self, system, payload, page_path):
        self.calls += 1
        assert "border" in system
        assert page_path.is_file()
        return self.response

    async def request(self, system, payload):
        units = payload["lines"]
        return {"sections": [{
            "title": "枠内の説明" if unit["visual_kind"] == "frame" else "本文",
            "kind": "other", "tags": [], "line_ids": [unit["id"]],
        } for unit in units], "excluded_line_ids": []}


def source():
    return Document(title="取説", blocks=[], organization_status="raw",
                    raw_pages=[RawPage(page=1, text="注意\n電源を切ってください。\n背面を確認します。")],
                    images=[ImageBlock(id="preview", image_path="page.png", page=1,
                                       source_reference="page:1:rendered")])


def test_visual_reading_keeps_box_as_one_source_unit(tmp_path, monkeypatch):
    page_path = tmp_path / "page.png"
    Image.new("RGB", (100, 100), "white").save(page_path)
    monkeypatch.setattr("app.visual_extraction._page_image", lambda *args, **kwargs: page_path)
    provider = VisionProvider({"groups": [
        {"text": "注意\n電源を切ってください。", "kind": "frame", "bbox": [10, 10, 90, 60]},
        {"text": "背面を確認します。", "kind": "paragraph", "bbox": [10, 70, 90, 90]},
    ]})
    extracted = asyncio.run(extract_visual_pages(source(), provider, source_is_pdf=True))
    assert provider.calls == 1
    assert extracted.raw_pages[0].text == "注意\n電源を切ってください。\n背面を確認します。"
    assert len(extracted.visual_groups) == 2
    assert extracted.visual_groups[0].bbox == (10, 10, 90, 60)
    organized = asyncio.run(organize_source(extracted, provider))
    assert organized.organization_status == "ai"
    assert len(organized.blocks) == 2
    assert organized.blocks[0].source_text == "注意\n電源を切ってください。"
    assert "枠" in organized.blocks[0].tags


def test_incomplete_visual_reading_falls_back_to_text_layer(tmp_path, monkeypatch):
    page_path = tmp_path / "page.png"
    Image.new("RGB", (100, 100), "white").save(page_path)
    monkeypatch.setattr("app.visual_extraction._page_image", lambda *args, **kwargs: page_path)
    raw = source()
    raw.raw_pages[0].text = "重要な操作説明です。" * 10
    provider = VisionProvider({"groups": [
        {"text": "注意", "kind": "frame", "bbox": [10, 10, 90, 60]},
    ]})
    extracted = asyncio.run(extract_visual_pages(raw, provider, source_is_pdf=True))
    assert extracted.raw_pages[0].text == raw.raw_pages[0].text
    assert extracted.visual_groups == []
    assert any("PDFの文字データ" in note for note in extracted.extraction_notes)


def test_visual_frame_cannot_be_merged_with_outside_text():
    class InvalidGrouping(VisionProvider):
        async def request(self, system, payload):
            return {"sections": [{"title": "混在", "kind": "other", "tags": [],
                                   "line_ids": [unit["id"] for unit in payload["lines"]]}],
                    "excluded_line_ids": []}

    raw = source()
    raw.visual_groups = [
        VisualGroup(page=1, text="注意\n電源を切ってください。", kind="frame"),
        VisualGroup(page=1, text="背面を確認します。", kind="paragraph"),
    ]
    result = asyncio.run(organize_source(raw, InvalidGrouping({})))
    assert result.organization_status == "provisional"
    assert len(result.blocks) == 2
    assert result.blocks[0].source_text == "注意\n電源を切ってください。"
