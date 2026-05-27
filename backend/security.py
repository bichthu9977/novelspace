import logging
import os
import re
from typing import Iterable

from dotenv import load_dotenv
from fastapi import Request
from fastapi.responses import JSONResponse, PlainTextResponse


load_dotenv()

logger = logging.getLogger("truyenfullvn.security")

SECURITY_HEADERS_ENABLED = os.getenv("SECURITY_HEADERS_ENABLED", "true").lower() == "true"
ANTI_BOT_ENABLED = os.getenv("ANTI_BOT_ENABLED", "true").lower() == "true"
SUSPICIOUS_IP_LOGGING_ENABLED = os.getenv("SUSPICIOUS_IP_LOGGING_ENABLED", "true").lower() == "true"
SECURE_HSTS_ENABLED = os.getenv("SECURE_HSTS_ENABLED", "true").lower() == "true"

CSP_REPORT_ONLY = os.getenv("CSP_REPORT_ONLY", "false").lower() == "true"
CSP_HEADER_NAME = "Content-Security-Policy-Report-Only" if CSP_REPORT_ONLY else "Content-Security-Policy"

DEFAULT_CSP = (
    "default-src 'self'; "
    "base-uri 'self'; "
    "frame-ancestors 'none'; "
    "object-src 'none'; "
    "form-action 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https:; "
    "font-src 'self' data: https:; "
    "media-src 'self' https://audio.novel-space.com https://audio.truyenfullvn.org; "
    "connect-src 'self' https://api.truyenfullvn.org http://127.0.0.1:8000 http://localhost:8000"
)
CONTENT_SECURITY_POLICY = os.getenv("CONTENT_SECURITY_POLICY", DEFAULT_CSP)

BLOCKED_USER_AGENT_PATTERNS = tuple(
    pattern.strip()
    for pattern in os.getenv(
        "BLOCKED_USER_AGENT_PATTERNS",
        "sqlmap,nikto,nmap,masscan,acunetix,nessus,dirbuster,gobuster,python-requests,curl",
    ).split(",")
    if pattern.strip()
)

SUSPICIOUS_PATH_PATTERNS = (
    re.compile(r"\.\./"),
    re.compile(r"/\.env(?:$|[/?#])", re.IGNORECASE),
    re.compile(r"/wp-admin|/wp-login|/xmlrpc\.php", re.IGNORECASE),
    re.compile(r"/phpmyadmin|/pma(?:/|$)", re.IGNORECASE),
    re.compile(r"/vendor/phpunit", re.IGNORECASE),
)

SENSITIVE_PREFIXES = (
    "/api/login",
    "/api/register",
    "/api/comments",
    "/api/bookmarks",
    "/api/reading-progress",
    "/api/notifications",
    "/admin",
)


def get_client_ip(request: Request) -> str:
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip.strip()

    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()

    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()

    if request.client:
        return request.client.host

    return "unknown"


def _contains_any(value: str, needles: Iterable[str]) -> bool:
    lowered = value.lower()
    return any(needle.lower() in lowered for needle in needles)


def is_sensitive_path(path: str) -> bool:
    return path.startswith(SENSITIVE_PREFIXES)


def is_suspicious_request(request: Request) -> tuple[bool, str]:
    path = request.url.path or "/"
    user_agent = request.headers.get("user-agent", "")

    if not user_agent and is_sensitive_path(path):
        return True, "missing_user_agent"

    if user_agent and _contains_any(user_agent, BLOCKED_USER_AGENT_PATTERNS):
        return True, "blocked_user_agent"

    if any(pattern.search(path) for pattern in SUSPICIOUS_PATH_PATTERNS):
        return True, "suspicious_path"

    return False, ""


def suspicious_response(request: Request, reason: str):
    if request.url.path.startswith("/api"):
        return JSONResponse(
            status_code=403,
            content={"detail": "Request blocked", "error": "request_blocked"},
        )

    return PlainTextResponse("Forbidden", status_code=403)


def add_security_headers(request: Request, response):
    if not SECURITY_HEADERS_ENABLED:
        return response

    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    response.headers.setdefault(CSP_HEADER_NAME, CONTENT_SECURITY_POLICY)

    forwarded_proto = request.headers.get("X-Forwarded-Proto", "")
    if SECURE_HSTS_ENABLED and (request.url.scheme == "https" or forwarded_proto == "https"):
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains; preload",
        )

    return response


async def security_middleware(request: Request, call_next):
    suspicious, reason = is_suspicious_request(request)

    if suspicious and SUSPICIOUS_IP_LOGGING_ENABLED:
        logger.warning(
            "Suspicious request blocked=%s reason=%s ip=%s path=%s ua=%s",
            ANTI_BOT_ENABLED,
            reason,
            get_client_ip(request),
            request.url.path,
            (request.headers.get("user-agent") or "")[:300],
        )

    if suspicious and ANTI_BOT_ENABLED:
        response = suspicious_response(request, reason)
        return add_security_headers(request, response)

    response = await call_next(request)
    return add_security_headers(request, response)
