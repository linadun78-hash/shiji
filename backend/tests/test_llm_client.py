import json
from pathlib import Path
from uuid import uuid4

import pytest
import requests
from urllib3.exceptions import MaxRetryError, ProxyError as Urllib3ProxyError, ReadTimeoutError

from backend.config import LLMConfig, get_llm_config
from backend.llm_client import ProviderError, request_json
from backend.settings_store import LocalSettingsStore


class FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            error = requests.HTTPError(f"HTTP {self.status_code}")
            error.response = self
            raise error

    def json(self) -> dict:
        return self._payload


class MemoryRecorder:
    def __init__(self) -> None:
        self.events = []

    def new_id(self) -> str:
        return "A1B2C3D4"

    def record(self, **event) -> None:
        self.events.append(event)


class BrokenRecorder(MemoryRecorder):
    def record(self, **event) -> None:
        raise RuntimeError("diagnostic logger failed")


def test_config_requires_all_three_values() -> None:
    isolated_store = LocalSettingsStore(Path(__file__).parent / f".settings-{uuid4().hex}.json")
    try:
        assert get_llm_config({"XMC_LLM_BASE_URL": "https://api.example/v1"}, settings_store=isolated_store) is None
    finally:
        isolated_store.clear()


def test_config_accepts_legacy_report_prompt_rollback() -> None:
    config = get_llm_config({
        "XMC_LLM_BASE_URL": "https://api.example/v1",
        "XMC_LLM_API_KEY": "secret",
        "XMC_LLM_MODEL": "test-model",
        "XMC_REPORT_PROMPT_VERSION": "legacy",
    })

    assert config is not None
    assert config.report_prompt_version == "legacy"


def test_config_falls_back_to_modular_prompt_for_unknown_internal_value() -> None:
    config = get_llm_config({
        "XMC_LLM_BASE_URL": "https://api.example/v1",
        "XMC_LLM_API_KEY": "secret",
        "XMC_LLM_MODEL": "test-model",
        "XMC_REPORT_PROMPT_VERSION": "future",
    })

    assert config is not None
    assert config.report_prompt_version == "modular_v1"


def test_request_json_sends_deterministic_json_request() -> None:
    captured = {}
    recorder = MemoryRecorder()

    def fake_post(url, **kwargs):
        captured.update({"url": url, **kwargs})
        return FakeResponse({
            "choices": [{"message": {"content": json.dumps({"status": "ok"})}}],
        })

    result = request_json(
        LLMConfig("https://api.example/v1", "secret", "test-model"),
        [{"role": "system", "content": "rules"}, {"role": "user", "content": "source"}],
        post=fake_post,
        recorder=recorder,
    )

    assert result == {"status": "ok"}
    assert captured["url"] == "https://api.example/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer secret"
    assert captured["json"]["temperature"] == 0
    assert captured["json"]["response_format"] == {"type": "json_object"}
    assert captured["timeout"] == (5, 60)


def test_diagnostic_write_failure_does_not_break_successful_provider_response() -> None:
    result = request_json(
        LLMConfig("https://api.example/v1", "secret", "test-model"),
        [],
        post=lambda *_args, **_kwargs: FakeResponse({
            "choices": [{"message": {"content": json.dumps({"status": "ok"})}}],
        }),
        recorder=BrokenRecorder(),
    )

    assert result == {"status": "ok"}


def test_request_json_maps_timeout_to_retryable_error() -> None:
    recorder = MemoryRecorder()

    def timeout(*args, **kwargs):
        raise requests.Timeout("slow: secret")

    with pytest.raises(ProviderError) as caught:
        request_json(
            LLMConfig("https://api.example/v1", "secret", "model"),
            [],
            post=timeout,
            recorder=recorder,
        )

    assert caught.value.code == "provider_timeout"
    assert caught.value.retryable is True
    assert "secret" not in str(caught.value)


@pytest.mark.parametrize(
    ("raised", "code", "message", "error_type", "retryable"),
    [
        (requests.ConnectTimeout("connect secret"), "provider_connect_timeout", "连接模型厂商超时", "ConnectTimeout", True),
        (requests.ReadTimeout("read secret"), "provider_read_timeout", "模型响应超过 60 秒", "ReadTimeout", False),
        (requests.exceptions.SSLError("tls secret"), "provider_tls_error", "模型厂商安全连接失败", "SSLError", True),
        (requests.ConnectionError("reset secret"), "provider_connection_error", "无法连接模型厂商", "ConnectionError", True),
    ],
)
def test_request_json_classifies_connection_failures(raised, code, message, error_type, retryable) -> None:
    recorder = MemoryRecorder()

    def fail(*args, **kwargs):
        raise raised

    with pytest.raises(ProviderError) as caught:
        request_json(
            LLMConfig("https://api.example/v1", "secret", "model"),
            [],
            post=fail,
            operation="material_brief",
            recorder=recorder,
        )

    assert caught.value.code == code
    assert str(caught.value) == message
    assert caught.value.diagnostic_id == "A1B2C3D4"
    assert caught.value.retryable is retryable
    assert recorder.events[-1]["error_type"] == error_type
    assert recorder.events[-1]["provider_host"] == "api.example"
    assert "secret" not in str(recorder.events)


