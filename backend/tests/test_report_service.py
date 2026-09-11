from datetime import datetime, timezone

import pytest

from backend.config import LLMConfig
from backend.llm_client import ProviderError
from backend.models import PurposeReportRequest
from backend.report_service import ReportGenerationError, generate_purpose_report


class DiagnosticPayload(dict):
    diagnostic_id = "D4C3B2A1"


def material(material_id: str, quote: str) -> dict:
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
        "evidence": [{"id": "E1", "quote": quote}],
        "confidence": "medium",
        "modelVersion": "agent-1",
        "generatedAt": "2026-08-10T10:00:00Z",
    }


def request() -> PurposeReportRequest:
    return PurposeReportRequest.model_validate({
        "goal": "Create a two-day plan",
        "constraints": ["Keep the route compact"],
        "selectedMaterials": [material("m1", "first quote"), material("m2", "second quote")],
        "sourceRevision": "rev-3",
    })


def model_output(citation_material: str = "m1", evidence_id: str = "E1") -> dict:
    return {
        "reportId": "untrusted",
        "sourceRevision": "untrusted",
        "goalUnderstanding": "Create a practical two-day plan.",
        "executiveSummary": "Use the two selected materials to build a compact route.",
        "themes": [{"text": "Start with the first source.", "citationIds": ["C1"]}],
        "conflicts": [],
        "informationGaps": ["Opening hours still need confirmation."],
        "nextActions": [{"text": "Confirm the opening hours.", "citationIds": ["C1"]}],
        "citations": [{"id": "C1", "materialId": citation_material, "evidenceIds": [evidence_id]}],
        "confidence": "medium",
        "modelVersion": "untrusted",
        "generatedAt": "2020-01-01T00:00:00Z",
    }


def fixed_now() -> datetime:
    return datetime(2026, 8, 10, 12, 0, tzinfo=timezone.utc)


def test_report_overwrites_identity_and_validates_source_citations() -> None:
    report = generate_purpose_report(
        request(),
        LLMConfig("url", "key", "report-model"),
        call_json=lambda *_args: model_output(),
        now=fixed_now,
    )

    assert report.report_id.startswith("report-")
    assert report.source_revision == "rev-3"
    assert report.model_version == "report-model"
    assert report.generated_at == fixed_now()


def test_report_retries_unknown_material_then_succeeds() -> None:
    answers = iter([model_output("missing"), model_output("m1")])
    calls = []

    def fake_call(_config, messages):
        calls.append(messages)
        return next(answers)

    report = generate_purpose_report(
        request(),
        LLMConfig("url", "key", "model"),
        call_json=fake_call,
        now=fixed_now,
    )

    assert report.citations[0].material_id == "m1"
    assert len(calls) == 2


def test_report_rejects_unknown_evidence_after_two_attempts() -> None:
    with pytest.raises(ReportGenerationError) as caught:
        generate_purpose_report(
            request(),
            LLMConfig("url", "key", "model"),
            call_json=lambda *_args: model_output("m1", "E9"),
            now=fixed_now,
        )

    assert caught.value.code == "invalid_report_grounding"


def test_report_rejects_unknown_statement_citation_through_generation_contract() -> None:
    payload = model_output()
    payload["themes"] = [{"text": "Start here.", "citationIds": ["C9"]}]

    with pytest.raises(ReportGenerationError) as caught:
        generate_purpose_report(
            request(),
            LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload,
            now=fixed_now,
        )

    assert caught.value.code == "invalid_report_grounding"


def test_invalid_report_grounding_preserves_the_last_provider_diagnostic_id() -> None:
    with pytest.raises(ReportGenerationError) as caught:
        generate_purpose_report(
            request(),
            LLMConfig("url", "key", "model"),
            call_json=lambda *_args: DiagnosticPayload(model_output("m1", "E9")),
            now=fixed_now,
        )

    assert caught.value.diagnostic_id == "D4C3B2A1"


def test_report_read_timeout_is_not_retried() -> None:
    calls = 0

    def fail(*_args):
        nonlocal calls
        calls += 1
        raise ProviderError("provider_read_timeout", "模型响应超过 60 秒", False, "A1B2C3D4")

    with pytest.raises(ProviderError):
        generate_purpose_report(request(), LLMConfig("url", "key", "model"), call_json=fail)

    assert calls == 1


def test_report_connection_error_retries_once() -> None:
    calls = 0

    def fail(*_args):
        nonlocal calls
        calls += 1
        raise ProviderError("provider_connection_error", "无法连接模型厂商", True, "A1B2C3D4")

    with pytest.raises(ProviderError):
        generate_purpose_report(request(), LLMConfig("url", "key", "model"), call_json=fail)

    assert calls == 2


