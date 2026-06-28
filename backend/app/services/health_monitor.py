"""
Agent health monitor — periodically pings each active agent endpoint and
records the result as a Trace so the Reliability/Uptime page has real data.

Uses APScheduler (AsyncIOScheduler) so it runs inside the FastAPI event loop
with no separate worker process needed.
"""
import logging
import uuid
from datetime import datetime

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.field_encryption import decrypt_text
from app.core.ssrf import validate_url
from app.models.agent import Agent, AgentStatus
from app.models.observability import Trace, TraceStatus

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None
_check_interval_minutes: int = 5


def get_interval() -> int:
    return _check_interval_minutes


def set_interval(minutes: int) -> None:
    global _check_interval_minutes
    _check_interval_minutes = max(1, min(minutes, 60))
    if _scheduler and _scheduler.running:
        _scheduler.reschedule_job("health_check", trigger=IntervalTrigger(minutes=_check_interval_minutes))
        logger.info("Health check interval updated to %d minutes", _check_interval_minutes)


async def check_agent(agent: Agent, db: Session) -> dict:
    """Ping a single agent endpoint and write a Trace. Returns result summary."""
    if not agent.endpoint_url:
        return {"agent_id": agent.id, "skipped": True, "reason": "no endpoint"}

    try:
        validate_url(agent.endpoint_url, allow_http_localhost=True)
    except Exception:
        return {"agent_id": agent.id, "skipped": True, "reason": "invalid/unsafe url"}

    headers = dict(agent.headers or {})
    if agent.api_key_encrypted:
        try:
            headers["Authorization"] = f"Bearer {decrypt_text(agent.api_key_encrypted)}"
        except Exception:
            pass

    method = (agent.http_method.value if agent.http_method else "POST").upper()
    payload = {"input": "__health_check__"}

    start = datetime.utcnow()
    status = TraceStatus.SUCCESS
    error_msg = None
    latency_ms = None

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
            if method == "GET":
                resp = await client.get(agent.endpoint_url, headers=headers)
            else:
                resp = await client.post(agent.endpoint_url, json=payload, headers=headers)

        latency_ms = int((datetime.utcnow() - start).total_seconds() * 1000)

        if resp.status_code >= 500:
            status = TraceStatus.ERROR
            error_msg = f"HTTP {resp.status_code}"
        elif resp.status_code >= 400:
            # 4xx counts as degraded but not error — agent is reachable
            status = TraceStatus.SUCCESS
        # else 2xx/3xx = success

    except httpx.TimeoutException:
        latency_ms = 10000
        status = TraceStatus.TIMEOUT
        error_msg = "Request timed out after 10s"
        logger.warning("Health check timeout: agent %s", agent.id)
    except Exception as exc:
        latency_ms = int((datetime.utcnow() - start).total_seconds() * 1000)
        status = TraceStatus.ERROR
        error_msg = str(exc)[:500]
        logger.warning("Health check error: agent %s — %s", agent.id, exc)

    trace = Trace(
        org_id=agent.org_id,
        agent_id=agent.id,
        trace_id=str(uuid.uuid4()),
        status=status,
        latency_ms=latency_ms,
        tokens_input=0,
        tokens_output=0,
        cost_usd=0.0,
        model_used="health_check",
        input="__health_check__",
        output=None,
        error_message=error_msg,
        timestamp=start,
    )
    db.add(trace)

    # Update agent status to reflect health
    if status == TraceStatus.ERROR:
        agent.status = AgentStatus.DEGRADED
    elif status == TraceStatus.SUCCESS and agent.status == AgentStatus.DEGRADED:
        agent.status = AgentStatus.ACTIVE

    db.commit()
    return {
        "agent_id": agent.id,
        "agent_name": agent.name,
        "status": status.value,
        "latency_ms": latency_ms,
        "error": error_msg,
    }


async def run_health_checks() -> list[dict]:
    """Check all active agents that have an endpoint URL."""
    db: Session = SessionLocal()
    results = []
    try:
        agents = db.query(Agent).filter(
            Agent.endpoint_url.isnot(None),
            Agent.status != AgentStatus.INACTIVE,
        ).all()

        if not agents:
            return []

        logger.info("Running health checks for %d agents", len(agents))
        for agent in agents:
            result = await check_agent(agent, db)
            results.append(result)

        # Evaluate alerts after all health checks complete
        try:
            from app.services.alert_engine import evaluate_alerts
            fired = await evaluate_alerts()
            if fired:
                logger.warning("Alert engine fired %d alerts: %s", len(fired), [a["alert_name"] for a in fired])
        except Exception as exc:
            logger.error("Alert engine error: %s", exc)

        return results
    except Exception as exc:
        logger.error("Health monitor run failed: %s", exc)
        return []
    finally:
        db.close()


async def expire_approval_requests() -> None:
    """Mark PENDING approval requests past their expires_at as EXPIRED, fire callbacks."""
    from app.models.approval import ApprovalRequest, ApprovalStatus
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        expired = db.query(ApprovalRequest).filter(
            ApprovalRequest.status == ApprovalStatus.PENDING,
            ApprovalRequest.expires_at <= now,
        ).all()
        for req in expired:
            req.status = ApprovalStatus.EXPIRED
            req.reviewed_at = now
            if req.callback_url:
                try:
                    import httpx
                    from app.core.ssrf import validate_url
                    validate_url(req.callback_url)
                    async with httpx.AsyncClient(timeout=5.0) as client:
                        await client.post(req.callback_url, json={
                            "id": req.id, "status": "expired",
                            "action_type": req.action_type, "action_title": req.action_title,
                        })
                except Exception:
                    pass
        if expired:
            db.commit()
            logger.info("Expired %d approval request(s)", len(expired))
    except Exception as exc:
        logger.error("Approval expiry job failed: %s", exc)
    finally:
        db.close()


def start_scheduler() -> None:
    global _scheduler
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        run_health_checks,
        trigger=IntervalTrigger(minutes=_check_interval_minutes),
        id="health_check",
        name="Agent health checks",
        replace_existing=True,
    )
    _scheduler.add_job(
        expire_approval_requests,
        trigger=IntervalTrigger(minutes=2),
        id="approval_expiry",
        name="Approval request expiry",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("Health monitor started — checking every %d minutes", _check_interval_minutes)


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Health monitor stopped")
