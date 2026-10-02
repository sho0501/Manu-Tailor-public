from typing import Literal

from pydantic import BaseModel, Field


class Profile(BaseModel):
    max_sentence_chars: int = Field(40, ge=15, le=120)
    steps_per_screen: int = Field(1, ge=1, le=3)
    use_furigana: bool = False
    prefer_images: bool = True
    line_spacing: float = Field(1.7, ge=1.3, le=2.5)
    highlight_warnings: bool = True
    rewrite_negation_when_safe: bool = False
    negation_support: float = Field(0.5, ge=0, le=1)
    use_bullets: bool = True
    language: Literal["ja", "ja-easy", "en", "zh", "vi", "other"] = "ja"
    japanese_reading: Literal["none", "kana", "comfortable"] = "comfortable"
    telemetry_consent: bool = False
    text_complexity: float = Field(0.5, ge=0, le=1)
    preferred_sentence_length: Literal["short", "normal"] = "short"
    visual_support: float = Field(0.7, ge=0, le=1)
    step_granularity: float = Field(0.8, ge=0, le=1)
    highlight_level: float = Field(0.7, ge=0, le=1)
    reading_support: bool = False
    furigana: bool = False
    high_contrast: bool = False
    font_scale: float = Field(1.1, ge=1, le=1.6)
    color_sensitivity: Literal["normal", "reduced"] = "normal"
    preferred_information_style: Literal["visual", "text", "balanced"] = "balanced"
    working_memory_support: float = Field(0.8, ge=0, le=1)
    theme: Literal["light", "dark"] = "light"
    speech_rate: float = Field(0.9, ge=0.5, le=1.5)


class SourceBlock(BaseModel):
    id: str
    source_page: int
    source_block: int
    source_text: str
    kind: str = "step"
    step_label: str | None = Field(default=None, max_length=20)
    tags: list[str] = Field(default_factory=list)
    heading: str = "手順"
    warnings: list[str] = Field(default_factory=list)
    image_ids: list[str] = Field(default_factory=list)


class ImageBlock(BaseModel):
    id: str
    image_path: str
    page: int
    caption: str = "原文の図"
    description: str | None = None
    important_elements: list[str] = Field(default_factory=list)
    source_reference: str
    tags: list[str] = Field(default_factory=list)


class SourceSection(BaseModel):
    id: str
    title: str
    start_page: int
    end_page: int


class RawPage(BaseModel):
    page: int
    text: str


class VisualGroup(BaseModel):
    page: int
    text: str
    kind: Literal["frame", "paragraph", "caption", "other"] = "paragraph"
    bbox: tuple[int, int, int, int] | None = None


class ExcludedLine(BaseModel):
    page: int
    line: int
    text: str


class Document(BaseModel):
    title: str
    blocks: list[SourceBlock]
    raw_pages: list[RawPage] = Field(default_factory=list)
    visual_groups: list[VisualGroup] = Field(default_factory=list)
    excluded_lines: list[ExcludedLine] = Field(default_factory=list)
    organization_status: Literal["raw", "ai", "provisional"] = "provisional"
    organization_completed_batches: list[str] = Field(default_factory=list)
    images: list[ImageBlock] = Field(default_factory=list)
    source_sections: list[SourceSection] = Field(default_factory=list)
    extraction_notes: list[str] = Field(default_factory=list)


class GeneratedBlock(BaseModel):
    id: str
    generated_text: str
    source_block_ids: list[str]
    step_label: str | None = Field(default=None, max_length=20)
    transformation_type: list[str] = Field(default_factory=list)
    reason: str
    warnings: list[str] = Field(default_factory=list)
    image_ids: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class Issue(BaseModel):
    severity: Literal["CRITICAL", "ERROR", "WARNING"]
    code: str
    message: str
    source_block_id: str | None = None


class ConsistencyReport(BaseModel):
    status: Literal["pass", "warning", "fail"]
    issues: list[Issue]
    checks: dict[str, bool]
    semantic_score: float
    semantic_method: str = "character-bigram"
    llm_status: str = "not_run"
