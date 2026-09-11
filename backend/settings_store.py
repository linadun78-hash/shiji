import json
import os
from pathlib import Path
from typing import Mapping


def default_settings_path() -> Path:
    root = Path(os.environ.get("LOCALAPPDATA") or Path.home())
    return root / "XhsTaskMaterialCollector" / "settings.json"


class LocalSettingsStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or default_settings_path()

    def load(self) -> dict[str, str]:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (FileNotFoundError, OSError, json.JSONDecodeError):
            return {}
        if not isinstance(payload, dict):
            return {}
        return {
            key: value.strip()
            for key, value in payload.items()
            if key in {"base_url", "model", "api_key"} and isinstance(value, str) and value.strip()
        }

    def save(self, values: Mapping[str, str]) -> None:
        clean = {
            key: str(values[key]).strip()
            for key in ("base_url", "model", "api_key")
            if str(values.get(key, "")).strip()
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(clean, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.path)
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass

    def clear(self) -> None:
        try:
            self.path.unlink()
        except FileNotFoundError:
            return
