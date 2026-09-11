import json
import logging
import os
import secrets
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any


def default_diagnostics_path() -> Path:
    root = Path(os.environ.get("LOCALAPPDATA") or Path.home())
    return root / "XhsTaskMaterialCollector" / "diagnostics.log"


class DiagnosticRecorder:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or default_diagnostics_path()
        self._logger: logging.Logger | None = None

    def new_id(self) -> str:
        return secrets.token_hex(4).upper()

    def _get_logger(self) -> logging.Logger:
        if self._logger is not None:
            return self._logger
        self.path.parent.mkdir(parents=True, exist_ok=True)
        logger = logging.getLogger(f"xmc.diagnostics.{id(self)}")
        logger.setLevel(logging.INFO)
        logger.propagate = False
        handler = RotatingFileHandler(
            self.path,
            maxBytes=256 * 1024,
            backupCount=2,
            encoding="utf-8",
        )
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
        self._logger = logger
        return logger

    def record(
        self,
        *,
        diagnostic_id: str,
        operation: str,
        stage: str,
        outcome: str,
        duration_ms: int,
        provider_host: str,
        model: str,
        error_type: str | None,
        http_status: int | None,
    ) -> None:
        event: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "diagnosticId": diagnostic_id,
            "operation": operation,
            "stage": stage,
            "outcome": outcome,
            "durationMs": duration_ms,
            "providerHost": provider_host,
            "model": model,
            "errorType": error_type,
            "httpStatus": http_status,
        }
        self._get_logger().info(json.dumps(event, ensure_ascii=False, separators=(",", ":")))
        for handler in self._logger.handlers:
            handler.flush()


default_recorder = DiagnosticRecorder()
