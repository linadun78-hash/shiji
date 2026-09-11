from datetime import datetime, timezone

import pytest

from backend.config import LLMConfig
from backend.llm_client import ProviderError
from backend.models import MaterialBriefRequest
from backend.service import BriefGenerationError, organize_material


class DiagnosticPayload(dict):
    diagnostic_id = "A1B2C3D4"


def request(body_text: str) -> MaterialBriefRequest:
    return MaterialBriefRequest.model_validate({
        "materialId": "task-1:xhs:note-1",
        "title": "工具安装步骤",
        "author": "测试作者",
        "bodyText": body_text,
        "sourceUrl": "https://www.xiaohongshu.com/explore/note-1",
        "capturedAt": "2026-08-09T09:00:00Z",
        "contentHash": "v1-abcd1234",
    })


def output(quote: str = "先安装示例工具") -> dict:
    return {
        "materialId": "untrusted-id",
        "contentHash": "v1-00000000",
        "contentType": "tutorial",
        "oneLineSummary": "作者说明了安装工具和重新启动应用的操作顺序。",
        "oneLineSummaryEvidenceIds": ["E1", "E2"],
        "keyPoints": [{"text": "安装后重新启动应用。", "evidenceIds": ["E1"]}],
        "authorViews": [],
        "actions": [{"text": "先安装工具。", "evidenceIds": ["E2"]}],
        "entities": [{"kind": "tool", "name": "示例工具", "evidenceIds": ["E2"]}],
        "warnings": [],
        "unknowns": ["没有说明最低系统版本。"],
        "evidence": [
            {"id": "E1", "quote": "安装完成后重新启动应用"},
            {"id": "E2", "quote": quote},
        ],
        "confidence": "high",
        "modelVersion": "untrusted-model",
        "generatedAt": "2020-01-01T00:00:00Z",
    }


def question_output() -> dict:
    payload = output("广州有什么地方网上不火，但是本地人常去的")
    payload.update({
        "contentType": "opinion",
        "oneLineSummary": "作者正在询问广州本地人常去的地点。",
        "oneLineSummaryEvidenceIds": ["E1"],
        "keyPoints": [{"text": "作者询问广州本地地点。", "evidenceIds": ["E1"]}],
        "actions": [],
        "entities": [{"kind": "place", "name": "广州", "evidenceIds": ["E1"]}],
        "evidence": [{"id": "E1", "quote": "广州有什么地方网上不火，但是本地人常去的"}],
        "confidence": "low",
    })
    return payload


def concise_fact_output() -> dict:
    payload = question_output()
    payload.update({
        "contentType": "guide",
        "oneLineSummary": "云台花园门票十元并可乘地铁到达。",
        "oneLineSummaryEvidenceIds": ["E1"],
        "keyPoints": [{"text": "门票10元。", "evidenceIds": ["E1"]}],
        "entities": [
            {"kind": "place", "name": "云台花园", "evidenceIds": ["E1"]},
            {"kind": "cost", "name": "10元", "evidenceIds": ["E1"]},
        ],
        "evidence": [{"id": "E1", "quote": "云台花园门票10元，地铁11号线可达"}],
        "confidence": "high",
    })
    return payload


def fixed_now() -> datetime:
    return datetime(2026, 8, 9, 10, 0, tzinfo=timezone.utc)


def test_short_source_returns_insufficient_without_calling_model() -> None:
    calls = []
    response = organize_material(
        request("正文太短"),
        LLMConfig("https://api.example/v1", "secret", "test-model"),
        call_json=lambda *args: calls.append(args),
    )
    assert response.status == "insufficient"
    assert response.brief is None
    assert calls == []


def test_question_and_hashtags_source_is_insufficient_after_model() -> None:
    body = "广州有什么地方网上不火，但是本地人常去的 #广州旅游 #当地人推荐"
    response = organize_material(
        request(body),
        LLMConfig("url", "key", "model"),
        call_json=lambda *_args: question_output(),
        now=fixed_now,
    )
    assert response.status == "insufficient"
    assert response.message == "当前素材只有提问、标签或泛化描述，缺少可用于规划的事实。"


