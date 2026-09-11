import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from backend.acceptance_runner import AcceptanceSafetyError, rundll32_snapshot, run_acceptance
from backend.config import LLMConfig
from backend.models import ContentBrief, MaterialBriefResponse, PurposeReport
from scripts.run_reliability_acceptance import build_parser


CONFIG = LLMConfig("https://api.example/v1", "secret", "test-model")
TEST_OUTPUT = Path(__file__).parents[2] / "tmp" / "acceptance-tests"


def clean_checkpoint(name: str) -> Path:
    TEST_OUTPUT.mkdir(parents=True, exist_ok=True)
    return TEST_OUTPUT / f"{uuid4().hex}-{name}"


def material(material_id: str, content_hash: str, body: str) -> dict:
    return {
        "materialId": material_id,
        "title": f"素材 {material_id}",
        "author": "测试作者",
        "bodyText": body,
        "sourceUrl": f"https://www.xiaohongshu.com/explore/{material_id}",
        "capturedAt": "2026-08-17T10:00:00Z",
        "contentHash": content_hash,
    }


def fixture() -> dict:
    return {
        "goal": "整理广州秋季一日游路线",
        "constraints": ["预算不超过500元", "优先公共交通"],
        "materials": [
            material("m1", "v1-11111111", "海珠区路线包含三个可步行到达的地点。"),
            material("m2", "v1-22222222", "云台花园门票10元，可以乘坐地铁到达。"),
        ],
    }


def succeeded(request) -> MaterialBriefResponse:
    brief = ContentBrief.model_validate({
        "materialId": request.material_id,
        "contentHash": request.content_hash,
        "contentType": "guide",
        "oneLineSummary": "这是一条可用于规划的真实素材摘要。",
        "oneLineSummaryEvidenceIds": ["E1"],
        "keyPoints": [{"text": "素材提供了一条可执行信息。", "evidenceIds": ["E1"]}],
        "authorViews": [],
        "actions": [],
        "entities": [],
        "warnings": [],
        "unknowns": [],
        "evidence": [{"id": "E1", "quote": request.body_text}],
        "confidence": "medium",
        "modelVersion": "test-model",
        "generatedAt": datetime(2026, 8, 19, tzinfo=timezone.utc),
    })
    return MaterialBriefResponse(status="succeeded", brief=brief)


def insufficient(_request) -> MaterialBriefResponse:
    return MaterialBriefResponse(status="insufficient", message="信息不足")


def report_output(request) -> PurposeReport:
    return PurposeReport.model_validate({
        "reportId": "report-acceptance",
        "sourceRevision": "rev-acceptance",
        "goalUnderstanding": request.goal,
        "executiveSummary": "两条事实素材已经形成一份可核验的旅行规划摘要。",
        "themes": [{"text": "先核验第一条素材。", "citationIds": ["C1"]}],
        "conflicts": [],
        "informationGaps": ["营业时间仍需确认。"],
        "nextActions": [{"text": "打开原文确认营业时间。", "citationIds": ["C1"]}],
        "citations": [{"id": "C1", "materialId": "m1", "evidenceIds": ["E1"]}],
        "confidence": "medium",
        "modelVersion": "test-model",
        "generatedAt": "2026-08-19T10:00:00Z",
    })


def test_saves_each_material_before_starting_the_next() -> None:
    checkpoint = clean_checkpoint("save-each.json")
    calls: list[str] = []

    def organize(request, _config):
        if request.material_id == "m2":
            saved = json.loads(checkpoint.read_text(encoding="utf-8"))
            assert saved["materials"]["m1"]["status"] == "succeeded"
        calls.append(request.material_id)
        return succeeded(request)

    run_acceptance(
        fixture(), checkpoint, CONFIG,
        organize=organize,
        generate_report=False,
        process_snapshot=lambda: (9736,),
    )

    saved = json.loads(checkpoint.read_text(encoding="utf-8"))
    assert calls == ["m1", "m2"]
    assert set(saved["materials"]) == {"m1", "m2"}
    assert "secret" not in checkpoint.read_text(encoding="utf-8")
    checkpoint.unlink()


def test_resume_skips_completed_material_with_same_hash() -> None:
    checkpoint = clean_checkpoint("resume.json")
    calls: list[str] = []

    def organize(request, _config):
        calls.append(request.material_id)
        return succeeded(request)

    options = {
        "organize": organize,
        "generate_report": False,
        "process_snapshot": lambda: (9736,),
    }
    run_acceptance(fixture(), checkpoint, CONFIG, **options)
    run_acceptance(fixture(), checkpoint, CONFIG, **options)

    assert calls == ["m1", "m2"]
    checkpoint.unlink()


def test_process_change_aborts_before_next_model_call_and_persists_reason() -> None:
    checkpoint = clean_checkpoint("safety-stop.json")
    calls: list[str] = []
    snapshots = iter([(9736,), (9736,), (9736, 11000)])

    def organize(request, _config):
        calls.append(request.material_id)
        return succeeded(request)

    with pytest.raises(AcceptanceSafetyError):
        run_acceptance(
            fixture(), checkpoint, CONFIG,
            organize=organize,
            generate_report=False,
            process_snapshot=lambda: next(snapshots),
        )

    saved = json.loads(checkpoint.read_text(encoding="utf-8"))
    assert calls == ["m1"]
    assert saved["materials"]["m1"]["status"] == "succeeded"
    assert saved["runStatus"] == "aborted"
    assert saved["abortReason"] == "rundll32_snapshot_changed"
    checkpoint.unlink()


