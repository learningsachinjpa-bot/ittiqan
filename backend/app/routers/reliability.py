from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user, require_role, get_client_ip
from app.models.user import User
from app.models.organization import OrgMember, AuditLog
from app.models.observability import Trace, TraceStatus
from app.models.agent import Agent
from app.models.incident import Incident, IncidentSeverity, IncidentStatus

router = APIRouter(prefix="/reliability", tags=["reliability"])


def _get_member(db: Session, user_id: str) -> OrgMember:
    m = db.query(OrgMember).filter(OrgMember.user_id == user_id).first()
    if not m:
        raise HTTPException(status_code=403, detail="No organization")
    return m


def _incident_to_dict(i: Incident) -> dict:
    return {
        "id": i.id, "agent_id": i.agent_id, "title": i.title,
        "description": i.description, "severity": i.severity,
        "status": i.status,
        "created_at": i.created_at.isoformat(),
        "resolved_at": i.resolved_at.isoformat() if i.resolved_at else None,
    }


@router.get("/uptime")
async def get_uptime(
    agent_id: Optional[str] = None,
    hours: int = 24,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hours = max(1, min(hours, 720))
    m = _get_member(db, user.id)
    since = datetime.utcnow() - timedelta(hours=hours)
    q = db.query(Trace).filter(Trace.org_id == m.org_id, Trace.timestamp >= since)
    if agent_id:
        agent = db.query(Agent).filter(Agent.id == agent_id, Agent.org_id == m.org_id).first()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        q = q.filter(Trace.agent_id == agent_id)
    traces = q.order_by(Trace.timestamp.desc()).limit(500).all()
    return [
        {
            "id": t.id,
            "agent_id": t.agent_id,
            "status": t.status.value if hasattr(t.status, 'value') else t.status,
            "latency_ms": t.latency_ms,
            "checked_at": t.timestamp.isoformat(),
            "error_message": t.error_message,
        }
        for t in traces
    ]


class IncidentCreate(BaseModel):
    title: str = Field(..., max_length=300)
    severity: str = "medium"
    agent_id: Optional[str] = None
    description: Optional[str] = Field(None, max_length=5000)


@router.get("/incidents")
async def list_incidents(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = _get_member(db, user.id)
    incidents = db.query(Incident).filter(Incident.org_id == m.org_id).order_by(Incident.created_at.desc()).all()
    return [_incident_to_dict(i) for i in incidents]


@router.post("/incidents")
async def create_incident(
    request: Request,
    req: IncidentCreate,
    user: User = Depends(require_role("owner", "admin", "developer")),
    db: Session = Depends(get_db),
):
    m = _get_member(db, user.id)
    if req.agent_id:
        agent = db.query(Agent).filter(Agent.id == req.agent_id, Agent.org_id == m.org_id).first()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
    sev = req.severity if req.severity in [s.value for s in IncidentSeverity] else "medium"
    incident = Incident(
        org_id=m.org_id, agent_id=req.agent_id, title=req.title,
        description=req.description, severity=IncidentSeverity(sev), created_by=user.id,
    )
    db.add(incident)
    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id, action="incident.create",
        resource_type="incident", resource_id=incident.id,
        details=f"Created incident '{req.title}' ({sev})",
        ip_address=get_client_ip(request),
    ))
    db.commit()
    db.refresh(incident)
    return _incident_to_dict(incident)


@router.post("/incidents/{incident_id}/resolve")
async def resolve_incident(
    incident_id: str,
    request: Request,
    user: User = Depends(require_role("owner", "admin")),
    db: Session = Depends(get_db),
):
    m = _get_member(db, user.id)
    incident = db.query(Incident).filter(Incident.id == incident_id, Incident.org_id == m.org_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    incident.status = IncidentStatus.RESOLVED
    incident.resolved_at = datetime.utcnow()
    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id, action="incident.resolve",
        resource_type="incident", resource_id=incident_id,
        details=f"Resolved incident '{incident.title}'",
        ip_address=get_client_ip(request),
    ))
    db.commit()
    db.refresh(incident)
    return _incident_to_dict(incident)
