from dataclasses import dataclass

from .models import Document, SourceSection


@dataclass
class ManualPart:
    title: str
    category_name: str
    document: Document


def classification_groups(document: Document) -> list[dict]:
    groups = []
    sections = document.source_sections
    if not sections:
        pages = sorted({block.source_page for block in document.blocks})
        sections = [SourceSection(id=f"page:{page}", title=f"ページ{page}",
                                  start_page=page, end_page=page) for page in pages]
    for section in sections:
        blocks = [block for block in document.blocks
                  if section.start_page <= block.source_page <= section.end_page]
        if blocks:
            groups.append({
                "id": section.id, "title": section.title,
                "pages": f"{section.start_page}-{section.end_page}",
                "text_excerpt": " ".join(block.source_text for block in blocks[:5])[:300],
                "source_block_ids": [block.id for block in blocks],
            })
    return groups


def expand_group_plan(document: Document, proposal: dict, groups: list[dict]) -> dict:
    by_id = {group["id"]: group["source_block_ids"] for group in groups}
    expanded = {**proposal, "sections": []}
    assigned: list[str] = []
    for section in proposal.get("sections", []):
        ids = section.get("source_group_ids")
        if not isinstance(ids, list) or not ids or any(item not in by_id for item in ids):
            raise ValueError("原文にない章が指定されました。")
        assigned.extend(ids)
        expanded["sections"].append({
            **section,
            "source_block_ids": [block_id for group_id in ids for block_id in by_id[group_id]],
        })
    if len(assigned) != len(by_id) or set(assigned) != set(by_id):
        raise ValueError("原文の章に重複または欠落があります。")
    return expanded


def outline_fallback_plan(document: Document, groups: list[dict]) -> dict:
    """Keep a long upload usable when the classification provider is unavailable."""
    sections = []
    for group in groups:
        heading = group["title"].split(" / ")[-1].strip() or f"ページ{group['pages']}"
        if "安全" in heading:
            category = "安全上の注意"
        elif any(word in heading for word in ("お手入れ", "掃除", "清掃")):
            category = "お手入れ"
        elif any(word in heading for word in ("修理", "できない", "表示", "お問い合わせ", "保証")):
            category = "困ったとき"
        elif any(word in heading for word in (
            "調理", "あたため", "レンジ", "オーブン", "グリル", "トースト",
            "パスタ", "パン", "解凍", "コース", "メニュー", "牛乳", "ごはん",
        )):
            category = "調理方法"
        else:
            category = "基本情報"
        sections.append({
            "title": heading[:160], "category_name": category,
            "source_group_ids": [group["id"]], "image_ids": [],
        })
    introduction: list[str] = []
    while sections and sections[0]["title"] in {"表紙", "初めに", "はじめに", "もくじ", "目次"}:
        introduction.extend(sections.pop(0)["source_group_ids"])
    if introduction:
        sections.insert(0, {
            "title": "取扱説明書の概要", "category_name": "基本情報",
            "source_group_ids": introduction, "image_ids": [],
        })
    if len(sections) > 40:
        step = (len(sections) + 39) // 40
        sections = [
            {**sections[index], "source_group_ids": [group_id
                for section in sections[index:index + step]
                for group_id in section["source_group_ids"]]}
            for index in range(0, len(sections), step)
        ]
    folder = document.title.strip()[:80] or "取扱説明書"
    for suffix in ("取扱説明書", "取説", "マニュアル"):
        if folder.endswith(suffix) and len(folder) > len(suffix):
            folder = folder[:-len(suffix)]
            break
    return {"folder_name": folder, "sections": sections}


def split_document(document: Document, proposal: dict) -> tuple[str, list[ManualPart]]:
    """Accept an AI plan only when it accounts for every source step and figure."""
    folder_name = proposal.get("folder_name")
    sections = proposal.get("sections")
    if not isinstance(folder_name, str) or not 1 <= len(folder_name.strip()) <= 80:
        raise ValueError("フォルダ名を確認できませんでした。")
    if not isinstance(sections, list) or not 1 <= len(sections) <= 40:
        raise ValueError("分割されたマニュアルを確認できませんでした。")
    source_by_id = {block.id: block for block in document.blocks}
    image_by_id = {image.id: image for image in document.images}
    assigned: list[str] = []
    parsed: list[tuple[str, str, list[str], list[str]]] = []
    for section in sections:
        if not isinstance(section, dict):
            raise ValueError("分割結果の形式を確認できませんでした。")
        title, category = section.get("title"), section.get("category_name")
        block_ids, image_ids = section.get("source_block_ids"), section.get("image_ids", [])
        if (not isinstance(title, str) or not 1 <= len(title.strip()) <= 160
                or not isinstance(category, str) or not 1 <= len(category.strip()) <= 80
                or not isinstance(block_ids, list) or not block_ids
                or not isinstance(image_ids, list)):
            raise ValueError("各マニュアルの名前・カテゴリー・手順を確認できませんでした。")
        if (any(not isinstance(item, str) or item not in source_by_id for item in block_ids)
                or any(not isinstance(item, str) or item not in image_by_id for item in image_ids)):
            raise ValueError("原文にない手順または図が指定されました。")
        assigned.extend(block_ids)
        parsed.append((title.strip(), category.strip(), block_ids, image_ids))
    if len(assigned) != len(source_by_id) or set(assigned) != set(source_by_id):
        raise ValueError("原文の手順に重複または欠落があります。")

    source_order = {block.id: index for index, block in enumerate(document.blocks)}
    parsed.sort(key=lambda section: min(source_order[item] for item in section[2]))
    # Keep each diagram in one resulting manual, even if the model repeats its ID.
    assigned_images: set[str] = set()
    for _, _, _, image_ids in parsed:
        unique = [image_id for image_id in image_ids if image_id not in assigned_images]
        image_ids[:] = unique
        assigned_images.update(unique)

    # Keep every extracted figure even when the model did not assign it.
    for image in document.images:
        if any(image.id in image_ids for _, _, _, image_ids in parsed):
            continue
        destination = next(
            (index for index, (_, _, block_ids, _) in enumerate(parsed)
             if any(source_by_id[block_id].source_page == image.page for block_id in block_ids)),
            0,
        )
        parsed[destination][3].append(image.id)

    parts = []
    for title, category, block_ids, image_ids in parsed:
        chosen_images = set(image_ids)
        chosen_blocks = set(block_ids)
        blocks = [block.model_copy(deep=True) for block in document.blocks if block.id in chosen_blocks]
        for block in blocks:
            block.image_ids = [image_id for image_id in block.image_ids if image_id in chosen_images]
        images = [image.model_copy(deep=True) for image in document.images if image.id in chosen_images]
        # A figure selected by the model must appear in at least one generated step.
        for image in images:
            if not any(image.id in block.image_ids for block in blocks):
                blocks[0].image_ids.append(image.id)
        parts.append(ManualPart(
            title=title, category_name=category,
            document=Document(title=title, blocks=blocks, images=images,
                              raw_pages=[page.model_copy(deep=True) for page in document.raw_pages
                                         if any(block.source_page == page.page for block in blocks)],
                              visual_groups=[group.model_copy(deep=True) for group in document.visual_groups
                                             if any(block.source_page == group.page for block in blocks)],
                              excluded_lines=[line.model_copy(deep=True) for line in document.excluded_lines
                                              if any(block.source_page == line.page for block in blocks)],
                              organization_status=document.organization_status,
                              extraction_notes=document.extraction_notes.copy()),
        ))
    return folder_name.strip(), parts
