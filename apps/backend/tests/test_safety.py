import asyncio

import pytest

from app.ingestion import structure
from app.models import Profile
from app.providers import MockAIProvider
from app.validation import inspect


def prepare(text):
    document = structure([(1, text)], "テスト")
    blocks = asyncio.run(MockAIProvider().generate(document, Profile(), []))
    return document, blocks


@pytest.mark.parametrize(
    "original,changed,code",
    [
        ("10kgまで載せることができます。", "100kgまで載せることができます。", "numbers"),
        ("電源を切らないでください。", "電源を切ってください。", "negation"),
        ("10mmに設定してください。", "10cmに設定してください。", "units"),
        ("「主電源」を押してください。", "「停止」を押してください。", "terms"),
    ],
)
def test_critical_mutation(original, changed, code):
    document, blocks = prepare(original)
    blocks[0].generated_text = changed
    report = inspect(document, blocks, "safety")
    assert report.status == "fail"
    assert any(i.code == code and i.severity == "CRITICAL" for i in report.issues)


def test_missing_required_warning():
    document, blocks = prepare("必ず保護メガネを装着してください。")
    report = inspect(document, [])
    assert any(i.severity == "CRITICAL" for i in report.issues)


def test_missing_eighth_step_and_order():
    document, blocks = prepare("\n".join(f"{i}. 作業{i}を行ってください。" for i in range(1, 9)))
    assert inspect(document, blocks).status == "pass"
    assert any(
        i.code == "missing_step" and i.severity == "ERROR" for i in inspect(document, blocks[:7]).issues
    )
    assert inspect(document, list(reversed(blocks))).status == "fail"


def test_profile_changes_layout_and_keeps_mapping():
    document = structure([(1, "原稿を置いてください。カバーを閉じてください。")], "原稿")
    document.blocks[0].step_label = "①"
    blocks = asyncio.run(MockAIProvider().generate(document, Profile(step_granularity=1), []))
    assert len(blocks) == 2
    assert inspect(document, blocks).status == "pass"
    assert blocks[0].source_block_ids == [document.blocks[0].id]
    assert all(block.step_label == "①" for block in blocks)


def test_mapping_and_image_loss():
    document, blocks = prepare("操作してください。")
    document.blocks[0].image_ids = ["important-diagram"]
    assert any(i.code == "images" for i in inspect(document, blocks).issues)
    blocks[0].source_block_ids = ["invented"]
    assert any(i.code == "mapping" for i in inspect(document, blocks).issues)
