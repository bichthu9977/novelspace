import hashlib
import json
import logging
import os
from typing import Any, Callable, Optional

from dotenv import load_dotenv

try:
    import redis
except ImportError:  # pragma: no cover - allows app boot without redis installed locally
    redis = None


load_dotenv()

logger = logging.getLogger("truyenfullvn.cache")

CACHE_ENABLED = os.getenv("CACHE_ENABLED", "true").lower() not in {"0", "false", "no"}
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CACHE_KEY_PREFIX = os.getenv("CACHE_KEY_PREFIX", "truyenfullvn")
CACHE_DEFAULT_TTL = int(os.getenv("CACHE_DEFAULT_TTL", "300"))
CACHE_TRENDING_TTL = int(os.getenv("CACHE_TRENDING_TTL", str(CACHE_DEFAULT_TTL)))
CACHE_RELATED_TTL = int(os.getenv("CACHE_RELATED_TTL", str(CACHE_DEFAULT_TTL)))
CACHE_SEARCH_TTL = int(os.getenv("CACHE_SEARCH_TTL", "120"))
CACHE_HOMEPAGE_TTL = int(os.getenv("CACHE_HOMEPAGE_TTL", str(CACHE_DEFAULT_TTL)))
CACHE_RECENT_TTL = int(os.getenv("CACHE_RECENT_TTL", str(CACHE_DEFAULT_TTL)))

_client = None


def get_redis_client():
    global _client

    if not CACHE_ENABLED or redis is None:
        return None

    if _client is None:
        _client = redis.Redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )

    return _client


def make_cache_key(group: str, **params: Any) -> str:
    payload = json.dumps(params, sort_keys=True, ensure_ascii=False, default=str)
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"{CACHE_KEY_PREFIX}:{group}:{digest}"


def get_json(key: str) -> Optional[Any]:
    client = get_redis_client()

    if client is None:
        logger.info("cache bypass key=%s reason=disabled_or_unavailable", key)
        return None

    try:
        raw_value = client.get(key)
    except Exception as exc:
        logger.warning("cache read failed key=%s error=%s", key, exc)
        return None

    if raw_value is None:
        logger.info("cache miss key=%s", key)
        return None

    try:
        logger.info("cache hit key=%s", key)
        return json.loads(raw_value)
    except json.JSONDecodeError:
        logger.warning("cache decode failed key=%s", key)
        return None


def set_json(key: str, value: Any, ttl: int) -> None:
    client = get_redis_client()

    if client is None:
        return

    try:
        client.setex(key, int(ttl), json.dumps(value, ensure_ascii=False, default=str))
        logger.info("cache set key=%s ttl=%s", key, ttl)
    except Exception as exc:
        logger.warning("cache write failed key=%s error=%s", key, exc)


def get_or_set_json(key: str, ttl: int, loader: Callable[[], Any]) -> Any:
    cached_value = get_json(key)

    if cached_value is not None:
        return cached_value

    value = loader()
    set_json(key, value, ttl)
    return value


def delete_group(group: str) -> None:
    client = get_redis_client()

    if client is None:
        return

    pattern = f"{CACHE_KEY_PREFIX}:{group}:*"

    try:
        keys = list(client.scan_iter(match=pattern, count=200))
        if keys:
            client.delete(*keys)
        logger.info("cache invalidate group=%s count=%s", group, len(keys))
    except Exception as exc:
        logger.warning("cache invalidate failed group=%s error=%s", group, exc)


def invalidate_public_book_cache() -> None:
    for group in ("trending", "related", "search", "homepage", "recent"):
        delete_group(group)
