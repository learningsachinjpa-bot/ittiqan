import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timedelta

from app.core.database import get_db
from app.core.security import get_current_user, require_role, get_client_ip
from app.models.user import User
from app.models.observability import Trace, Alert, TraceStatus, AlertSeverity
from app.models.agent import Agent
from app.models.organization import OrgMember, AuditLog

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/observability", tags=["observability"])

_WRITE_ROLES = ("owner", "admin", "developer")
_ADMIN_ROLES = ("owner", "admin")

class TraceIngest(BaseModel):
    agent_id: str
    trace_id: Optional[str] = None
    status: str = "success"
    input: Optional[str] = Field(None, max_length=50000)
    output: Optional[str] = Field(None, max_length=50000)
    latency_ms: Optional[int] = Field(None, ge=0, le=600_000)
    tokens_input: int = Field(0, ge=0)
    tokens_output: int = Field(0, ge=0)
    cost_usd: float = Field(0.0, ge=0.0, le=1000.0)
    model_used: Optional[str] = Field(None, max_length=200)
    spans: List[dict] = Field(default_factory=list, max_length=500)
    metadata: dict = Field(default_factory=dict)
    error_message: Optional[str] = Field(None, max_length=5000)
    timestamp: Optional[str] = None

class AlertCreate(BaseModel):
    agent_id: Optional[str] = None
    name: str = Field(..., max_length=200)
    severity: str = "medium"
    condition_type: str = Field(..., max_length=100)
    condition_threshold: float = Field(..., ge=0.0, le=100.0)
    notification_channels: List[dict] = Field(default_factory=list, max_length=10)

def get_user_org_member(db: Session, user_id: str) -> OrgMember:
    m = db.query(OrgMember).filter(OrgMember.user_id == user_id).first()
    if not m:
        raise HTTPException(status_code=403, detail="No organization")
    return m

@router.post("/traces")
async def ingest_trace(
    request: Request,
    req: TraceIngest,
    user: User = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
):
    m = get_user_org_member(db, user.id)

    # MED-7: verify agent_id belongs to this org
    if req.agent_id:
        agent = db.query(Agent).filter(Agent.id == req.agent_id, Agent.org_id == m.org_id).first()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found in your organization")

    trace = Trace(
        org_id=m.org_id, agent_id=req.agent_id,
        trace_id=req.trace_id or str(uuid.uuid4()),
        status=TraceStatus(req.status) if req.status in [s.value for s in TraceStatus] else TraceStatus.SUCCESS,
        input=req.input, output=req.output,
        latency_ms=req.latency_ms, tokens_input=req.tokens_input,
        tokens_output=req.tokens_output, cost_usd=req.cost_usd,
        model_used=req.model_used, spans=req.spans, extra_data=req.metadata,
        error_message=req.error_message,
        timestamp=datetime.fromisoformat(req.timestamp) if req.timestamp else datetime.utcnow(),
    )
    db.add(trace)
    db.commit()
    return {"id": trace.id, "trace_id": trace.trace_id}

@router.get("/traces")
async def list_traces(
    agent_id: Optional[str] = None,
    hours: int = 24,
    limit: int = 100,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # MED-4 / HIGH-8: cap both params
    hours = max(1, min(hours, 720))
    limit = max(1, min(limit, 500))
    m = get_user_org_member(db, user.id)
    since = datetime.utcnow() - timedelta(hours=hours)
    q = db.query(Trace).filter(Trace.org_id == m.org_id, Trace.timestamp >= since)
    if agent_id:
        # MED-7: ensure agent belongs to org
        agent = db.query(Agent).filter(Agent.id == agent_id, Agent.org_id == m.org_id).first()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        q = q.filter(Trace.agent_id == agent_id)
    traces = q.order_by(Trace.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": t.id, "trace_id": t.trace_id, "agent_id": t.agent_id,
            "status": t.status, "latency_ms": t.latency_ms,
            "tokens_input": t.tokens_input, "tokens_output": t.tokens_output,
            "cost_usd": t.cost_usd, "model_used": t.model_used,
            "timestamp": t.timestamp.isoformat(), "error_message": t.error_message,
        }
        for t in traces
    ]

