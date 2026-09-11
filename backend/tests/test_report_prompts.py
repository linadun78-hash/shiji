import json
import pytest

from backend.models import PurposeReportRequest
from backend.report_prompts import build_report_messages, infer_report_preset


def brief(material_id: str) -> dict:
    return {
        "materialId": material_id,
        "contentHash": "v1-abcd1234",
        "contentType": "guide",
        "oneLineSummary": "A source-backed summary for this material.",
        "oneLineSummaryEvidenceIds": ["E1"],
        "keyPoints": [],
        "authorViews": [],
        "actions": [],
        "entities": [],
        "warnings": [],
        "unknowns": [],
        "evidence": [{"id": "E1", "quote": "source quote"}],
        "confidence": "medium",
        "modelVersion": "agent-1",
        "generatedAt": "2026-08-17T10:00:00Z",
    }


def request() -> PurposeReportRequest:
    return PurposeReportRequest.model_validate({
        "goal": "Create a plan",
        "constraints": [],
        "selectedMaterials": [brief("m1"), brief("m2")],
        "sourceRevision": "rev-1",
    })


def test_chinese_travel_goal_selects_travel_preset() -> None:
    value = request()
    value.goal = "制定广州秋季一日游路线"
    messages = build_report_messages(value)
    payload = json.loads(messages[1]["content"])

    assert infer_report_preset(value.goal) == "travel"
    assert payload["reportPreset"] == "travel"
    assert "时段待确认" in messages[0]["content"]
    assert "来源相对" in messages[0]["content"]
    assert "预算假设" in messages[0]["content"]
    assert "informationGaps" in messages[0]["content"]


def test_unrelated_goal_keeps_generic_preset() -> None:
    value = request()
    value.goal = "整理求职材料"
    messages = build_report_messages(value)
    payload = json.loads(messages[1]["content"])

    assert infer_report_preset(value.goal) == "generic"
    assert "时段待确认" not in messages[0]["content"]
    assert payload["reportPreset"] == "generic"


def test_tutorial_goal_is_auto_detected_without_stealing_travel_guides() -> None:
    assert infer_report_preset("零基础安装应用并配置环境变量") == "tutorial"
    assert infer_report_preset("把教程整理成学习步骤") == "tutorial"
    assert infer_report_preset("整理广州两日旅行攻略") == "travel"


def test_explicit_tutorial_preset_and_beginner_module_are_composed() -> None:
    value = request()
    value.report_preset = "tutorial"
    value.familiarity_level = "beginner"
    messages = build_report_messages(value)
    system = messages[0]["content"]
    payload = json.loads(messages[1]["content"])

    assert payload["reportPreset"] == "tutorial"
    assert payload["familiarityLevel"] == "beginner"
    assert "用途、具体动作、完成标志和失败处理" in system
    assert "点击路径" in system
    assert "不得输出任何模型自身补充内容" in system


def test_informed_module_is_shorter_and_labeled_supplement_is_explicit() -> None:
    value = request()
    value.report_preset = "tutorial"
    value.familiarity_level = "informed"
    value.supplement_mode = "labeled_supplement"
    messages = build_report_messages(value)
    system = messages[0]["content"]
    payload = json.loads(messages[1]["content"])

    assert payload["familiarityLevel"] == "informed"
    assert payload["supplementMode"] == "labeled_supplement"
    assert "省略显而易见的基础概念" in system
    assert "origin=ai_supplement" in system
    assert "不得填写 citationIds" in system
    assert "不要加入与完成当前任务无关的概念解释" not in system


def test_legacy_prompt_version_can_be_selected_for_internal_rollback() -> None:
    messages = build_report_messages(request(), prompt_version="legacy")

    assert "legacy" in messages[0]["content"]
    assert "selectedMaterials" in messages[1]["content"]


def test_unknown_prompt_version_is_rejected() -> None:
    with pytest.raises(ValueError):
        build_report_messages(request(), prompt_version="future")
