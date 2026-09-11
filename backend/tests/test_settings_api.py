from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from backend.config import LLMConfig
from backend.llm_client import ProviderError
from backend.main import create_app
from backend.settings_store import LocalSettingsStore


def make_store() -> LocalSettingsStore:
    return LocalSettingsStore(Path(__file__).parent / f".settings-{uuid4().hex}.json")


def test_settings_get_hides_secret_and_returns_saved_fields() -> None:
    store = make_store()
    store.save({"base_url": "https://api.example/v1", "model": "demo", "api_key": "secret"})

    response = TestClient(create_app(settings_store=store)).get("/api/v1/settings")

    assert response.status_code == 200
    assert response.json() == {
        "configured": True,
        "baseUrl": "https://api.example/v1",
        "model": "demo",
        "hasApiKey": True,
    }
    assert "secret" not in response.text
    store.clear()


def test_settings_put_persists_configuration_without_returning_secret() -> None:
    store = make_store()
    client = TestClient(create_app(settings_store=store))

    response = client.put(
        "/api/v1/settings",
        json={"baseUrl": "https://api.example/v1", "model": "demo", "apiKey": "secret"},
    )

    assert response.status_code == 200
    assert response.json()["hasApiKey"] is True
    assert "secret" not in response.text
    assert store.load() == {
        "base_url": "https://api.example/v1",
        "model": "demo",
        "api_key": "secret",
    }
    store.clear()


def test_settings_store_restricts_secret_file_permissions() -> None:
    store = make_store()

    with patch("backend.settings_store.os.chmod") as chmod:
        store.save({"base_url": "https://api.example/v1", "model": "demo", "api_key": "secret"})

    chmod.assert_called_once_with(store.path, 0o600)
    store.clear()


def test_settings_put_rejects_blank_values() -> None:
    store = make_store()
    response = TestClient(create_app(settings_store=store)).put(
        "/api/v1/settings",
        json={"baseUrl": "", "model": "demo", "apiKey": "secret"},
    )

    assert response.status_code == 422
    store.clear()


def test_settings_put_preserves_saved_key_when_secret_is_blank() -> None:
    store = make_store()
    store.save({"base_url": "https://old.example/v1", "model": "old", "api_key": "saved-secret"})
    client = TestClient(create_app(settings_store=store))

    response = client.put(
        "/api/v1/settings",
        json={"baseUrl": "https://new.example/v1", "model": "new", "apiKey": ""},
    )

    assert response.status_code == 200
    assert store.load()["api_key"] == "saved-secret"
    store.clear()


def test_settings_put_returns_json_when_local_store_is_not_writable() -> None:
    class UnwritableStore:
        def load(self) -> dict[str, str]:
            return {}

        def save(self, _values: dict[str, str]) -> None:
            raise PermissionError("settings directory is read-only")

    response = TestClient(create_app(settings_store=UnwritableStore())).put(
        "/api/v1/settings",
        json={"baseUrl": "https://api.example/v1", "model": "demo", "apiKey": "secret"},
    )

    assert response.status_code == 500
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {
        "detail": {
            "code": "settings_write_failed",
            "message": "无法写入本机模型设置，请检查配置目录权限或重启本机服务",
            "retryable": True,
        }
    }


def test_settings_test_uses_submitted_values_without_saving() -> None:
    store = make_store()
    calls = []

    def tester(config: LLMConfig) -> None:
        calls.append(config)

    client = TestClient(create_app(settings_store=store, connection_tester=tester))
    response = client.post(
        "/api/v1/settings/test",
        json={"baseUrl": "https://api.example/v1", "model": "demo", "apiKey": "secret"},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "connected"}
    assert calls == [LLMConfig("https://api.example/v1", "secret", "demo")]
    assert store.load() == {}
    store.clear()


def test_settings_test_uses_saved_key_when_secret_is_blank() -> None:
    store = make_store()
    store.save({"base_url": "https://old.example/v1", "model": "old", "api_key": "saved-secret"})
    calls = []

    def tester(config: LLMConfig) -> None:
        calls.append(config)

    client = TestClient(create_app(settings_store=store, connection_tester=tester))
    response = client.post(
        "/api/v1/settings/test",
        json={"baseUrl": "https://new.example/v1", "model": "new", "apiKey": ""},
    )

    assert response.status_code == 200
    assert calls == [LLMConfig("https://new.example/v1", "saved-secret", "new")]
    store.clear()


def test_settings_test_returns_provider_diagnostic_id() -> None:
    store = make_store()

    def fail(_config: LLMConfig) -> None:
        raise ProviderError("provider_auth_error", "API 密钥无效或无权限", False, "D4C3B2A1")

    response = TestClient(create_app(settings_store=store, connection_tester=fail)).post(
        "/api/v1/settings/test",
        json={"baseUrl": "https://api.example/v1", "model": "demo", "apiKey": "secret"},
    )

    assert response.status_code == 502
    assert response.json()["detail"]["diagnosticId"] == "D4C3B2A1"
    assert "secret" not in response.text
    store.clear()
