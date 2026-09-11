from collections.abc import Callable

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .auth import Auth0JWTVerifier, AuthConfig, AuthTokenError, TokenVerifier, get_auth_config
from .config import LLMConfig, get_llm_config
from .llm_client import ProviderError
from .models import (
    MaterialBriefRequest,
    MaterialBriefResponse,
    PurposeReport,
    PurposeReportRequest,
    SettingsUpdate,
    SettingsView,
    WorkbookImageExportRequest,
    WorkbookImageExportResponse,
)
from .report_service import ReportGenerationError, generate_purpose_report
from .service import BriefGenerationError, organize_material
from .settings_store import LocalSettingsStore
from .workbook_image_service import WorkbookImageExportError, render_workbook_images


def provider_error_detail(exc: ProviderError | BriefGenerationError | ReportGenerationError) -> dict[str, str | bool]:
    detail: dict[str, str | bool] = {
        "code": exc.code,
        "message": str(exc),
        "retryable": exc.retryable,
    }
    diagnostic_id = getattr(exc, "diagnostic_id", "")
    if diagnostic_id:
        detail["diagnosticId"] = diagnostic_id
    return detail


def create_app(
    *,
    config_loader: Callable[[], LLMConfig | None] = get_llm_config,
    organizer=organize_material,
    report_generator=generate_purpose_report,
    settings_store: LocalSettingsStore | None = None,
    connection_tester: Callable[[LLMConfig], None] | None = None,
    workbook_image_renderer=render_workbook_images,
    auth_config: AuthConfig | None = None,
    token_verifier: TokenVerifier | None = None,
) -> FastAPI:
    store = settings_store or LocalSettingsStore()
    effective_config_loader = (
        (lambda: get_llm_config(settings_store=store))
        if config_loader is get_llm_config
        else config_loader
    )
    effective_auth_config = auth_config or get_auth_config()
    effective_token_verifier = token_verifier
    if effective_auth_config.required and effective_token_verifier is None:
        effective_token_verifier = Auth0JWTVerifier(effective_auth_config)
    bearer = HTTPBearer(auto_error=False)
    app = FastAPI(title="拾集素材整理 Agent", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^chrome-extension://[a-p]{32}$",
        allow_methods=["POST", "GET", "PUT"],
        allow_headers=["Content-Type", "Authorization"],
    )

    def require_identity(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    ) -> dict | None:
        if not effective_auth_config.required:
            return None
        if credentials is None or credentials.scheme.lower() != "bearer":
            raise HTTPException(
                401,
                detail={"code": "auth_required", "message": "请先登录账号"},
                headers={"WWW-Authenticate": "Bearer"},
            )
        try:
            return effective_token_verifier(credentials.credentials)  # type: ignore[misc]
        except AuthTokenError as exc:
            raise HTTPException(
                401,
                detail={"code": "invalid_token", "message": str(exc)},
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

    def require_local_settings() -> None:
        if effective_auth_config.required:
            raise HTTPException(404, detail="Not Found")

    @app.exception_handler(RequestValidationError)
    async def safe_validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"loc": list(error["loc"]), "type": error["type"], "msg": error["msg"]}
            for error in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": errors})

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "agent": "material-organizer"}

    @app.get("/api/v1/settings", response_model=SettingsView)
    def get_settings(_local: None = Depends(require_local_settings)) -> SettingsView:
        saved = store.load()
        return SettingsView(
            configured=all(saved.get(key) for key in ("base_url", "model", "api_key")),
            base_url=saved.get("base_url", ""),
            model=saved.get("model", ""),
            has_api_key=bool(saved.get("api_key")),
        )

    @app.put("/api/v1/settings", response_model=SettingsView)
    def put_settings(
        request: SettingsUpdate,
        _local: None = Depends(require_local_settings),
    ) -> SettingsView:
        saved = store.load()
        api_key = request.api_key or saved.get("api_key", "")
        if not api_key:
            raise HTTPException(422, detail={"code": "api_key_required", "message": "首次配置需要 API 密钥"})
        try:
            store.save({
                "base_url": request.base_url.rstrip("/"),
                "model": request.model,
                "api_key": api_key,
            })
        except OSError as exc:
            raise HTTPException(
                500,
                detail={
                    "code": "settings_write_failed",
                    "message": "无法写入本机模型设置，请检查配置目录权限或重启本机服务",
                    "retryable": True,
                },
            ) from exc
        return get_settings()

    @app.post("/api/v1/settings/test")
    def test_settings(
        request: SettingsUpdate,
        _local: None = Depends(require_local_settings),
    ) -> dict[str, str]:
        api_key = request.api_key or store.load().get("api_key", "")
        if not api_key:
            raise HTTPException(422, detail={"code": "api_key_required", "message": "首次配置需要 API 密钥"})
        config = LLMConfig(request.base_url.rstrip("/"), api_key, request.model)
        try:
            if connection_tester is not None:
                connection_tester(config)
            else:
                from .llm_client import request_json

                request_json(
                    config,
                    [{"role": "user", "content": "Return a JSON object with status=ok."}],
                    operation="connection_test",
                )
            return {"status": "connected"}
        except ProviderError as exc:
            raise HTTPException(
                502,
                detail=provider_error_detail(exc),
            ) from exc

    @app.post("/api/v1/material-briefs", response_model=MaterialBriefResponse)
    def create_material_brief(
        request: MaterialBriefRequest,
        _identity: dict | None = Depends(require_identity),
    ) -> MaterialBriefResponse:
        config = effective_config_loader()
        if config is None:
            raise HTTPException(
                503,
                detail={
                    "code": "llm_not_configured",
                    "message": "模型服务尚未配置",
                    "retryable": False,
                },
            )
        try:
            return organizer(request, config)
        except ProviderError as exc:
            raise HTTPException(
                502,
                detail=provider_error_detail(exc),
            ) from exc
        except BriefGenerationError as exc:
            raise HTTPException(
                502,
                detail=provider_error_detail(exc),
            ) from exc

    @app.post("/api/v1/purpose-reports", response_model=PurposeReport)
    def create_purpose_report(
        request: PurposeReportRequest,
        _identity: dict | None = Depends(require_identity),
    ) -> PurposeReport:
        config = effective_config_loader()
        if config is None:
            raise HTTPException(
                503,
                detail={"code": "llm_not_configured", "message": "模型服务尚未配置", "retryable": False},
            )
        try:
            return report_generator(request, config)
        except ProviderError as exc:
            raise HTTPException(
                502,
                detail=provider_error_detail(exc),
            ) from exc
        except ReportGenerationError as exc:
            raise HTTPException(
                502,
                detail=provider_error_detail(exc),
            ) from exc

    @app.post(
        "/api/v1/experimental/workbook-images",
        response_model=WorkbookImageExportResponse,
    )
    def create_workbook_images(
        request: WorkbookImageExportRequest,
        _identity: dict | None = Depends(require_identity),
    ) -> WorkbookImageExportResponse:
        try:
            return workbook_image_renderer(request)
        except WorkbookImageExportError as exc:
            raise HTTPException(
                503,
                detail={"code": exc.code, "message": str(exc), "retryable": True},
            ) from exc

    return app


app = create_app()
