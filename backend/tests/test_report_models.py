from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from backend.models import ContentBrief, PurposeReport, PurposeReportRequest


def brief(material_id: str, evidence_id: str = "E1") -> dict:
    return {
        "materialId": material_id,
        "contentHash": "v1-abcd1234",
        "contentType": "guide",
        "oneLineSummary": "A source-backed summary for this material.",
        "oneLineSummaryEvidenceIds": [evidence_id],
        "keyPoints": [],
        "authorViews": [],
        "actions": [],
        "entities": [],
        "warnings": [],
        "unknowns": [],
        "evidence": [{"id": evidence_id, "quote": "source quote"}],
        "confidence": "medium",
        "modelVersion": "model",
        "generatedAt": "2026-08-10T10:00:00Z",
    }


def test_report_request_requires_two_unique_materials() -> None:
    with pytest.raises(ValidationError):
        PurposeReportRequest(goal="Make a plan", selected_materials=[brief("m1")])

    with pytest.raises(ValidationError):
        PurposeReportRequest(goal="Make a plan", selected_materials=[brief("m1"), brief("m1")])


def test_report_rejects_unknown_citation_reference() -> None:
    payload = {
        "reportId": "report-1",
        "sourceRevision": "rev-1",
        "goalUnderstanding": "A plan",
        "executiveSummary": "A concise result.",
        "themes": [{"text": "Theme", "citationIds": ["C9"]}],
        "conflicts": [],
        "informationGaps": [],
        "nextActions": [],
        "citations": [{"id": "C1", "materialId": "m1", "evidenceIds": ["E1"]}],
        "confidence": "low",
        "modelVersion": "model",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    with pytest.raises(ValidationError):
        PurposeReport.model_validate(payload)


def test_report_request_defaults_to_beginner_source_only_and_auto_preset() -> None:
    value = PurposeReportRequest(goal="Make a plan", selected_materials=[brief("m1"), brief("m2")])

    assert value.report_preset is None
    assert value.familiarity_level == "beginner"
    assert value.supplement_mode == "source_only"


def test_report_accepts_labeled_supplement_without_source_citation() -> None:
    payload = {
        "reportId": "report-1",
        "sourceRevision": "rev-1",
        "goalUnderstanding": "A plan",
        "executiveSummary": "A concise result.",
        "themes": [],
        "conflicts": [],
        "informationGaps": [],
        "nextActions": [],
        "preflightActions": [],
        "supplements": [{
            "text": "Check the current official installation guide.",
            "origin": "ai_supplement",
            "verificationStatus": "needs_verification",
            "verificationNote": "Verify the version-specific instructions.",
        }],
        "citations": [{"id": "C1", "materialId": "m1", "evidenceIds": ["E1"]}],
        "confidence": "low",
        "modelVersion": "model",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }

    report = PurposeReport.model_validate(payload)

    assert report.supplements[0].origin == "ai_supplement"
    assert report.supplements[0].citation_ids == []


def test_preflight_action_requires_a_citation() -> None:
    payload = {
        "reportId": "report-1",
        "sourceRevision": "rev-1",
        "goalUnderstanding": "A plan",
        "executiveSummary": "A concise result.",
        "themes": [],
        "conflicts": [],
        "informationGaps": [],
        "nextActions": [],
        "preflightActions": [{
            "title": "Check the installation",
            "purpose": "Avoid a missing dependency.",
            "steps": ["Open the installer."],
            "successCheck": "The version appears.",
            "fallback": "Verify the source instructions.",
            "citationIds": [],
        }],
        "supplements": [],
        "citations": [{"id": "C1", "materialId": "m1", "evidenceIds": ["E1"]}],
        "confidence": "low",
        "modelVersion": "model",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }

    with pytest.raises(ValidationError):
        PurposeReport.model_validate(payload)


def test_user_origin_is_not_allowed_for_preflight_actions() -> None:
    payload = {
        "reportId": "report-1",
        "sourceRevision": "rev-1",
        "goalUnderstanding": "A plan",
        "executiveSummary": "A concise result.",
        "themes": [],
        "conflicts": [],
        "informationGaps": [],
        "nextActions": [],
        "preflightActions": [{
            "title": "Keep the budget visible",
            "purpose": "Follow the user's stated constraint.",
            "steps": ["Write down the budget before comparing options."],
            "successCheck": "The budget is visible beside the options.",
            "fallback": "Return to the user's original constraint.",
            "origin": "user",
            "citationIds": [],
        }],
        "supplements": [],
        "citations": [{"id": "C1", "materialId": "m1", "evidenceIds": ["E1"]}],
        "confidence": "low",
        "modelVersion": "model",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }

    with pytest.raises(ValidationError):
        PurposeReport.model_validate(payload)


def test_source_preflight_action_can_explicitly_have_no_steps_when_material_is_incomplete() -> None:
    payload = {
        "reportId": "report-1",
        "sourceRevision": "rev-1",
        "goalUnderstanding": "A plan",
        "executiveSummary": "A concise result.",
        "themes": [],
        "conflicts": [],
        "informationGaps": ["The source does not describe the installation step."],
        "nextActions": [],
        "preflightActions": [{
            "title": "Confirm the installation step",
            "purpose": "The source leaves this operation unspecified.",
            "steps": [],
            "successCheck": "The missing operation is confirmed from a source.",
            "fallback": "Keep this action marked for verification.",
            "citationIds": ["C1"],
        }],
        "supplements": [],
        "citations": [{"id": "C1", "materialId": "m1", "evidenceIds": ["E1"]}],
        "confidence": "low",
        "modelVersion": "model",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }

    report = PurposeReport.model_validate(payload)

    assert report.preflight_actions[0].steps == []


def test_report_rejects_supplement_with_source_origin() -> None:
    payload = {
        "reportId": "report-1",
        "sourceRevision": "rev-1",
        "goalUnderstanding": "A plan",
        "executiveSummary": "A concise result.",
        "themes": [],
        "conflicts": [],
        "informationGaps": [],
        "nextActions": [],
        "preflightActions": [],
        "supplements": [{
            "text": "This came from the source.",
            "origin": "source",
            "verificationStatus": "supported",
            "verificationNote": "",
        }],
        "citations": [{"id": "C1", "materialId": "m1", "evidenceIds": ["E1"]}],
        "confidence": "low",
        "modelVersion": "model",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }

    with pytest.raises(ValidationError):
        PurposeReport.model_validate(payload)
