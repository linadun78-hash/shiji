import hashlib
import re
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from pydantic import ValidationError

from .config import LLMConfig
from .llm_client import ProviderError, request_json
from .models import PurposeReport, PurposeReportRequest
from .report_prompts import build_report_messages, infer_report_preset


QUANTITATIVE_TOKEN = re.compile(
    r"(?:[$¥￥]\s*)?\d+(?:\.\d+)?(?:\s*(?:至|到|-)\s*\d+(?:\.\d+)?)?\s*"
    r"(?:元|rmb|cny|usd|r|号线|号|小时|分钟|点|月|日|公里|km|天|周|版|"
    r"人|位|个|条|次|张|份|件|晚|%|％|percent|people?)?",
    re.IGNORECASE,
)
CHINESE_QUANTITATIVE_TOKEN = re.compile(
    r"[零〇一二两三四五六七八九十百千万]+\s*"
    r"(?:元|人|位|公里|km|小时|分钟|天|周|月|日|次|张|份|件|晚|条|版)",
    re.IGNORECASE,
)
CHINESE_CLOCK_TOKEN = re.compile(
    r"(?:凌晨|早上|上午|中午|下午|晚上)?"
    r"[零〇一二两三四五六七八九十百\d]{1,3}点"
    r"(?:[零〇一二两三四五六七八九十百\d]{1,3}分)?"
)
VERSION_TOKEN = re.compile(
    r"版本\s*\d+(?:\.\d+)*|\bversion\s*\d+(?:\.\d+)*|\bv\d+(?:\.\d+)*\b",
    re.IGNORECASE,
)
TIME_TOKEN = re.compile(r"\b(?:[01]?\d|2[0-3]):[0-5]\d\b")
ENGLISH_ADDRESS_TOKEN = re.compile(
    r"\b\d+\s+[A-Za-z][A-Za-z .'-]{1,40}\s"
    r"(?:street|st|road|rd|avenue|ave|lane|ln|boulevard|blvd)\b",
    re.IGNORECASE,
)
CHINESE_ADDRESS_CLAUSE = re.compile(
    r"[^，。；,;]{1,60}(?:街道|路|街|巷)\s*\d+\s*号"
)
RELATIVE_TIME_TERMS = (
    "今天", "今日", "明天", "昨天", "昨日", "现在", "最近", "近期",
    "本周", "这周", "下周", "上周", "本月", "下月", "今年", "明年", "未来一周",
)
VOLATILE_NOTE_QUALIFIER = re.compile(
    r"可能(?:变化|变更|过时)|以.{0,12}最新.{0,12}为准|时效|"
    r"may\s+change|subject\s+to\s+change|current\s+(?:official\s+)?version",
    re.IGNORECASE,
)


class ReportGenerationError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        retryable: bool = False,
        diagnostic_id: str = "",
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.diagnostic_id = diagnostic_id


def make_source_revision(request: PurposeReportRequest) -> str:
    if request.source_revision:
        return request.source_revision
    source = "|".join(f"{item.material_id}:{item.content_hash}" for item in request.selected_materials)
    return "rev-" + hashlib.sha256(source.encode("utf-8")).hexdigest()[:12]


def compact_text(value: str) -> str:
    return re.sub(r"\s+", "", value).casefold()


def normalized_claim(value: str) -> str:
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", value.casefold())


def corresponds_to_user_request(text: str, request: PurposeReportRequest) -> bool:
    candidate = normalized_claim(text)
    for value in (request.goal, *request.constraints):
        expected = normalized_claim(value)
        if expected and candidate == expected:
            return True
    return False


def chinese_address_tokens(text: str) -> list[str]:
    tokens: list[str] = []
    for match in CHINESE_ADDRESS_CLAUSE.finditer(text):
        candidate = compact_text(match.group(0))
        candidate = re.sub(
            r"^.*?(?:地址|集合点|地点)(?:是|为|在|位于)?",
            "",
            candidate,
        )
        candidate = re.sub(r"^.*?位于", "", candidate)
        if candidate:
            tokens.append(candidate)
    return tokens


def claim_tokens(text: str) -> list[str]:
    tokens = [
        match.group(0)
        for pattern in (
            CHINESE_CLOCK_TOKEN,
            CHINESE_QUANTITATIVE_TOKEN,
            QUANTITATIVE_TOKEN,
            VERSION_TOKEN,
            TIME_TOKEN,
            ENGLISH_ADDRESS_TOKEN,
        )
        for match in pattern.finditer(text)
        if match.group(0).strip()
    ]
    tokens.extend(chinese_address_tokens(text))
    return list(dict.fromkeys(tokens))


def relative_time_is_qualified(text: str, term: str) -> bool:
    if "发布时间" in text:
        return True
    if "时效" in text and any(value in text for value in ("需核验", "待确认", "无法确认", "未确认")):
        return True
    clause = next(
        (value for value in re.split(r"[，,。；;]", text) if term in value),
        "",
    )
    return bool(re.search(
        re.escape(term) + r".{0,18}(?:需核验|待确认|无法确认|未确认|可能过时)",
        clause,
    ))


