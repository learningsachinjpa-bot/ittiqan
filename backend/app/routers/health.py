from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models.user import User
from app.models.organization import OrgMember
from app.models.agent import Agent, AgentStatus
from app.models.observability import Trace, TraceStatus
from app.services import health_monitor

router = APIRouter(prefix="/health", tags=["health"])


def _get_member(db: Session, user_id: str) -> OrgMember:
    m = db.query(OrgMember).filter(OrgMember.user_id == user_id).first()
    if not m:
        raise HTTPException(status_code=403, detail="No organization")
    return m


@router.get("/status")
async def get_health_status(
    hours: int = 24,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return uptime summary per agent for the org."""
    hours = max(1, min(hours, 720))
    m = _get_member(db, user.id)
    since = datetime.utcnow() - timedelta(hours=hours)

    agents = db.query(Agent).filter(
        Agent.org_id == m.org_id,
        Agent.endpoint_url.isnot(None),
    ).all()

    results = []
    for agent in agents:
        traces = db.query(Trace).filter(
            Trace.org_id == m.org_id,
            Trace.agent_id == agent.id,
            Trace.model_used == "health_check",
            Trace.timestamp >= since,
        ).order_by(Trace.timestamp.desc()).all()

        total = len(traces)
        successful = sum(1 for t in traces if t.status == TraceStatus.SUCCESS)
        latencies = [t.latency_ms for t in traces if t.latency_ms is not None]
        avg_latency = round(sum(latencies) / len(latencies)) if latencies else None
        last_check = traces[0].timestamp.isoformat() if traces else None
        last_status = traces[0].status.value if traces else "unknown"

        results.append({
            "agent_id": agent.id,
            "agent_name": agent.name,
            "status": agent.status.value if agent.status else "active",
            "uptime_pct": round(successful / total * 100, 2) if total else None,
            "total_checks": total,
            "avg_latency_ms": avg_latency,
            "last_check": last_check,
            "last_status": last_status,
        })

    return {
        "agents": results,
        "check_interval_minutes": health_monitor.get_interval(),
        "period_hours": hours,
    }


@router.post("/check/{agent_id}")
async def manual_check(
    agent_id: str,
    user: User = Depends(require_role("owner", "admin", "developer")),
    db: Session = Depends(get_db),
):
    """Manually trigger a health check for one agent."""
    m = _get_member(db, user.id)
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.org_id == m.org_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if not agent.endpoint_url:
        raise HTTPException(status_code=400, detail="Agent has no endpoint URL configured")

    result = await health_monitor.check_agent(agent, db)
    return result


class IntervalUpdate(BaseModel):
    minutes: int = Field(..., ge=1, le=60)


@router.put("/config")
async def update_config(
    body: IntervalUpdate,
    user: User = Depends(require_role("owner", "admin")),
):
    """Update the global health check interval."""
    health_monitor.set_interval(body.minutes)
    return {"check_interval_minutes": health_monitor.get_interval()}


@router.get("/config")
async def get_config(user: User = Depends(get_current_user)):
    return {"check_interval_minutes": health_monitor.get_interval()}