@router.get("/metrics")
async def get_metrics(
    agent_id: Optional[str] = None,
    hours: int = 24,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hours = max(1, min(hours, 720))
    m = get_user_org_member(db, user.id)
    since = datetime.utcnow() - timedelta(hours=hours)
    q = db.query(Trace).filter(Trace.org_id == m.org_id, Trace.timestamp >= since)
    if agent_id:
        q = q.filter(Trace.agent_id == agent_id)
    traces = q.all()

    if not traces:
        return {"total_calls": 0, "error_rate": 0, "avg_latency_ms": 0, "p50_latency_ms": 0, "p95_latency_ms": 0, "p99_latency_ms": 0, "total_tokens": 0, "total_cost_usd": 0, "throughput_per_hour": 0}

    latencies = sorted([t.latency_ms for t in traces if t.latency_ms is not None])
    errors = [t for t in traces if t.status == TraceStatus.ERROR]

    def percentile(data: list, p: int) -> int:
        if not data:
            return 0
        return data[min(int(len(data) * p / 100), len(data) - 1)]

    return {
        "total_calls": len(traces),
        "error_rate": round(len(errors) / len(traces) * 100, 2),
        "avg_latency_ms": round(sum(latencies) / len(latencies), 0) if latencies else 0,
        "p50_latency_ms": percentile(latencies, 50),
        "p95_latency_ms": percentile(latencies, 95),
        "p99_latency_ms": percentile(latencies, 99),
        "total_tokens": sum(t.tokens_input + t.tokens_output for t in traces),
        "total_cost_usd": round(sum(t.cost_usd for t in traces), 4),
        "throughput_per_hour": round(len(traces) / hours, 2),
    }

@router.get("/traces/{trace_id}")
async def get_trace_detail(trace_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = get_user_org_member(db, user.id)
    t = db.query(Trace).filter(Trace.org_id == m.org_id, Trace.trace_id == trace_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Trace not found")
    return {
        "id": t.id, "trace_id": t.trace_id, "agent_id": t.agent_id, "status": t.status,
        "input": t.input, "output": t.output, "latency_ms": t.latency_ms,
        "tokens_input": t.tokens_input, "tokens_output": t.tokens_output,
        "cost_usd": t.cost_usd, "model_used": t.model_used,
        "spans": t.spans, "error_message": t.error_message,
        "timestamp": t.timestamp.isoformat(),
    }

@router.get("/alerts")
async def list_alerts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = get_user_org_member(db, user.id)
    alerts = db.query(Alert).filter(Alert.org_id == m.org_id).all()
    return [
        {
            "id": a.id, "name": a.name, "agent_id": a.agent_id, "severity": a.severity,
            "condition_type": a.condition_type, "condition_threshold": a.condition_threshold,
            "is_active": a.is_active, "triggered_count": a.triggered_count,
            "last_triggered_at": a.last_triggered_at.isoformat() if a.last_triggered_at else None,
        }
        for a in alerts
    ]

@router.post("/alerts")
async def create_alert(
    request: Request,
    req: AlertCreate,
    user: User = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
):
    m = get_user_org_member(db, user.id)
    # Verify agent belongs to org if provided
    if req.agent_id:
        agent = db.query(Agent).filter(Agent.id == req.agent_id, Agent.org_id == m.org_id).first()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

    alert = Alert(
        org_id=m.org_id, agent_id=req.agent_id, name=req.name,
        severity=AlertSeverity(req.severity), condition_type=req.condition_type,
        condition_threshold=req.condition_threshold, notification_channels=req.notification_channels,
    )
    db.add(alert)
    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="alert.create", resource_type="alert", resource_id=alert.id,
        details=f"Created alert '{req.name}' ({req.condition_type} @ {req.condition_threshold})",
        ip_address=get_client_ip(request),
    ))
    db.commit()
    db.refresh(alert)
    return {"id": alert.id, "name": alert.name, "condition_type": alert.condition_type}

class AlertChannelsUpdate(BaseModel):
    notification_channels: List[dict] = Field(default_factory=list, max_length=10)

@router.patch("/alerts/{alert_id}/channels")
async def update_alert_channels(
    alert_id: str,
    request: Request,
    body: AlertChannelsUpdate,
    user: User = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
):
    """Update only the notification channels for an alert (email, webhook)."""
    m = get_user_org_member(db, user.id)
    a = db.query(Alert).filter(Alert.id == alert_id, Alert.org_id == m.org_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Alert not found")
    a.notification_channels = body.notification_channels
    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="alert.channels.update", resource_type="alert", resource_id=alert_id,
        details=f"Updated notification channels for alert '{a.name}'",
        ip_address=get_client_ip(request),
    ))
    db.commit()
    db.refresh(a)
    return {"id": a.id, "notification_channels": a.notification_channels}

@router.delete("/alerts/{alert_id}")
async def delete_alert(
    alert_id: str,
    request: Request,
    user: User = Depends(require_role(*_ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    m = get_user_org_member(db, user.id)
    a = db.query(Alert).filter(Alert.id == alert_id, Alert.org_id == m.org_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Alert not found")
    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="alert.delete", resource_type="alert", resource_id=alert_id,
        details=f"Deleted alert '{a.name}'",
        ip_address=get_client_ip(request),
    ))
    db.delete(a)
    db.commit()
    return {"success": True}


@router.post("/alerts/evaluate")
async def trigger_alert_evaluation(
    agent_id: Optional[str] = None,
    user: User = Depends(require_role(*_ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    """Manually trigger alert evaluation for the org (or a specific agent)."""
    m = get_user_org_member(db, user.id)
    from app.services.alert_engine import evaluate_alerts
    fired = await evaluate_alerts(org_id=m.org_id, agent_id=agent_id)
    return {"fired_count": len(fired), "fired": fired}