def validate_statement_claims(report: PurposeReport, request: PurposeReportRequest) -> None:
    materials = {
        item.material_id: {evidence.id: evidence.quote for evidence in item.evidence}
        for item in request.selected_materials
    }
    citations = {item.id: item for item in report.citations}
    raw_user_context = " ".join([request.goal, *request.constraints])
    user_context = compact_text(raw_user_context)

    def validate_text_tokens(text: str, allowed: str, relative_time_context: str = "") -> None:
        for token in claim_tokens(text):
            if compact_text(token) not in allowed:
                raise ValueError(f"unsupported quantitative claim: {token}")
        for term in RELATIVE_TIME_TERMS:
            if term not in text:
                continue
            is_user_relative_time = term in relative_time_context
            if not is_user_relative_time and not relative_time_is_qualified(text, term):
                raise ValueError("relative time must be explicitly qualified")

    def validate_claim(text: str, citation_ids: list[str], origin: str) -> None:
        if origin == "source" and not citation_ids:
            raise ValueError("source statement must cite evidence")
        if origin == "user" and citation_ids:
            raise ValueError("user statement cannot cite source evidence")
        if origin == "user" and not corresponds_to_user_request(text, request):
            raise ValueError("user statement must correspond to the user request")
        evidence_quotes: list[str] = []
        for citation_id in citation_ids:
            citation = citations.get(citation_id)
            if citation is None:
                raise ValueError(f"statement references unknown citation: {citation_id}")
            evidence_quotes.extend(
                materials[citation.material_id][evidence_id]
                for evidence_id in citation.evidence_ids
            )
        allowed = compact_text(" ".join(evidence_quotes)) if origin == "source" else user_context
        validate_text_tokens(text, allowed, raw_user_context if origin == "user" else "")

    cited_evidence = []
    for citation in report.citations:
        cited_evidence.extend(
            materials[citation.material_id][evidence_id]
            for evidence_id in citation.evidence_ids
        )
    summary_context = compact_text(" ".join(cited_evidence)) + user_context
    validate_text_tokens(report.goal_understanding, user_context, raw_user_context)
    validate_text_tokens(
        report.executive_summary,
        summary_context,
        raw_user_context,
    )
    for gap in report.information_gaps:
        validate_text_tokens(gap, summary_context, raw_user_context)

    for group in (report.themes, report.conflicts, report.next_actions):
        for statement in group:
            validate_claim(statement.text, statement.citation_ids, statement.origin)
    for action in report.preflight_actions:
        validate_claim(action.title, action.citation_ids, action.origin)
        validate_claim(action.purpose, action.citation_ids, action.origin)
        for step in action.steps:
            validate_claim(step, action.citation_ids, action.origin)
        validate_claim(action.success_check, action.citation_ids, action.origin)
        validate_claim(action.fallback, action.citation_ids, action.origin)


def validate_report_grounding(report: PurposeReport, request: PurposeReportRequest) -> None:
    materials = {item.material_id: {evidence.id for evidence in item.evidence} for item in request.selected_materials}
    for citation in report.citations:
        if citation.material_id not in materials:
            raise ValueError(f"citation {citation.id} references unknown material")
        unknown = sorted(set(citation.evidence_ids) - materials[citation.material_id])
        if unknown:
            raise ValueError(f"citation {citation.id} references unknown evidence: {', '.join(unknown)}")
    if request.supplement_mode == "source_only" and report.supplements:
        raise ValueError("source-only reports cannot contain supplements")
    if request.supplement_mode == "labeled_supplement":
        for supplement in report.supplements:
            if supplement.origin != "ai_supplement" or supplement.verification_status != "needs_verification":
                raise ValueError("supplements must be labeled for verification")
            is_volatile = bool(claim_tokens(supplement.text)) or any(
                term in supplement.text for term in RELATIVE_TIME_TERMS
            )
            if is_volatile and not VOLATILE_NOTE_QUALIFIER.search(supplement.verification_note):
                raise ValueError("volatile supplements must explicitly warn that the information may change")
    validate_statement_claims(report, request)


def generate_purpose_report(
    request: PurposeReportRequest,
    config: LLMConfig,
    *,
    call_json: Callable[[LLMConfig, list[dict[str, str]]], dict[str, Any]] = request_json,
    now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
) -> PurposeReport:
    revision = make_source_revision(request)
    report_id = "report-" + hashlib.sha256(f"{request.goal}:{revision}".encode("utf-8")).hexdigest()[:12]
    last_error = ""
    last_diagnostic_id = ""
    for attempt in range(2):
        try:
            if call_json is request_json:
                payload = call_json(
                    config,
                    build_report_messages(
                        request,
                        last_error,
                        prompt_version=config.report_prompt_version,
                    ),
                    operation="purpose_report",
                )
            else:
                payload = call_json(
                    config,
                    build_report_messages(
                        request,
                        last_error,
                        prompt_version=config.report_prompt_version,
                    ),
                )
            last_diagnostic_id = getattr(payload, "diagnostic_id", "")
            trusted_payload = {
                **payload,
                "reportId": report_id,
                "sourceRevision": revision,
                "modelVersion": config.model,
                "generatedAt": now().isoformat(),
                "reportPreset": request.report_preset or infer_report_preset(request.goal),
                "familiarityLevel": request.familiarity_level,
                "supplementMode": request.supplement_mode,
            }
            report = PurposeReport.model_validate(trusted_payload)
            validate_report_grounding(report, request)
            return report
        except ProviderError as exc:
            if exc.retryable and attempt == 0:
                last_error = exc.code
                continue
            raise
        except (ValidationError, ValueError) as exc:
            last_error = str(exc)
            if hasattr(payload, "record_validation_failure"):
                payload.record_validation_failure(type(exc).__name__)
    raise ReportGenerationError(
        "invalid_report_grounding",
        "模型已返回，但报告结果未通过校验",
        diagnostic_id=last_diagnostic_id,
    )