def test_proxy_wrapped_read_timeout_is_not_retried_as_a_connection_error() -> None:
    recorder = MemoryRecorder()
    wrapped = requests.ConnectionError(
        ReadTimeoutError(None, "https://api.example/v1/chat/completions", "read timed out"),
    )

    def fail(*args, **kwargs):
        raise wrapped

    with pytest.raises(ProviderError) as caught:
        request_json(
            LLMConfig("https://api.example/v1", "secret", "model"),
            [],
            post=fail,
            operation="material_brief",
            recorder=recorder,
        )

    assert caught.value.code == "provider_read_timeout"
    assert str(caught.value) == "模型响应超过 60 秒"
    assert caught.value.retryable is False
    assert recorder.events[-1]["stage"] == "provider_response_wait"


def test_max_retry_proxy_wrapped_read_timeout_is_not_retried() -> None:
    recorder = MemoryRecorder()
    read_timeout = ReadTimeoutError(None, "https://api.example/v1/chat/completions", "read timed out")
    proxy_error = Urllib3ProxyError("proxy failed", read_timeout)
    max_retry = MaxRetryError(None, "https://api.example/v1/chat/completions", reason=proxy_error)
    wrapped = requests.exceptions.ProxyError(max_retry)

    def fail(*args, **kwargs):
        raise wrapped

    with pytest.raises(ProviderError) as caught:
        request_json(
            LLMConfig("https://api.example/v1", "secret", "model"),
            [],
            post=fail,
            operation="material_brief",
            recorder=recorder,
        )

    assert caught.value.code == "provider_read_timeout"
    assert caught.value.retryable is False
    assert recorder.events[-1]["stage"] == "provider_response_wait"


def test_request_json_records_json_parse_failure_in_its_own_stage() -> None:
    recorder = MemoryRecorder()

    with pytest.raises(ProviderError) as caught:
        request_json(
            LLMConfig("https://api.example/v1", "secret", "model"),
            [],
            post=lambda *_args, **_kwargs: FakeResponse({
                "choices": [{"message": {"content": "not-json"}}],
            }),
            operation="material_brief",
            recorder=recorder,
        )

    assert caught.value.code == "provider_invalid_json"
    assert recorder.events[-1]["stage"] == "provider_json_parse"


def test_success_payload_carries_the_diagnostic_id_for_later_validation() -> None:
    recorder = MemoryRecorder()

    result = request_json(
        LLMConfig("https://api.example/v1", "secret", "model"),
        [],
        post=lambda *_args, **_kwargs: FakeResponse({
            "choices": [{"message": {"content": json.dumps({"status": "ok"})}}],
        }),
        operation="material_brief",
        recorder=recorder,
    )

    assert result == {"status": "ok"}
    assert result.diagnostic_id == "A1B2C3D4"


@pytest.mark.parametrize(
    ("status", "code", "message", "retryable"),
    [
        (401, "provider_auth_error", "API 密钥无效或无权限", False),
        (404, "provider_not_found", "接口地址或模型名称不正确", False),
        (429, "provider_rate_limited", "模型调用过于频繁或额度不足", True),
        (503, "provider_server_error", "模型厂商服务暂时异常", True),
    ],
)
def test_request_json_classifies_common_http_failures(status, code, message, retryable) -> None:
    recorder = MemoryRecorder()

    with pytest.raises(ProviderError) as caught:
        request_json(
            LLMConfig("https://api.example/v1", "secret", "model"),
            [],
            post=lambda *_args, **_kwargs: FakeResponse({}, status_code=status),
            operation="connection_test",
            recorder=recorder,
        )

    assert caught.value.code == code
    assert str(caught.value) == message
    assert caught.value.diagnostic_id == "A1B2C3D4"
    assert caught.value.retryable is retryable
    assert recorder.events[-1]["http_status"] == status


def test_invalid_provider_json_is_retryable_once_by_service() -> None:
    recorder = MemoryRecorder()

    def invalid_json(*args, **kwargs):
        return FakeResponse({"choices": [{"message": {"content": "not-json"}}]})

    with pytest.raises(ProviderError) as caught:
        request_json(
            LLMConfig("https://api.example/v1", "secret", "model"),
            [],
            post=invalid_json,
            recorder=recorder,
        )

    assert caught.value.code == "provider_invalid_json"
    assert caught.value.retryable is True


def test_http_error_does_not_expose_api_key() -> None:
    recorder = MemoryRecorder()

    def server_error(*args, **kwargs):
        return FakeResponse({}, status_code=503)

    with pytest.raises(ProviderError) as caught:
        request_json(
            LLMConfig("https://api.example/v1", "private-api-key", "model"),
            [],
            post=server_error,
            recorder=recorder,
        )

    assert caught.value.code == "provider_server_error"
    assert caught.value.retryable is True
    assert "private-api-key" not in str(caught.value)
