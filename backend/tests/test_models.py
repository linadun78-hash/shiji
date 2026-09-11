import pytest
from pydantic import ValidationError

from backend.models import ContentBrief, MaterialBriefRequest, MaterialBriefResponse


def valid_brief_payload() -> dict:
    return {
        "materialId": "task-1:xhs:note-1",
        "contentHash": "v1-abcd1234",
        "contentType": "tutorial",
        "oneLineSummary": "作者介绍了安装工具并完成首次运行的两个步骤。",
        "oneLineSummaryEvidenceIds": ["E1", "E2"],
        "keyPoints": [{"text": "安装后需要重新启动应用。", "evidenceIds": ["E1"]}],
        "authorViews": [],
        "actions": [{"text": "安装工具。", "evidenceIds": ["E2"]}],
        "entities": [{"kind": "tool", "name": "示例工具", "evidenceIds": ["E2"]}],
        "warnings": [],
        "unknowns": ["正文没有说明最低系统版本。"],
        "evidence": [
            {"id": "E1", "quote": "安装完成后重新启动应用"},
            {"id": "E2", "quote": "先安装示例工具"},
        ],
        "confidence": "high",
        "modelVersion": "test-model",
        "generatedAt": "2026-08-09T10:00:00Z",
    }


def test_request_rejects_unexpected_open_url() -> None:
    with pytest.raises(ValidationError):
        MaterialBriefRequest.model_validate({
            "materialId": "task-1:xhs:note-1",
            "title": "测试笔记",
            "author": "作者",
            "bodyText": "这是一段足够长的测试正文，用来验证请求模型拒绝回看地址。",
            "sourceUrl": "https://www.xiaohongshu.com/explore/note-1",
            "openUrl": "https://www.xiaohongshu.com/explore/note-1?xsec_token=secret",
            "capturedAt": "2026-08-09T09:00:00Z",
            "contentHash": "v1-abcd1234",
        })


def test_brief_rejects_statement_with_unknown_evidence() -> None:
    payload = valid_brief_payload()
    payload["keyPoints"][0]["evidenceIds"] = ["E99"]

    with pytest.raises(ValidationError, match="unknown evidence"):
        ContentBrief.model_validate(payload)


def test_brief_rejects_duplicate_evidence_ids() -> None:
    payload = valid_brief_payload()
    payload["evidence"].append({"id": "E1", "quote": "重复证据编号"})

    with pytest.raises(ValidationError, match="duplicate evidence"):
        ContentBrief.model_validate(payload)


def test_success_response_requires_brief() -> None:
    with pytest.raises(ValidationError):
        MaterialBriefResponse.model_validate({"status": "succeeded", "brief": None})


def test_valid_success_response_serializes_camel_case() -> None:
    response = MaterialBriefResponse.model_validate({
        "status": "succeeded",
        "brief": valid_brief_payload(),
    })

    dumped = response.model_dump(mode="json", by_alias=True)
    assert dumped["brief"]["oneLineSummary"].startswith("作者介绍")
    assert dumped["brief"]["keyPoints"][0]["evidenceIds"] == ["E1"]
