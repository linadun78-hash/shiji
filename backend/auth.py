import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass

import jwt
from jwt import PyJWTError


@dataclass(frozen=True)
class AuthConfig:
    required: bool = False
    issuer: str = ""
    audience: str = ""
    jwks_url: str = ""


class AuthTokenError(RuntimeError):
    pass


def get_auth_config(env: Mapping[str, str] | None = None) -> AuthConfig:
    values = os.environ if env is None else env
    required = values.get("XMC_AUTH_REQUIRED", "").strip().lower() in {
        "1", "true", "yes", "on",
    }
    if not required:
        return AuthConfig(required=False)

    fields = {
        "issuer": values.get("XMC_AUTH0_ISSUER", "").strip(),
        "audience": values.get("XMC_AUTH0_AUDIENCE", "").strip(),
        "jwks_url": values.get("XMC_AUTH0_JWKS_URL", "").strip(),
    }
    environment_names = {
        "issuer": "XMC_AUTH0_ISSUER",
        "audience": "XMC_AUTH0_AUDIENCE",
        "jwks_url": "XMC_AUTH0_JWKS_URL",
    }
    missing = [environment_names[name] for name, value in fields.items() if not value]
    if missing:
        raise RuntimeError(f"Auth is enabled but required setting is missing: {', '.join(missing)}")
    return AuthConfig(required=True, **fields)


class Auth0JWTVerifier:
    def __init__(self, config: AuthConfig, jwks_client=None) -> None:
        if not config.required:
            raise ValueError("Auth0 verifier requires enabled auth configuration")
        self.config = config
        self.jwks_client = jwks_client or jwt.PyJWKClient(config.jwks_url, cache_keys=True)

    def __call__(self, token: str) -> dict:
        try:
            signing_key = self.jwks_client.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=self.config.audience,
                issuer=self.config.issuer,
                options={"require": ["exp", "sub"]},
            )
        except (PyJWTError, OSError, ValueError) as exc:
            raise AuthTokenError("访问令牌无效或已过期") from exc
        if not isinstance(claims.get("sub"), str) or not claims["sub"]:
            raise AuthTokenError("访问令牌缺少账号标识")
        return claims


TokenVerifier = Callable[[str], dict]
