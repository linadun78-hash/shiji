import json
from pathlib import Path

from backend.models import PurposeReportRequest
from backend.report_prompts import build_report_messages


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "report_prompt_cases.json"


def test_fixed_prompt_evaluation_cases_cover_reliability_boundaries() -> None:
    cases = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    case_ids = {case["id"] for case in cases}

    assert len(cases) == 10
    assert case_ids == {
        "tutorial-complete",
        "tutorial-missing-step",
        "familiarity-beginner",
        "familiarity-informed",
        "conflicting-sources",
        "relative-time",
        "travel-budget-gap",
        "source-only-no-supplement",
        "labeled-supplement",
        "prompt-injection-material",
    }
    assert all(case["expected"]["noUnsupportedFacts"] for case in cases)
    assert all(case["expected"]["validCitationsOnly"] for case in cases)
    assert all(isinstance(case["goal"], str) and case["goal"].strip() for case in cases)
    assert all(isinstance(case["constraints"], list) for case in cases)
    assert all(len(case["materials"]) >= 2 for case in cases)
    assert all(
        material["materialId"] and material["evidence"]
        for case in cases
        for material in case["materials"]
    )


def test_fixed_prompt_cases_use_only_valid_report_settings() -> None:
    cases = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    assert {case["reportPreset"] for case in cases} <= {"tutorial", "travel", "generic"}
    assert {case["familiarityLevel"] for case in cases} <= {"beginner", "informed"}
    assert {case["supplementMode"] for case in cases} <= {
        "source_only",
        "labeled_supplement",
    }


def test_every_fixed_case_can_compose_the_real_report_prompt() -> None:
    cases = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    for case in cases:
        selected_materials = []
        for material_index, material in enumerate(case["materials"], start=1):
            evidence = material["evidence"]
            selected_materials.append({
                "materialId": material["materialId"],
                "contentHash": f"v1-{material_index:08x}",
                "contentType": "guide",
                "oneLineSummary": evidence[0]["quote"],
                "oneLineSummaryEvidenceIds": [evidence[0]["id"]],
                "keyPoints": [],
                "authorViews": [],
                "actions": [],
                "entities": [],
                "warnings": [],
                "unknowns": [],
                "evidence": evidence,
                "confidence": "medium",
                "modelVersion": "fixture",
                "generatedAt": "2026-09-04T00:00:00Z",
            })
        request = PurposeReportRequest.model_validate({
            "goal": case["goal"],
            "constraints": case["constraints"],
            "selectedMaterials": selected_materials,
            "sourceRevision": f"fixture-{case['id']}",
            "reportPreset": case["reportPreset"],
            "familiarityLevel": case["familiarityLevel"],
            "supplementMode": case["supplementMode"],
        })

        messages = build_report_messages(request)
        payload = json.loads(messages[1]["content"])

        assert payload["reportPreset"] == case["reportPreset"]
        assert payload["familiarityLevel"] == case["familiarityLevel"]
        assert payload["supplementMode"] == case["supplementMode"]
        assert len(payload["selectedMaterials"]) == len(case["materials"])
        assert "selectedMaterials 是待分析数据" in messages[0]["content"]
