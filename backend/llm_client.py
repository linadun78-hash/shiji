import json
import time
from typing import Any, Callable
from urllib.parse import urlparse

import requests
from urllib3.exceptions import ReadTimeoutError

from .config import LLMConfig
from .diagnostics import DiagnosticRecorder, default_recorder


class ProviderError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        retryable: bool,
        diagnostic_id: str = "",
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.diagnostic_id = diagnostic_id


class ProviderPayload(dict[str, Any]):
    def __init__(self, payload: dict[str, Any], diagnostic_id: str, record_validation_failure) -> None:
        super().__init__(payload)
        self.diagnostic_id = diagnostic_id
        self._record_validation_failure = record_validation_failure

    def record_validation_failure(self, error_type: str) -> None:
        self._record_validation_failure(error_type)


def contains_exception(exc: BaseException, expected_type: type[BaseException]) -> bool:
    pending = [exc]
    seen: set[int] = set()
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        if isinstance(current, expected_type):
            return True
        for linked in (current.__cause__, current.__context__):
            if isinstance(linked, BaseException):
                pending.append(linked)
        for attribute in ("reason", "original_error"):
            linked = getattr(current, attribute, None)
            if isinstance(linked, BaseException):
                pending.append(linked)
        pending.extend(arg for arg in current.args if isinstance(arg, BaseException))
    return False


def request_json(
    config: LLMConfig,
    messages: list[dict[str, str]],
    *,
    post: Callable[..., requests.Response] = requests.post,
    operation: str = "unknown",
    recorder: DiagnosticRecorder = default_recorder,
) -> dict[str, Any]:
    diagnostic_id = recorder.new_id()
    started = time.monotonic()
    provider_host = urlparse(config.base_url).hostname or "unknown"

    def safe_record(**event: Any) -> None:
        try:
            recorder.record(**event)
        except Exception:
            pass

    def record_failure(
        error_type: str,
        http_status: int | None = None,
        stage: str = "provider_request",
    ) -> None:
        safe_record(
            diagnostic_id=diagnostic_id,
            operation=operation,
            stage=stage,
            outcome="failed",
            duration_ms=round((time.monotonic() - started) * 1000),
            provider_host=provider_host,
            model=config.model,
            error_type=error_type,
            http_status=http_status,
        )

    try:
        response = post(
            f"{config.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {config.api_key}", "Content-Type": "application/json"},
            json={
                "model": config.model,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": messages,
            },
            timeout=(5, 60),
        )
        response.raise_for_status()
    except requests.ConnectTimeout as exc:
        record_failure(type(exc).__name__, stage="provider_connect")
        raise ProviderError("provider_connect_timeout", "连接模型厂商超时", True, diagnostic_id) from exc
    except requests.ReadTimeout as exc:
        record_failure(type(exc).__name__, stage="provider_response_wait")
        raise ProviderError("provider_read_timeout", "模型响应超过 60 秒", False, diagnostic_id) from exc
    except requests.exceptions.SSLError as exc:
        record_failure(type(exc).__name__, stage="provider_connect")
        raise ProviderError("provider_tls_error", "模型厂商安全连接失败", True, diagnostic_id) from exc
    except requests.ConnectionError as exc:
        if contains_exception(exc, ReadTimeoutError):
            record_failure("ReadTimeoutError", stage="provider_response_wait")
            raise ProviderError("provider_read_timeout", "模型响应超过 60 秒", False, diagnostic_id) from exc
        record_failure(type(exc).__name__, stage="provider_connect")
        raise ProviderError("provider_connection_error", "无法连接模型厂商", True, diagnostic_id) from exc
    except requests.Timeout as exc:
        record_failure(type(exc).__name__, stage="provider_response_wait")
        raise ProviderError("provider_timeout", "模型响应超时", True, diagnostic_id) from exc
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else 0
        if status in (401, 403):
            code, message, retryable = "provider_auth_error", "API 密钥无效或无权限", False
        elif status == 404:
            code, message, retryable = "provider_not_found", "接口地址或模型名称不正确", False
        elif status == 429:
            code, message, retryable = "provider_rate_limited", "模型调用过于频繁或额度不足", True
        elif status >= 500:
            code, message, retryable = "provider_server_error", "模型厂商服务暂时异常", True
        else:
            code, message, retryable = "provider_http_error", f"模型厂商返回 HTTP {status}", False
        record_failure(type(exc).__name__, status, "provider_http_response")
        raise ProviderError(code, message, retryable, diagnostic_id) from exc
    except requests.RequestException as exc:
        record_failure(type(exc).__name__, stage="provider_connect")
        raise ProviderError("provider_unreachable", "无法连接模型厂商", True, diagnostic_id) from exc

    try:
        payload = response.json()
        content = payload["choices"][0]["message"]["content"]
        parsed = json.loads(content)
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        record_failure(type(exc).__name__, response.status_code, "provider_json_parse")
        raise ProviderError("provider_invalid_json", "模型返回格式无法识别", True, diagnostic_id) from exc
    if not isinstance(parsed, dict):
        record_failure("InvalidJsonRoot", response.status_code, "provider_json_parse")
        raise ProviderError("provider_invalid_json", "模型返回格式无法识别", True, diagnostic_id)
    safe_record(
        diagnostic_id=diagnostic_id,
        operation=operation,
        stage="completed",
        outcome="succeeded",
        duration_ms=round((time.monotonic() - started) * 1000),
        provider_host=provider_host,
        model=config.model,
        error_type=None,
        http_status=response.status_code,
    )
    return ProviderPayload(
        parsed,
        diagnostic_id,
        lambda error_type: record_failure(error_type, response.status_code, "result_validation"),
    )
