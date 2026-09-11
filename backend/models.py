from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class MaterialBriefRequest(ApiModel):
    material_id: str = Field(min_length=1, max_length=300)
    title: str = Field(min_length=1, max_length=300)
    author: str = Field(default="", max_length=120)
    body_text: str = Field(default="", max_length=30000)
    source_url: str = Field(min_length=1, max_length=1000)
    captured_at: datetime
    content_hash: str = Field(pattern=r"^v1-[0-9a-f]{8}$")


class EvidenceItem(ApiModel):
    id: str = Field(pattern=r"^E[1-9][0-9]*$")
    quote: str = Field(min_length=2, max_length=240)


class SupportedStatement(ApiModel):
    text: str = Field(min_length=2, max_length=300)
    evidence_ids: list[str] = Field(min_length=1, max_length=6)


class EntityItem(ApiModel):
    kind: Literal["place", "tool", "product", "person", "time", "cost", "other"]
    name: str = Field(min_length=1, max_length=120)
    evidence_ids: list[str] = Field(min_length=1, max_length=6)


class ContentBrief(ApiModel):
    material_id: str
    content_hash: str = Field(pattern=r"^v1-[0-9a-f]{8}$")
    content_type: Literal["tutorial", "guide", "experience", "review", "opinion", "list", "other"]
    one_line_summary: str = Field(min_length=8, max_length=160)
    one_line_summary_evidence_ids: list[str] = Field(min_length=1, max_length=6)
    key_points: list[SupportedStatement] = Field(default_factory=list, max_length=12)
    author_views: list[SupportedStatement] = Field(default_factory=list, max_length=8)
    actions: list[SupportedStatement] = Field(default_factory=list, max_length=12)
    entities: list[EntityItem] = Field(default_factory=list, max_length=20)
    warnings: list[SupportedStatement] = Field(default_factory=list, max_length=8)
    unknowns: list[str] = Field(default_factory=list, max_length=8)
    evidence: list[EvidenceItem] = Field(min_length=1, max_length=24)
    confidence: Literal["high", "medium", "low"]
    model_version: str = Field(min_length=1, max_length=120)
    generated_at: datetime

    @model_validator(mode="after")
    def statements_reference_known_evidence(self) -> "ContentBrief":
        evidence_ids = [item.id for item in self.evidence]
        if len(evidence_ids) != len(set(evidence_ids)):
            raise ValueError("duplicate evidence ids are not allowed")
        known = {item.id for item in self.evidence}
        referenced: list[str] = list(self.one_line_summary_evidence_ids)
        for group in (self.key_points, self.author_views, self.actions, self.entities, self.warnings):
            for item in group:
                referenced.extend(item.evidence_ids)
        unknown = sorted(set(referenced) - known)
        if unknown:
            raise ValueError(f"unknown evidence ids: {', '.join(unknown)}")
        return self


class MaterialBriefResponse(ApiModel):
    status: Literal["succeeded", "insufficient"]
    brief: ContentBrief | None = None
    message: str = ""

    @model_validator(mode="after")
    def status_matches_payload(self) -> "MaterialBriefResponse":
        if self.status == "succeeded" and self.brief is None:
            raise ValueError("succeeded response requires brief")
        if self.status == "insufficient" and self.brief is not None:
            raise ValueError("insufficient response cannot include brief")
        return self


class SettingsUpdate(ApiModel):
    base_url: str = Field(min_length=1, max_length=1000)
    model: str = Field(min_length=1, max_length=200)
    api_key: str = Field(default="", max_length=1000)


class SettingsView(ApiModel):
    configured: bool
    base_url: str = ""
    model: str = ""
    has_api_key: bool = False


class WorkbookImageExportRequest(ApiModel):
    html: str = Field(min_length=1, max_length=2_000_000)
    page_numbers: list[int] = Field(min_length=1, max_length=5)
    canvas_mode: Literal["a4", "adaptive"] = "a4"

    @model_validator(mode="after")
    def page_selection_is_valid(self) -> "WorkbookImageExportRequest":
        if len(self.page_numbers) != len(set(self.page_numbers)):
            raise ValueError("page numbers must be unique")
        if any(page_number < 1 or page_number > 5 for page_number in self.page_numbers):
            raise ValueError("page numbers must be between 1 and 5")
        self.page_numbers.sort()
        return self


class WorkbookImagePage(ApiModel):
    page_number: int = Field(ge=1, le=5)
    filename: str = Field(pattern=r"^shiji-report-page-0[1-5]\.png$")
    mime_type: Literal["image/png"] = "image/png"
    data_base64: str = Field(min_length=1)