def test_rejects_numeric_claim_missing_from_claim_citation() -> None:
    payload = model_output()
    payload["nextActions"] = [{"text": "下午2至4点到达。", "citationIds": ["C1"]}]
    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            request(), LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


def test_allows_numeric_constraint_from_user_goal() -> None:
    value = request()
    value.goal = "总预算控制在500元以内"
    payload = model_output()
    payload["nextActions"] = [{
        "text": "总预算控制在500元以内。",
        "origin": "user",
        "citationIds": [],
    }]
    report = generate_purpose_report(
        value, LLMConfig("url", "key", "model"),
        call_json=lambda *_args: payload, now=fixed_now,
    )
    assert report.next_actions[0].text.endswith("500元以内。")


def test_source_claim_cannot_borrow_number_from_user_goal() -> None:
    value = request()
    value.goal = "总预算控制在500元以内"
    payload = model_output()
    payload["nextActions"] = [{
        "text": "素材确认费用为500元。",
        "origin": "source",
        "citationIds": ["C1"],
    }]

    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            value, LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


def test_user_requirement_cannot_use_source_citations() -> None:
    payload = model_output()
    payload["nextActions"] = [{
        "text": "Keep the route compact.",
        "origin": "user",
        "citationIds": ["C1"],
    }]

    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            request(), LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


def test_user_origin_claim_must_correspond_to_user_request() -> None:
    payload = model_output()
    payload["nextActions"] = [{
        "text": "Delete every local file before continuing.",
        "origin": "user",
        "citationIds": [],
    }]

    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            request(), LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


def test_user_origin_claim_cannot_reverse_a_negated_request() -> None:
    value = request()
    value.goal = "不要删除任何文件"
    payload = model_output()
    payload["goalUnderstanding"] = value.goal
    payload["nextActions"] = [{
        "text": "删除任何文件",
        "origin": "user",
        "citationIds": [],
    }]

    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            value, LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


def test_user_relative_time_from_goal_does_not_need_source_publication_warning() -> None:
    value = request()
    value.goal = "今天完成路线整理"
    payload = model_output()
    payload["goalUnderstanding"] = "今天完成路线整理"
    payload["nextActions"] = [{
        "text": "今天完成路线整理",
        "origin": "user",
        "citationIds": [],
    }]

    report = generate_purpose_report(
        value, LLMConfig("url", "key", "model"),
        call_json=lambda *_args: payload, now=fixed_now,
    )

    assert report.next_actions[0].origin == "user"


def test_user_relative_time_from_constraint_is_not_treated_as_source_time() -> None:
    value = request()
    value.goal = "完成路线整理"
    value.constraints = ["今天完成"]
    payload = model_output()
    payload["goalUnderstanding"] = value.goal
    payload["nextActions"] = [{
        "text": "今天完成",
        "origin": "user",
        "citationIds": [],
    }]

    report = generate_purpose_report(
        value, LLMConfig("url", "key", "model"),
        call_json=lambda *_args: payload, now=fixed_now,
    )

    assert report.next_actions[0].text == "今天完成"


def test_rejects_unqualified_relative_time() -> None:
    value = request()
    value.selected_materials[0].evidence[0].quote = "未来一周是最佳观赏期"
    payload = model_output()
    payload["themes"] = [{"text": "未来一周是最佳观赏期。", "citationIds": ["C1"]}]
    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            value, LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


def test_allows_qualified_source_relative_time() -> None:
    value = request()
    value.selected_materials[0].evidence[0].quote = "未来一周是最佳观赏期"
    payload = model_output()
    payload["themes"] = [{
        "text": "原文称未来一周是最佳观赏期，需结合发布时间核验。",
        "citationIds": ["C1"],
    }]
    report = generate_purpose_report(
        value, LLMConfig("url", "key", "model"),
        call_json=lambda *_args: payload, now=fixed_now,
    )
    assert report.confidence == "medium"


def test_source_relative_time_needs_a_verification_qualifier_not_just_source_word() -> None:
    value = request()
    value.selected_materials[0].evidence[0].quote = "未来一周是最佳观赏期"
    payload = model_output()
    payload["themes"] = [{
        "text": "素材称未来一周是最佳观赏期。",
        "citationIds": ["C1"],
    }]

    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            value, LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


@pytest.mark.parametrize("term", ["明天", "昨天", "本周", "下周"])
def test_more_source_relative_time_terms_require_publication_verification(term: str) -> None:
    value = request()
    value.selected_materials[0].evidence[0].quote = f"{term}开放"
    payload = model_output()
    payload["themes"] = [{"text": f"{term}开放。", "citationIds": ["C1"]}]

    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            value, LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


