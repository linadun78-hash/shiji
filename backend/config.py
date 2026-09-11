import os
from dataclasses import dataclass
from typing import Mapping

from .settings_store import LocalSettingsStore


@dataclass(frozen=True)
class LLMConfig:
    base_url: str
    api_key: str
    model: str
    report_prompt_version: str = "modular_v1"


def get_llm_config(
    env: Mapping[str, str] | None = None,
    settings_store: LocalSettingsStore | None = None,
) -> LLMConfig | None:
    values = os.environ if env is None else env
    base_url = values.get("XMC_LLM_BASE_URL", "").strip().rstrip("/")
    api_key = values.get("XMC_LLM_API_KEY", "").strip()
    model = values.get("XMC_LLM_MODEL", "").strip()
    report_prompt_version = values.get("XMC_REPORT_PROMPT_VERSION", "modular_v1").strip()
    if report_prompt_version not in {"legacy", "modular_v1"}:
        report_prompt_version = "modular_v1"
    if not all((base_url, api_key, model)):
        saved = (settings_store or LocalSettingsStore()).load()
        base_url = base_url or saved.get("base_url", "").rstrip("/")
        api_key = api_key or saved.get("api_key", "")
        model = model or saved.get("model", "")
    if not all((base_url, api_key, model)):
        return None
    return LLMConfig(base_url, api_key, model, report_prompt_version)
