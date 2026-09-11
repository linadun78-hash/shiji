from fastapi.testclient import TestClient

from backend.main import create_app
from backend.llm_client import ProviderError
from backend.models import MaterialBriefResponse


REQUEST = {
    "materialId": "task-1:xhs:note-1",
    "title": "测试笔记",
    "author": "作者",
    "bodyText": "这是一段长度足够的正文，用于验证 Agent 1 接口能够收到白名单字段并返回不足状态之外的结果。",
    "sourceUrl": "https://www.xiaohongshu.com/explore/note-1",
    "capturedAt": "2026-08-09T09:00:00Z",
    "contentHash": "v1-abcd1234",
}


def test_health_endpoint() -> None:
    client = TestClient(create_app(config_loader=lambda: None))
    assert client.get("/health").json() == {"status": "ok", "agent": "material-organizer"}


def test_material_endpoint_returns_injected_result() -> None:
    app = create_app(
        config_loader=lambda: object(),
        organizer=lambda request, config: MaterialBriefResponse(
            status="insufficient",
            message="当前正文不足，无法可靠整理。",
        ),
    )
    response = TestClient(app).post("/api/v1/material-briefs", json=REQUEST)
    assert response.status_code == 200
    assert response.json()["status"] == "insufficient"


def test_material_endpoint_rejects_open_url_without_echoing_secret() -> None:
    response = TestClient(create_app(config_loader=lambda: object())).post(
        "/api/v1/material-briefs",
        json={**REQUEST, "openUrl": "https://example.test/?xsec_token=secret"},
    )
    assert response.status_code == 422
    assert "secret" not in response.text


def test_material_endpoint_reports_missing_provider_configuration() -> None:
    response = TestClient(create_app(config_loader=lambda: None)).post(
        "/api/v1/material-briefs",
        json=REQUEST,
    )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "llm_not_configured"


def test_material_endpoint_returns_provider_diagnostic_id_without_source_content() -> None:
    def fail(_request, _config):
        raise ProviderError(
            "provider_connection_error",
            "无法连接模型厂商",
            True,
            "A1B2C3D4",
        )

    response = TestClient(create_app(config_loader=lambda: object(), organizer=fail)).post(
        "/api/v1/material-briefs",
        json=REQUEST,
    )

    assert response.status_code == 502
    assert response.json()["detail"] == {
        "code": "provider_connection_error",
        "message": "无法连接模型厂商",
        "retryable": True,
        "diagnosticId": "A1B2C3D4",
    }
    assert REQUEST["bodyText"] not in response.text
