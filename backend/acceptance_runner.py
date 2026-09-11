import hashlib
import json
from pathlib import Path
from typing import Any, Callable

from .config import LLMConfig
from .models import (
    ContentBrief,
    MaterialBriefRequest,
    MaterialBriefResponse,
    PurposeReport,
    PurposeReportRequest,
)
from .report_service import generate_purpose_report
from .service import organize_material


ProcessSnapshot = Callable[[], tuple[int, ...]]
Organizer = Callable[[MaterialBriefRequest, LLMConfig], MaterialBriefResponse]
ReportGenerator = Callable[[PurposeReportRequest, LLMConfig], PurposeReport]


class AcceptanceSafetyError(RuntimeError):
    pass


def rundll32_snapshot(process_iter=None) -> tuple[int, ...]:
    if process_iter is None:
        try:
            import psutil
        except ImportError as exc:
            raise AcceptanceSafetyError("psutil is required for process safety monitoring") from exc
        process_iter = psutil.process_iter

    process_ids: list[int] = []
    for process in process_iter(["pid", "name"]):
        try:
            info = process if isinstance(process, dict) else process.info
            if str(info.get("name", "")).casefold() == "rundll32.exe":
                process_ids.append(int(info["pid"]))
        except (KeyError, TypeError, ValueError, OSError):
            continue
    return tuple(sorted(process_ids))


def load_checkpoint(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return {"version": 1, "materials": {}}
    if not isinstance(payload, dict) or not isinstance(payload.get("materials"), dict):
        return {"version": 1, "materials": {}}
    return payload


def save_checkpoint(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(path)


def report_input_key(goal: str, constraints: list[str], briefs: list[ContentBrief]) -> str:
    source = {
        "goal": goal,
        "constraints": constraints,
        "materials": [
            {"materialId": item.material_id, "contentHash": item.content_hash}
            for item in briefs
        ],
    }
    encoded = json.dumps(source, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return "input-" + hashlib.sha256(encoded).hexdigest()[:16]


def run_acceptance(
    fixture: dict[str, Any],
    checkpoint_path: Path,
    config: LLMConfig,
    *,
    organize: Organizer = organize_material,
    generate_report: bool = True,
    report_generator: ReportGenerator = generate_purpose_report,
    process_snapshot: ProcessSnapshot,
) -> dict[str, Any]:
    checkpoint = load_checkpoint(checkpoint_path)
    current_material_ids = {
        str(item.get("materialId", ""))
        for item in fixture.get("materials", [])
        if isinstance(item, dict)
    }
    checkpoint["materials"] = {
        material_id: record
        for material_id, record in checkpoint["materials"].items()
        if material_id in current_material_ids
    }
    checkpoint["goal"] = str(fixture.get("goal", ""))
    checkpoint["constraints"] = list(fixture.get("constraints", []))
    checkpoint["model"] = config.model
    checkpoint["runStatus"] = "running"
    save_checkpoint(checkpoint_path, checkpoint)

    baseline = process_snapshot()

    def ensure_processes_unchanged() -> None:
        if process_snapshot() == baseline:
            return
        checkpoint["runStatus"] = "aborted"
        checkpoint["abortReason"] = "rundll32_snapshot_changed"
        save_checkpoint(checkpoint_path, checkpoint)
        raise AcceptanceSafetyError("rundll32 process snapshot changed")

    for raw_material in fixture.get("materials", []):
        request = MaterialBriefRequest.model_validate(raw_material)
        existing = checkpoint["materials"].get(request.material_id, {})
        if (
            existing.get("contentHash") == request.content_hash
            and existing.get("status") in {"succeeded", "insufficient"}
        ):
            continue
        ensure_processes_unchanged()

        try:
            response = organize(request, config)
            record = response.model_dump(by_alias=True, mode="json")
        except Exception as exc:
            record = {
                "status": "failed",
                "error": {
                    "type": type(exc).__name__,
                    "code": str(getattr(exc, "code", "")),
                    "message": "素材整理失败，请使用诊断编号排查或稍后重试。",
                    "diagnosticId": str(getattr(exc, "diagnostic_id", "")),
                },
            }
        checkpoint["materials"][request.material_id] = {
            "contentHash": request.content_hash,
            **record,
        }
        save_checkpoint(checkpoint_path, checkpoint)

        ensure_processes_unchanged()

    checkpoint["runStatus"] = "completed"
    if not generate_report:
        checkpoint["reportStatus"] = "disabled"
        save_checkpoint(checkpoint_path, checkpoint)
        return checkpoint

    briefs = [
        ContentBrief.model_validate(record["brief"])
        for material_id, record in checkpoint["materials"].items()
        if material_id in current_material_ids
        and record.get("status") == "succeeded"
        and record.get("brief")
    ]
    if len(briefs) < 2:
        checkpoint["reportStatus"] = "insufficient_materials"
        save_checkpoint(checkpoint_path, checkpoint)
        return checkpoint

    input_key = report_input_key(checkpoint["goal"], checkpoint["constraints"], briefs)
    if checkpoint.get("reportStatus") == "succeeded" and checkpoint.get("reportInputKey") == input_key:
        save_checkpoint(checkpoint_path, checkpoint)
        return checkpoint

    ensure_processes_unchanged()
    report_request = PurposeReportRequest.model_validate({
        "goal": checkpoint["goal"],
        "constraints": checkpoint["constraints"],
        "selectedMaterials": [item.model_dump(by_alias=True, mode="json") for item in briefs],
    })
    try:
        report = report_generator(report_request, config)
    except Exception as exc:
        checkpoint["reportStatus"] = "failed"
        checkpoint["reportError"] = {
            "type": type(exc).__name__,
            "code": str(getattr(exc, "code", "")),
            "message": "报告生成失败，请使用诊断编号排查或稍后重试。",
            "diagnosticId": str(getattr(exc, "diagnostic_id", "")),
        }
        save_checkpoint(checkpoint_path, checkpoint)
        ensure_processes_unchanged()
        return checkpoint
    checkpoint["report"] = report.model_dump(by_alias=True, mode="json")
    checkpoint["reportStatus"] = "succeeded"
    checkpoint["reportInputKey"] = input_key
    checkpoint.pop("reportError", None)
    save_checkpoint(checkpoint_path, checkpoint)
    ensure_processes_unchanged()
    return checkpoint
