import asyncio

import pytest

from app.models import Document, ImageBlock, RawPage
from app.providers import OpenAICompatibleProvider
from app.source_organization import SourceOrganizationInterrupted, organize_source


class GroupingProvider(OpenAICompatibleProvider):
    def __init__(self, response):
        self.response = response

    async def request(self, system, payload):
        assert "BEFORE dividing it into steps" in system
        assert [line["text"] for line in payload["lines"]] == [
            "加熱を選ぶ。", "開始を押す。", "お願い", "やけどに注意してください。", "© Example",
        ]
        return self.response


def source():
    return Document(
        title="電子レンジ", blocks=[], organization_status="raw",
        raw_pages=[RawPage(page=1, text="加熱を選ぶ。\n開始を押す。\nお願い\nやけどに注意してください。\n© Example")],
        images=[ImageBlock(id="figure", image_path="figure.png", page=1,
                           source_reference="page:1")],
    )


def test_ai_groups_complete_source_without_step_division_and_keeps_figure():
    response = {"sections": [
        {"title": "加熱の操作", "kind": "step", "step_label": "A", "tags": ["加熱"],
         "line_ids": ["p1-l1", "p1-l2"]},
        {"title": "安全上のお願い", "kind": "request", "tags": ["やけど", "安全"],
         "line_ids": ["p1-l3", "p1-l4"]},
    ], "excluded_line_ids": ["p1-l5"]}
    result = asyncio.run(organize_source(source(), GroupingProvider(response)))
    assert result.organization_status == "ai"
    assert len(result.blocks) == 2
    assert result.blocks[0].source_text == "加熱を選ぶ。\n開始を押す。"
    assert result.blocks[0].image_ids == ["figure"]
    assert result.blocks[0].step_label == "A"
    assert result.blocks[1].kind == "request"
    assert result.blocks[1].step_label is None
    assert result.blocks[1].tags == ["やけど", "安全"]
    assert result.raw_pages[0].text.endswith("© Example")
    assert [(line.page, line.line, line.text) for line in result.excluded_lines] == [
        (1, 5, "© Example")
    ]


def test_missing_line_rejects_ai_result_and_preserves_whole_page():
    response = {"sections": [
        {"title": "操作", "kind": "step", "tags": [], "line_ids": ["p1-l1"]},
    ], "excluded_line_ids": ["p1-l5"]}
    result = asyncio.run(organize_source(source(), GroupingProvider(response)))
    assert result.organization_status == "provisional"
    assert len(result.blocks) == 1
    assert "やけどに注意してください。" in result.blocks[0].source_text
    assert result.blocks[0].image_ids == ["figure"]


def test_sections_returned_out_of_order_keep_original_text_order():
    response = {"sections": [
        {"title": "お願い", "kind": "request", "tags": ["安全"],
         "line_ids": ["p1-l4", "p1-l3"]},
        {"title": "操作", "kind": "step", "tags": [],
         "line_ids": ["p1-l2", "p1-l1"]},
    ], "excluded_line_ids": ["p1-l5"]}
    result = asyncio.run(organize_source(source(), GroupingProvider(response)))
    assert result.organization_status == "ai"
    assert [block.source_text for block in result.blocks] == [
        "加熱を選ぶ。\n開始を押す。", "お願い\nやけどに注意してください。",
    ]


def test_retry_resumes_after_completed_batch():
    document = Document(title="お手入れ", blocks=[], organization_status="raw",
                        raw_pages=[RawPage(page=1, text="\n".join(f"文章{i}" for i in range(45)))])

    class InterruptedProvider(OpenAICompatibleProvider):
        def __init__(self):
            self.calls = []
            self.fail = True

        async def request(self, system, payload):
            self.calls.append(payload["lines"][0]["id"])
            if self.fail and len(self.calls) == 2:
                raise RuntimeError("temporary failure")
            return {"sections": [{"title": "お手入れ", "kind": "other", "tags": [],
                                   "line_ids": [line["id"] for line in payload["lines"]]}],
                    "excluded_line_ids": []}

    provider = InterruptedProvider()
    with pytest.raises(SourceOrganizationInterrupted) as caught:
        asyncio.run(organize_source(document, provider, strict=True))
    partial = caught.value.partial
    assert partial.organization_completed_batches == ["1:0"]
    assert partial.organization_status == "provisional"
    provider.fail = False
    result = asyncio.run(organize_source(partial, provider, strict=True))
    assert provider.calls == ["p1-l1", "p1-l41", "p1-l41"]
    assert result.organization_status == "ai"
    assert result.organization_completed_batches == ["1:0", "1:40"]
    assert "文章0" in result.blocks[0].source_text
    assert "文章44" in result.blocks[-1].source_text