class WorkbookImageExportResponse(ApiModel):
    pages: list[WorkbookImagePage] = Field(min_length=1, max_length=5)


class ReportCitation(ApiModel):
    id: str = Field(pattern=r"^C[1-9][0-9]*$")
    material_id: str = Field(min_length=1, max_length=300)
    evidence_ids: list[str] = Field(min_length=1, max_length=12)


class ReportStatement(ApiModel):
    text: str = Field(min_length=2, max_length=500)
    citation_ids: list[str] = Field(default_factory=list, max_length=12)
    origin: Literal["source", "user"] = "source"
    verification_status: Literal["supported", "needs_verification"] = "supported"
    verification_note: str = Field(default="", max_length=500)


class ReportSupplement(ApiModel):
    text: str = Field(min_length=2, max_length=500)
    origin: Literal["ai_supplement"] = "ai_supplement"
    citation_ids: list[str] = Field(default_factory=list, max_length=0)
    verification_status: Literal["needs_verification"] = "needs_verification"
    verification_note: str = Field(min_length=2, max_length=500)


class PreflightAction(ApiModel):
    title: str = Field(min_length=2, max_length=160)
    purpose: str = Field(min_length=2, max_length=500)
    steps: list[str] = Field(default_factory=list, max_length=12)
    success_check: str = Field(min_length=2, max_length=300)
    fallback: str = Field(min_length=2, max_length=500)
    origin: Literal["source"] = "source"
    citation_ids: list[str] = Field(min_length=1, max_length=12)
    verification_status: Literal["supported", "needs_verification"] = "supported"
    verification_note: str = Field(default="", max_length=500)

class PurposeReportRequest(ApiModel):
    goal: str = Field(min_length=4, max_length=2000)
    constraints: list[str] = Field(default_factory=list, max_length=12)
    selected_materials: list[ContentBrief] = Field(min_length=2, max_length=30)
    source_revision: str = Field(default="", max_length=120)
    report_preset: Literal["tutorial", "travel", "generic"] | None = None
    familiarity_level: Literal["beginner", "informed"] = "beginner"
    supplement_mode: Literal["source_only", "labeled_supplement"] = "source_only"

    @model_validator(mode="after")
    def selected_materials_are_unique(self) -> "PurposeReportRequest":
        ids = [item.material_id for item in self.selected_materials]
        if len(ids) != len(set(ids)):
            raise ValueError("selected materials must be unique")
        return self


class PurposeReport(ApiModel):
    report_id: str = Field(min_length=1, max_length=300)
    source_revision: str = Field(min_length=1, max_length=120)
    goal_understanding: str = Field(min_length=4, max_length=1000)
    executive_summary: str = Field(min_length=8, max_length=2000)
    themes: list[ReportStatement] = Field(default_factory=list, max_length=20)
    conflicts: list[ReportStatement] = Field(default_factory=list, max_length=12)
    information_gaps: list[str] = Field(default_factory=list, max_length=20)
    next_actions: list[ReportStatement] = Field(default_factory=list, max_length=20)
    preflight_actions: list[PreflightAction] = Field(default_factory=list, max_length=12)
    supplements: list[ReportSupplement] = Field(default_factory=list, max_length=12)
    citations: list[ReportCitation] = Field(min_length=1, max_length=60)
    confidence: Literal["high", "medium", "low"]
    model_version: str = Field(min_length=1, max_length=120)
    generated_at: datetime
    report_preset: Literal["tutorial", "travel", "generic"] = "generic"
    familiarity_level: Literal["beginner", "informed"] = "beginner"
    supplement_mode: Literal["source_only", "labeled_supplement"] = "source_only"

    @model_validator(mode="after")
    def references_known_citations(self) -> "PurposeReport":
        known = {item.id for item in self.citations}
        referenced: list[str] = []
        for group in (self.themes, self.conflicts, self.next_actions, self.preflight_actions):
            for item in group:
                referenced.extend(item.citation_ids)
        unknown = sorted(set(referenced) - known)
        if unknown:
            raise ValueError(f"unknown citation ids: {', '.join(unknown)}")
        if len({item.id for item in self.citations}) != len(self.citations):
            raise ValueError("duplicate citation ids are not allowed")
        for supplement in self.supplements:
            if supplement.origin != "ai_supplement":
                raise ValueError("supplements must be marked as ai_supplement")
            if supplement.verification_status != "needs_verification":
                raise ValueError("supplements must be marked as needs_verification")
            if supplement.citation_ids:
                raise ValueError("supplements cannot reference source citations")
        return self
