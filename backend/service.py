from collections.abc import Callable
from datetime import datetime, timezone
import re
from typing import Any

from pydantic import ValidationError

from .config import LLMConfig
from .llm_client import ProviderError, request_json
from .models import ContentBrief, MaterialBriefRequest, MaterialBriefResponse
from .prompts import build_messages


QUESTION_SIGNAL = re.compile(r"哪里|哪儿|有什么|有没有|怎么|如何|求推荐|请问|想问|多少|几时|吗(?:$|[？?])")
HASHTAG = re.compile(r"#[^#\s]+")
CONCISE_PLANNING_FACT = re.compile(
    r"\d+(?:\.\d+)?\s*(?:元|号线|小时|分钟|点|月|日|公里|km|天|周)"
    r"|门票|地铁|公交|开放时间|地址|预约",
    re.IGNORECASE,
)
PLANNING_ENTITY_KINDS = {"place", "time", "cost"}
INSUFFICIENT_PLANNING_MESSAGE = "当前素材只有提问、标签或泛化描述，缺少可用于规划的事实。"


class BriefGenerationError(RuntimeError):
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


def normalize_text(value: str) -> str:
    return " ".join(value.split())


def source_is_question_only(request: MaterialBriefRequest) -> bool:
    source = request.body_text.replace(request.title, " ")
    source = normalize_text(HASHTAG.sub(" ", source))
    if not source:
        return True
    sentences = [part.strip() for part in re.split(r"[。！!\n]+", source) if part.strip()]
    return bool(sentences) and all(
        sentence.endswith(("?", "？")) or QUESTION_SIGNAL.search(sentence)
        for sentence in sentences
    )


def brief_has_planning_fact(brief: ContentBrief) -> bool:
    if brief.actions:
        return True
    if any(entity.kind in PLANNING_ENTITY_KINDS for entity in brief.entities):
        return True
    evidence = {item.id: item.quote for item in brief.evidence}
    for point in brief.key_points:
        quotes = [evidence.get(item, "") for item in point.evidence_ids]
        if any(
            quote and not QUESTION_SIGNAL.search(quote) and not quote.startswith("#")
            for quote in quotes
        ):
            return True
    return False


def validate_grounding(brief: ContentBrief, request: MaterialBriefRequest) -> None:
    source = normalize_text(request.body_text)
    if brief.material_id != request.material_id or brief.content_hash != request.content_hash:
        raise ValueError("response identity does not match request")
    for evidence in brief.evidence:
        if normalize_text(evidence.quote) not in source:
            raise ValueError(f"evidence {evidence.id} is not present in source")


def organize_material(
    request: MaterialBriefRequest,
    config: LLMConfig,
    *,
    call_json: Callable[[LLMConfig, list[dict[str, str]]], dict[str, Any]] = request_json,
    now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
) -> MaterialBriefResponse:
    normalized_body = normalize_text(request.body_text)
    if len(normalized_body) < 20 and not CONCISE_PLANNING_FACT.search(normalized_body):
        return MaterialBriefResponse(status="insufficient", message="当前正文不足，无法可靠整理。")

    last_error = ""
    last_diagnostic_id = ""
    for attempt in range(2):
        try:
            if call_json is request_json:
                payload = call_json(config, build_messages(request, last_error), operation="material_brief")
            else:
                payload = call_json(config, build_messages(request, last_error))
            last_diagnostic_id = getattr(payload, "diagnostic_id", "")
            trusted_payload = {
                **payload,
                "materialId": request.material_id,
                "contentHash": request.content_hash,
                "modelVersion": config.model,
                "generatedAt": now().isoformat(),
            }
            brief = ContentBrief.model_validate(trusted_payload)
            validate_grounding(brief, request)
            if source_is_question_only(request) or not brief_has_planning_fact(brief):
                return MaterialBriefResponse(
                    status="insufficient",
                    message=INSUFFICIENT_PLANNING_MESSAGE,
                )
            return MaterialBriefResponse(status="succeeded", brief=brief)
        except ProviderError as exc:
            if exc.retryable and attempt == 0:
                last_error = exc.code
                continue
            raise
        except (ValidationError, ValueError) as exc:
            last_error = str(exc)
            if hasattr(payload, "record_validation_failure"):
                payload.record_validation_failure(type(exc).__name__)

    raise BriefGenerationError(
        "invalid_grounding",
        "模型已返回，但整理结果未通过校验",
        diagnostic_id=last_diagnostic_id,
    )
