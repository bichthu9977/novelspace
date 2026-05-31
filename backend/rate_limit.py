import os

from dotenv import load_dotenv
from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware


load_dotenv()

LOGIN_RATE_LIMIT = os.getenv("LOGIN_RATE_LIMIT", "5/minute")
REGISTER_RATE_LIMIT = os.getenv("REGISTER_RATE_LIMIT", "3/minute")
COMMENT_RATE_LIMIT = os.getenv("COMMENT_RATE_LIMIT", "10/minute")
BOOKMARK_RATE_LIMIT = os.getenv("BOOKMARK_RATE_LIMIT", "20/minute")
RATE_LIMIT_STORAGE_URL = os.getenv(
    "RATE_LIMIT_STORAGE_URL",
    os.getenv("REDIS_URL", "memory://"),
)


def proxy_client_ip_key_func(request: Request) -> str:
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip.strip()

    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        client_ip = forwarded_for.split(",", 1)[0].strip()
        if client_ip:
            return client_ip

    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()

    if request.client:
        return request.client.host

    return "unknown"


limiter = Limiter(
    key_func=proxy_client_ip_key_func,
    storage_uri=RATE_LIMIT_STORAGE_URL,
    headers_enabled=True,
    retry_after="delta-seconds",
)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    response = JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests. Please try again later.",
            "error": "rate_limit_exceeded",
        },
    )
    view_rate_limit = getattr(request.state, "view_rate_limit", None)
    if view_rate_limit is not None:
        response = limiter._inject_headers(response, view_rate_limit)

    return response


def setup_rate_limiting(app):
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)
