from fastapi.testclient import TestClient

from backend.main import create_app
from backend.llm_client import ProviderError
from backend.models import PurposeReport

from test_report_service import model_output, request


def test_report_endpoint_returns_injected_report() -> None:
    report = PurposeReport.model_validate({
        **model_output(),
        "reportId": "report-1",
        "sourceRevision": "rev-3",
    })
    app = create_app(
        config_loader=lambda: object(),
        report_generator=lambda _request, _config: report,
    )

    response = TestClient(app).post(
        "/api/v1/purpose-reports",
        json=request().model_dump(by_alias=True, mode="json"),
    )

    assert response.status_code == 200
    assert response.json()["reportId"] == "report-1"


def test_report_endpoint_requires_model_configuration() -> None:
    response = TestClient(create_app(config_loader=lambda: None)).post(
        "/api/v1/purpose-reports",
        json=request().model_dump(by_alias=True, mode="json"),
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "llm_not_configured"


def test_report_endpoint_returns_provider_diagnostic_id() -> None:
    def fail(_request, _config):
        raise ProviderError("provider_read_timeout", "模型响应超时", True, "1122AABB")

    response = TestClient(create_app(
        config_loader=lambda: object(),
        report_generator=fail,
    )).post(
        "/api/v1/purpose-reports",
        json=request().model_dump(by_alias=True, mode="json"),
    )

    assert response.status_code == 502
    assert response.json()["detail"]["diagnosticId"] == "1122AABB"
