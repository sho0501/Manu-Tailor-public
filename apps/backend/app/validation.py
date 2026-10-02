import re
from collections import Counter
from typing import Literal

from .models import ConsistencyReport, Document, GeneratedBlock, Issue

NUMBER = re.compile(r"\d+(?:[.,]\d+)*")
UNIT = re.compile(r"\d+(?:\.\d+)?\s*(?:kg|mg|g|mm|cm|km|m|ml|mL|L|℃|°C|%|秒|分|時間|個|枚|回|錠|時|日|月|年)")
PROTECTED = re.compile(r"https?://[^\s]+|[A-Za-z]+[A-Za-z0-9_-]*|「[^」]+」")
NEGATION = re.compile(r"ないで|してはいけ|禁止|不可|するな|なりません|しない|ません")


def review_generated(document: Document, blocks: list[GeneratedBlock]) -> list[GeneratedBlock]:
    """Join split output for one source item and restore its reviewed tags."""
    source_by_id = {source.id: source for source in document.blocks}
    result: list[GeneratedBlock] = []
    for original in blocks:
        block = original.model_copy(deep=True)
        sources = [source_by_id[source_id] for source_id in block.source_block_ids
                   if source_id in source_by_id]
        if sources:
            block.tags = list(dict.fromkeys(tag for source in sources for tag in source.tags))
        previous = result[-1] if result else None
        if (previous and previous.source_block_ids == block.source_block_ids
                and len(sources) == 1 and (sources[0].kind != "step"
                                            or not re.search(r"[。.!！?？]$", previous.generated_text.strip()))):
            separator = "\n" if previous.generated_text.strip() in {"お願い", "注意", "警告", "危険"} else ""
            previous.generated_text = previous.generated_text.rstrip() + separator + block.generated_text.lstrip()
            previous.warnings = list(dict.fromkeys(previous.warnings + block.warnings))
            previous.image_ids = list(dict.fromkeys(previous.image_ids + block.image_ids))
            previous.transformation_type = list(dict.fromkeys(
                previous.transformation_type + block.transformation_type))
            previous.tags = block.tags
        else:
            result.append(block)
    return result


def bigram(text: str) -> set[str]:
    clean = re.sub(r"\s+", "", text)
    return {clean[i : i + 2] for i in range(max(0, len(clean) - 1))}


def inspect(document: Document, blocks: list[GeneratedBlock], mode: str = "speed") -> ConsistencyReport:
    issues: list[Issue] = []
    source_ids = [b.id for b in document.blocks]
    mapped: list[str] = []
    scores: list[float] = []

    def issue(
        code: str,
        message: str,
        block_id: str | None = None,
        severity: Literal["CRITICAL", "ERROR", "WARNING"] = "CRITICAL",
    ):
        issues.append(Issue(severity=severity, code=code, message=message, source_block_id=block_id))

    for generated in blocks:
        if not generated.source_block_ids or any(i not in source_ids for i in generated.source_block_ids):
            issue("mapping", "対応する原文がない生成手順があります。")
        for source_id in generated.source_block_ids:
            if not mapped or mapped[-1] != source_id:
                mapped.append(source_id)
    if mapped != source_ids:
        issue("step_order", "手順の不足・追加・順序変更を検出しました。", severity="ERROR")
    for source in document.blocks:
        matching = [b for b in blocks if source.id in b.source_block_ids]
        target = "\n".join(b.generated_text for b in matching)
        if not matching:
            issue(
                "missing_step",
                f"手順{source.source_block}が欠落しています。",
                source.id,
                "CRITICAL" if source.warnings else "ERROR",
            )
        for code, pattern, label in [
            ("numbers", NUMBER, "数値"),
            ("units", UNIT, "単位"),
            ("terms", PROTECTED, "固有語・URL・型番"),
        ]:

            def normalize(value: str) -> str:
                return re.sub(r"\s+", "", value)

            if Counter(map(normalize, pattern.findall(source.source_text))) != Counter(
                map(normalize, pattern.findall(target))
            ):
                issue(code, f"手順{source.source_block}: {label}が一致しません。", source.id)
        if Counter(NEGATION.findall(source.source_text)) != Counter(NEGATION.findall(target)):
            issue("negation", "禁止・否定表現の変更を検出しました。", source.id)
        for warning in source.warnings:
            if warning not in target or not any(warning in b.warnings for b in matching):
                issue("warnings", "注意・禁止・必須事項が保持されていません。", source.id)
        if not set(source.image_ids).issubset({i for b in matching for i in b.image_ids}):
            issue("images", "対応する画像が欠落しています。", source.id)
        original_terms = bigram(source.source_text)
        target_terms = bigram(target)
        score = len(original_terms & target_terms) / max(1, len(original_terms | target_terms))
        scores.append(score)
        if score < (0.6 if mode == "safety" else 0.35):
            issue("semantics", "表現の変化が大きいため意味の確認が必要です。", source.id, "ERROR")
    codes = {issue.code for issue in issues}
    return ConsistencyReport(
        status="fail" if issues else "pass",
        issues=issues,
        checks={
            key: key not in codes
            for key in (
                "numbers",
                "units",
                "terms",
                "negation",
                "warnings",
                "missing_step",
                "step_order",
                "mapping",
                "images",
                "semantics",
            )
        },
        semantic_score=round(sum(scores) / max(1, len(scores)), 4),
    )