def test_concise_source_with_supported_cost_remains_usable() -> None:
    body = "云台花园门票10元，地铁11号线可达"
    response = organize_material(
        request(body),
        LLMConfig("url", "key", "model"),
        call_json=lambda *_args: concise_fact_output(),
        now=fixed_now,
    )
    assert response.status == "succeeded"


def test_success_requires_every_quote_to_exist_in_source_and_overwrites_identity() -> None:
    body = "先安装示例工具。安装完成后重新启动应用，然后再创建第一个项目。"
    response = organize_material(
        request(body),
        LLMConfig("url", "key", "trusted-model"),
        call_json=lambda *args: output(),
        now=fixed_now,
    )
    assert response.status == "succeeded"
    assert response.brief is not None
    assert response.brief.evidence[1].quote == "先安装示例工具"
    assert response.brief.material_id == "task-1:xhs:note-1"
    assert response.brief.content_hash == "v1-abcd1234"
    assert response.brief.model_version == "trusted-model"
    assert response.brief.generated_at == fixed_now()


def test_invalid_quote_gets_one_repair_attempt() -> None:
    answers = iter([output("原文中不存在的句子"), output()])
    messages = []

    def fake_call(config, current_messages):
        messages.append(current_messages)
        return next(answers)

    response = organize_material(
        request("先安装示例工具。安装完成后重新启动应用，然后再创建第一个项目。"),
        LLMConfig("url", "key", "test-model"),
        call_json=fake_call,
        now=fixed_now,
    )
    assert response.status == "succeeded"
    assert len(messages) == 2
    assert "上一次输出无效" in messages[1][1]["content"]


def test_retryable_provider_error_gets_one_retry() -> None:
    answers = iter([ProviderError("provider_timeout", "模型响应超时", True), output()])

    def fake_call(*args):
        answer = next(answers)
        if isinstance(answer, Exception):
            raise answer
        return answer

    response = organize_material(
        request("先安装示例工具。安装完成后重新启动应用，然后再创建第一个项目。"),
        LLMConfig("url", "key", "real-configured-model"),
        call_json=fake_call,
        now=fixed_now,
    )
    assert response.status == "succeeded"
    assert response.brief is not None
    assert response.brief.model_version == "real-configured-model"


def test_non_retryable_provider_error_is_not_retried() -> None:
    calls = 0

    def fail(*args):
        nonlocal calls
        calls += 1
        raise ProviderError("provider_http_error", "模型服务返回 HTTP 400", False)

    with pytest.raises(ProviderError):
        organize_material(
            request("先安装示例工具。安装完成后重新启动应用，然后再创建第一个项目。"),
            LLMConfig("url", "key", "test-model"),
            call_json=fail,
        )
    assert calls == 1


def test_material_read_timeout_is_not_retried() -> None:
    calls = 0

    def fail(*args):
        nonlocal calls
        calls += 1
        raise ProviderError("provider_read_timeout", "模型响应超过 60 秒", False, "A1B2C3D4")

    with pytest.raises(ProviderError):
        organize_material(
            request("先安装示例工具。安装完成后重新启动应用，然后再创建第一个项目。"),
            LLMConfig("url", "key", "model"),
            call_json=fail,
        )

    assert calls == 1


def test_two_invalid_attempts_raise_generation_error() -> None:
    with pytest.raises(BriefGenerationError) as caught:
        organize_material(
            request("先安装示例工具。安装完成后重新启动应用，然后再创建第一个项目。"),
            LLMConfig("url", "key", "test-model"),
            call_json=lambda *args: output("并不存在"),
            now=fixed_now,
        )
    assert caught.value.code == "invalid_grounding"


def test_invalid_grounding_preserves_the_last_provider_diagnostic_id() -> None:
    with pytest.raises(BriefGenerationError) as caught:
        organize_material(
            request("先安装示例工具。安装完成后重新启动应用，然后再创建第一个项目。"),
            LLMConfig("url", "key", "test-model"),
            call_json=lambda *args: DiagnosticPayload(output("并不存在")),
            now=fixed_now,
        )

    assert caught.value.diagnostic_id == "A1B2C3D4"
