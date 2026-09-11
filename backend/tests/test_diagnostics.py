import json
from pathlib import Path
from uuid import uuid4

from backend.diagnostics import DiagnosticRecorder


def test_diagnostic_recorder_writes_safe_json_without_user_content() -> None:
    log_path = Path(__file__).parent / f".diagnostics-{uuid4().hex}.log"
    recorder = DiagnosticRecorder(log_path)

    diagnostic_id = recorder.new_id()
    recorder.record(
        diagnostic_id=diagnostic_id,
        operation="material_brief",
        stage="provider_request",
        outcome="failed",
        duration_ms=321,
        provider_host="api.example.test",
        model="demo-model",
        error_type="ConnectionError",
        http_status=None,
    )

    assert len(diagnostic_id) == 8
    assert diagnostic_id.isalnum()
    try:
        payload = json.loads(log_path.read_text(encoding="utf-8"))
        assert payload == {
            "timestamp": payload["timestamp"],
            "diagnosticId": diagnostic_id,
            "operation": "material_brief",
            "stage": "provider_request",
            "outcome": "failed",
            "durationMs": 321,
            "providerHost": "api.example.test",
            "model": "demo-model",
            "errorType": "ConnectionError",
            "httpStatus": None,
        }
        assert payload["timestamp"].endswith("+00:00")
        serialized = json.dumps(payload, ensure_ascii=False)
        for secret in ("api-key", "笔记正文", "笔记标题", "作者昵称", "xiaohongshu.com"):
            assert secret not in serialized
    finally:
        for handler in recorder._get_logger().handlers:
            handler.close()
        log_path.unlink(missing_ok=True)
