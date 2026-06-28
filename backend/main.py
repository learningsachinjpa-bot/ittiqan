import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.database import engine, Base
import app.models  # ensure all models are registered

from app.routers import auth, organizations, agents, datasets, evaluations, security, llm_providers, observability, schedules, reliability, health, approvals, billing

logging.basicConfig(level=logging.INFO)

limiter = Limiter(key_func=get_remote_address)

def _recover_orphaned_jobs() -> None:
    """
    ARCH-03: On startup, any job still in RUNNING/JUDGE_RUNNING state was orphaned
    by a server restart. Mark it FAILED with an actionable message so the user
    can retry rather than watching a job hang forever.
    """
    from app.core.database import SessionLocal
    from sqlalchemy import text as sql_text
    db = SessionLocal()
    try:
        # Use raw SQL to avoid SQLAlchemy enum type casting issues
        result = db.execute(sql_text(
            "UPDATE evaluations SET status = 'failed'::evaluationstatus, "
            "error_message = 'Server restarted while this evaluation was running.', "
            "error_action = 'The server restarted mid-run. Click Retry to re-run this evaluation.' "
            "WHERE status::text IN ('running', 'RUNNING', 'judge_running', 'JUDGE_RUNNING')"
        ))
        if result.rowcount:
            logging.warning("Recovered %d orphaned evaluations on startup", result.rowcount)

        result2 = db.execute(sql_text(
            "UPDATE security_assessments SET status = 'failed'::assessmentstatus, "
            "error_message = 'Server restarted while this assessment was running.' "
            "WHERE status::text IN ('running', 'RUNNING')"
        ))
        if result2.rowcount:
            logging.warning("Recovered %d orphaned assessments on startup", result2.rowcount)

        db.commit()
    except Exception:
        logging.exception("Failed to recover orphaned jobs on startup")
        db.rollback()
    finally:
        db.close()

def _run_column_migrations() -> None:
    """Add columns that were added after initial create_all. Safe to run on every startup."""
    from sqlalchemy import text as sql_text
    from app.core.database import SessionLocal
    db = SessionLocal()
    migrations = [
        # Added: default_metrics and llm_judge_provider_id on agents table
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS default_metrics JSON DEFAULT '[]'",
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS llm_judge_provider_id VARCHAR REFERENCES llm_providers(id) ON DELETE SET NULL",
        # Added: max_datasets on organizations table
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_datasets INTEGER DEFAULT 5",
    ]
    try:
        for stmt in migrations:
            try:
                db.execute(sql_text(stmt))
            except Exception as e:
                logging.warning("Column migration skipped (may already exist): %s", e)
        db.commit()
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.core.redis_client import init_redis, close_redis
    from app.services.health_monitor import start_scheduler, stop_scheduler
    Base.metadata.create_all(bind=engine)
    _run_column_migrations()
    _recover_orphaned_jobs()
    await init_redis()
    start_scheduler()
    yield
    stop_scheduler()
    await close_redis()

app = FastAPI(
    title="Ittiqan API",
    description="AI Agent Evaluation & Trust Platform",
    version="1.0.0",
    lifespan=lifespan,
    # Disable default exception handlers leaking internal details
    docs_url="/api/docs",
    redoc_url=None,
)

# ── Rate limiter ───────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Security headers middleware ────────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        # Remove server fingerprint header
        if "server" in response.headers:
            del response.headers["server"]
        return response

app.add_middleware(SecurityHeadersMiddleware)

# ── CORS — drive from config only ─────────────────────────────────────────────
_allowed_origins = [o.strip() for o in settings.FRONTEND_URL.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/api/v1")
app.include_router(organizations.router, prefix="/api/v1")
app.include_router(agents.router, prefix="/api/v1")
app.include_router(datasets.router, prefix="/api/v1")
app.include_router(evaluations.router, prefix="/api/v1")
app.include_router(security.router, prefix="/api/v1")
app.include_router(llm_providers.router, prefix="/api/v1")
app.include_router(observability.router, prefix="/api/v1")
app.include_router(schedules.router, prefix="/api/v1")
app.include_router(reliability.router, prefix="/api/v1")
app.include_router(health.router, prefix="/api/v1")
app.include_router(approvals.router, prefix="/api/v1")
app.include_router(billing.router, prefix="/api/v1")

@app.get("/")
async def root():
    return {"name": "Ittiqan API", "version": "1.0.0", "status": "running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