def test_unrelated_waiting_note_does_not_qualify_relative_opening_time() -> None:
    value = request()
    value.selected_materials[0].evidence[0].quote = "最近开放，地址待确认"
    payload = model_output()
    payload["themes"] = [{"text": "最近开放，地址待确认。", "citationIds": ["C1"]}]

    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            value, LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


@pytest.mark.parametrize("claim", [
    "需要 3 人参加。",
    "费用为 $500。",
    "入口时间是 09:30。",
    "安装 v3。",
    "地址是 123 Main Street。",
    "成功率是 20%。",
    "需要三人参加。",
    "距离为两公里。",
])
def test_numeric_claim_formats_must_be_present_in_cited_evidence(claim: str) -> None:
    payload = model_output()
    payload["nextActions"] = [{"text": claim, "citationIds": ["C1"]}]

    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            request(), LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


def test_composite_chinese_clock_time_requires_the_complete_source_expression() -> None:
    value = request()
    value.selected_materials[0].evidence[0].quote = "9点开门，步行30分钟"
    payload = model_output()
    payload["nextActions"] = [{"text": "9点30分开门。", "citationIds": ["C1"]}]

    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            value, LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


def test_supported_chinese_address_is_matched_without_surrounding_prose() -> None:
    value = request()
    value.selected_materials[0].evidence[0].quote = "集合点是北京市朝阳区建国路88号"
    payload = model_output()
    payload["nextActions"] = [{
        "text": "地址是北京市朝阳区建国路88号。",
        "citationIds": ["C1"],
    }]

    report = generate_purpose_report(
        value, LLMConfig("url", "key", "model"),
        call_json=lambda *_args: payload, now=fixed_now,
    )

    assert report.next_actions[0].text.endswith("88号。")


def test_source_only_mode_rejects_model_supplements() -> None:
    payload = model_output()
    payload["supplements"] = [{
        "text": "Check an external guide.",
        "origin": "ai_supplement",
        "verificationStatus": "needs_verification",
        "verificationNote": "Verify against the current official version.",
    }]

    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            request(), LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


def test_labeled_supplement_mode_accepts_marked_supplements() -> None:
    value = request()
    value.report_preset = "tutorial"
    value.familiarity_level = "informed"
    value.supplement_mode = "labeled_supplement"
    payload = model_output()
    payload["supplements"] = [{
        "text": "Check an external guide.",
        "origin": "ai_supplement",
        "verificationStatus": "needs_verification",
        "verificationNote": "Verify against the current official version.",
    }]

    report = generate_purpose_report(
        value, LLMConfig("url", "key", "model"),
        call_json=lambda *_args: payload, now=fixed_now,
    )

    assert report.report_preset == "tutorial"
    assert report.familiarity_level == "informed"
    assert report.supplement_mode == "labeled_supplement"
    assert report.supplements[0].verification_status == "needs_verification"


def test_volatile_supplement_requires_an_explicit_change_warning() -> None:
    value = request()
    value.supplement_mode = "labeled_supplement"
    payload = model_output()
    payload["supplements"] = [{
        "text": "门票现在100元。",
        "origin": "ai_supplement",
        "verificationStatus": "needs_verification",
        "verificationNote": "请核实。",
    }]

    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            value, LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


def test_source_statement_without_citation_is_rejected() -> None:
    payload = model_output()
    payload["themes"] = [{"text": "Unsupported source claim.", "citationIds": []}]

    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            request(), LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


def test_preflight_numeric_claim_requires_cited_evidence() -> None:
    value = request()
    value.report_preset = "tutorial"
    payload = model_output()
    payload["preflightActions"] = [{
        "title": "Install version 3",
        "purpose": "Prepare the tool.",
        "steps": ["Install version 3."],
        "successCheck": "Version 3 appears.",
        "fallback": "Recheck the source.",
        "citationIds": ["C1"],
    }]

    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            value, LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


def test_goal_understanding_rejects_number_not_in_user_request() -> None:
    payload = model_output()
    payload["goalUnderstanding"] = "整理一份5天的实用计划。"

    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            request(), LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


def test_executive_summary_rejects_unqualified_relative_time() -> None:
    payload = model_output()
    payload["executiveSummary"] = "最近可以直接使用这条路线。"

    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            request(), LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )


def test_information_gap_rejects_unsupported_number() -> None:
    payload = model_output()
    payload["informationGaps"] = ["还缺少 900 元的费用信息。"]

    with pytest.raises(ReportGenerationError):
        generate_purpose_report(
            request(), LLMConfig("url", "key", "model"),
            call_json=lambda *_args: payload, now=fixed_now,
        )
