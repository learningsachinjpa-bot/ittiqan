import logging
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis | None:
    return _redis


async def init_redis() -> None:
    global _redis
    try:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=3)
        await _redis.ping()
        logger.info("Redis connected: %s", settings.REDIS_URL)
    except Exception:
        logger.warning("Redis unavailable — token blacklist disabled. Logout will be client-side only.")
        _redis = None


async def close_redis() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


# ── Token blacklist helpers ───────────────────────────────────────────────────

async def blacklist_token(jti: str, ttl_seconds: int) -> None:
    """Add a token JTI to the blacklist. Expires automatically after ttl_seconds."""
    r = get_redis()
    if r and ttl_seconds > 0:
        try:
            await r.setex(f"bl:{jti}", ttl_seconds, "1")
        except Exception:
            logger.warning("Failed to blacklist token jti=%s", jti)


async def is_token_blacklisted(jti: str) -> bool:
    """Return True if the JTI has been blacklisted (i.e. token was logged out)."""
    r = get_redis()
    if not r:
        return False
    try:
        return await r.exists(f"bl:{jti}") == 1
    except Exception:
        return False
