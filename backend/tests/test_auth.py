from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from backend.auth import Auth0JWTVerifier, AuthConfig, AuthTokenError, get_auth_config
from backend.main import create_app
from backend.models import MaterialBriefResponse


MATERIAL_REQUEST = {
    "materialId": "task-1:xhs:note-1",
    "title": "测试笔记",
    "author": "作者",
    "bodyText": "这是一段长度足够的正文，用于验证云端鉴权后的素材整理接口。",
    "sourceUrl": "https://www.xiaohongshu.com/explore/note-1",
    "capturedAt": "2026-08-31T09:00:00Z",
    "contentHash": "v1-abcd1234",
}


def cloud_auth_config() -> AuthConfig:
    return AuthConfig(
        required=True,
        issuer="https://tenant.auth0.com/",
        audience="https://api.example.com",
        jwks_url="https://tenant.auth0.com/.well-known/jwks.json",
    )


def test_auth_config_defaults_to_disabled_local_mode() -> None:
    assert get_auth_config({}) == AuthConfig(required=False)


def test_enabled_auth_config_requires_all_public_verification_fields() -> None:
    with pytest.raises(RuntimeError, match="XMC_AUTH0_AUDIENCE"):
        get_auth_config({
            "XMC_AUTH_REQUIRED": "true",
            "XMC_AUTH0_ISSUER": "https://tenant.auth0.com/",
            "XMC_AUTH0_JWKS_URL": "https://tenant.auth0.com/.well-known/jwks.json",
        })


def test_rs256_verifier_checks_issuer_audience_expiry_and_subject() -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    class StaticJwksClient:
        def get_signing_key_from_jwt(self, _token: str):
            return type("SigningKey", (), {"key": private_key.public_key()})()

    verifier = Auth0JWTVerifier(cloud_auth_config(), jwks_client=StaticJwksClient())
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": "auth0|user-1",
            "iss": "https://tenant.auth0.com/",
            "aud": "https://api.example.com",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )

    assert verifier(token)["sub"] == "auth0|user-1"

    wrong_audience = jwt.encode(
        {
            "sub": "auth0|user-1",
            "iss": "https://tenant.auth0.com/",
            "aud": "https://wrong.example.com",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )
    with pytest.raises(AuthTokenError):
        verifier(wrong_audience)


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/material-briefs",
        "/api/v1/purpose-reports",
        "/api/v1/experimental/workbook-images",
    ],
)
def test_cloud_product_endpoints_require_bearer_token(path: str) -> None:
    client = TestClient(create_app(
        auth_config=cloud_auth_config(),
        token_verifier=lambda token: {"sub": "auth0|user-1"},
    ))

    assert client.get("/health").status_code == 200
    response = client.post(path, json={})
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "auth_required"


def test_valid_cloud_token_reaches_existing_agent_contract() -> None:
    seen_tokens = []
    app = create_app(
        auth_config=cloud_auth_config(),
        token_verifier=lambda token: seen_tokens.append(token) or {"sub": "auth0|user-1"},
        config_loader=lambda: object(),
        organizer=lambda request, config: MaterialBriefResponse(
            status="insufficient",
            message="当前正文不足，无法可靠整理。",
        ),
    )

    response = TestClient(app).post(
        "/api/v1/material-briefs",
        headers={"Authorization": "Bearer valid-token"},
        json=MATERIAL_REQUEST,
    )

    assert response.status_code == 200
    assert seen_tokens == ["valid-token"]
    assert response.json()["status"] == "insufficient"


def test_cloud_mode_hides_local_model_settings_endpoints() -> None:
    client = TestClient(create_app(
        auth_config=cloud_auth_config(),
        token_verifier=lambda token: {"sub": "auth0|user-1"},
    ))

    assert client.get("/api/v1/settings").status_code == 404
    assert client.put("/api/v1/settings", json={}).status_code == 404
    assert client.post("/api/v1/settings/test", json={}).status_code == 404