def test_fewer_than_two_successes_does_not_call_agent_2() -> None:
    checkpoint = clean_checkpoint("report-threshold.json")
    calls = 0

    def organize(request, _config):
        return succeeded(request) if request.material_id == "m1" else insufficient(request)

    def generate(_request, _config):
        nonlocal calls
        calls += 1
        raise AssertionError("Agent 2 must not be called")

    saved = run_acceptance(
        fixture(), checkpoint, CONFIG,
        organize=organize,
        report_generator=generate,
        process_snapshot=lambda: (9736,),
    )

    assert calls == 0
    assert saved["reportStatus"] == "insufficient_materials"
    checkpoint.unlink()


def test_two_successes_generate_and_persist_one_report() -> None:
    checkpoint = clean_checkpoint("report-success.json")
    calls = 0

    def generate(request, _config):
        nonlocal calls
        calls += 1
        assert [item.material_id for item in request.selected_materials] == ["m1", "m2"]
        return report_output(request)

    saved = run_acceptance(
        fixture(), checkpoint, CONFIG,
        organize=lambda request, _config: succeeded(request),
        report_generator=generate,
        process_snapshot=lambda: (9736,),
    )

    persisted = json.loads(checkpoint.read_text(encoding="utf-8"))
    assert calls == 1
    assert saved["reportStatus"] == "succeeded"
    assert persisted["report"]["reportId"] == "report-acceptance"
    checkpoint.unlink()


def test_material_failure_is_saved_and_later_materials_continue() -> None:
    checkpoint = clean_checkpoint("material-failure.json")
    calls: list[str] = []

    def organize(request, _config):
        calls.append(request.material_id)
        if request.material_id == "m1":
            raise RuntimeError("temporary secret provider failure")
        return succeeded(request)

    saved = run_acceptance(
        fixture(), checkpoint, CONFIG,
        organize=organize,
        generate_report=False,
        process_snapshot=lambda: (9736,),
    )

    assert calls == ["m1", "m2"]
    assert saved["materials"]["m1"]["status"] == "failed"
    assert saved["materials"]["m1"]["error"]["type"] == "RuntimeError"
    assert "secret" not in checkpoint.read_text(encoding="utf-8")
    assert saved["materials"]["m2"]["status"] == "succeeded"
    checkpoint.unlink()


def test_resume_reuses_successful_report_for_the_same_inputs() -> None:
    checkpoint = clean_checkpoint("report-resume.json")
    calls = 0

    def generate(request, _config):
        nonlocal calls
        calls += 1
        return report_output(request)

    options = {
        "organize": lambda request, _config: succeeded(request),
        "report_generator": generate,
        "process_snapshot": lambda: (9736,),
    }
    run_acceptance(fixture(), checkpoint, CONFIG, **options)
    saved = run_acceptance(fixture(), checkpoint, CONFIG, **options)

    assert calls == 1
    assert saved["reportStatus"] == "succeeded"
    checkpoint.unlink()


def test_rundll32_snapshot_filters_and_sorts_process_ids() -> None:
    processes = [
        {"pid": 42, "name": "python.exe"},
        {"pid": 9736, "name": "rundll32.exe"},
        {"pid": 1100, "name": "RUNDLL32.EXE"},
    ]

    assert rundll32_snapshot(lambda _attrs: processes) == (1100, 9736)


def test_acceptance_cli_requires_explicit_fixture_and_checkpoint_paths() -> None:
    arguments = build_parser().parse_args([
        "--fixture", "real-materials.json",
        "--checkpoint", "tmp/acceptance/run.json",
    ])

    assert arguments.fixture.name == "real-materials.json"
    assert arguments.checkpoint.as_posix() == "tmp/acceptance/run.json"


def test_removed_fixture_material_is_not_reused_for_a_new_report() -> None:
    checkpoint = clean_checkpoint("removed-material.json")
    initial = fixture()
    run_acceptance(
        initial, checkpoint, CONFIG,
        organize=lambda request, _config: succeeded(request),
        generate_report=False,
        process_snapshot=lambda: (9736,),
    )
    updated = fixture()
    updated["materials"] = [
        updated["materials"][0],
        material("m3", "v1-33333333", "越秀区还有一条新的步行路线。"),
    ]

    def generate(request, _config):
        assert [item.material_id for item in request.selected_materials] == ["m1", "m3"]
        return report_output(request)

    saved = run_acceptance(
        updated, checkpoint, CONFIG,
        organize=lambda request, _config: succeeded(request),
        report_generator=generate,
        process_snapshot=lambda: (9736,),
    )
    assert set(saved["materials"]) == {"m1", "m3"}
    checkpoint.unlink()


def test_report_failure_is_persisted_without_losing_agent_1_results() -> None:
    checkpoint = clean_checkpoint("report-failure.json")

    def fail(_request, _config):
        raise RuntimeError("report provider failure")

    saved = run_acceptance(
        fixture(), checkpoint, CONFIG,
        organize=lambda request, _config: succeeded(request),
        report_generator=fail,
        process_snapshot=lambda: (9736,),
    )

    assert saved["reportStatus"] == "failed"
    assert saved["reportError"]["type"] == "RuntimeError"
    assert set(saved["materials"]) == {"m1", "m2"}
    checkpoint.unlink()
