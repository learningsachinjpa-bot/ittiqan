from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List
import re
from datetime import datetime, timedelta

from app.core.database import get_db
from app.core.security import get_current_user, require_role, get_client_ip
from app.models.user import User
from app.models.organization import Organization, OrgMember, OrgMemberRole, PlanType, AuditLog

router = APIRouter(prefix="/organizations", tags=["organizations"])

class CreateOrgRequest(BaseModel):
    name: str
    slug: Optional[str] = None
    plan: str = "free"
    region: str = "uae"  # uae | eu | us
    department: Optional[str] = None
    use_case: Optional[str] = None

class UpdateOrgRequest(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    use_case: Optional[str] = None
    # HIGH-1: plan cannot be self-upgraded — must go through billing webhook

class InviteMemberRequest(BaseModel):
    email: str
    role: str = "developer"

def org_to_dict(org: Organization) -> dict:
    return {
        "id": org.id, "name": org.name, "slug": org.slug, "plan": org.plan,
        "region": getattr(org, "region", "uae"),
        "department": org.department, "use_case": org.use_case,
        "max_agents": org.max_agents, "max_evaluations_per_month": org.max_evaluations_per_month,
        "max_datasets": org.max_datasets,
        "created_at": org.created_at.isoformat() if org.created_at else None,
    }

PLAN_LIMITS = {
    "free": {"max_agents": 3, "max_evaluations_per_month": 100, "max_datasets": 5},
    "pro": {"max_agents": 20, "max_evaluations_per_month": 2000, "max_datasets": 50},
    "enterprise": {"max_agents": -1, "max_evaluations_per_month": -1, "max_datasets": -1},
}

_VALID_ROLES = {r.value for r in OrgMemberRole}

@router.post("")
async def create_organization(req: CreateOrgRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing_membership = db.query(OrgMember).filter(OrgMember.user_id == user.id).first()
    if existing_membership:
        raise HTTPException(status_code=400, detail="User already belongs to an organization")

    slug = req.slug or re.sub(r'[^a-z0-9-]', '', req.name.lower().replace(' ', '-'))
    if db.query(Organization).filter(Organization.slug == slug).first():
        slug = f"{slug}-{user.id[:6]}"

    limits = PLAN_LIMITS.get(req.plan, PLAN_LIMITS["free"])
    org = Organization(
        name=req.name, slug=slug,
        plan=PlanType(req.plan) if req.plan in PlanType.__members__.values() else PlanType.FREE,
        region=req.region if req.region in ("uae", "eu", "us") else "uae",
        department=req.department, use_case=req.use_case,
        **limits
    )
    db.add(org)
    db.flush()

    member = OrgMember(org_id=org.id, user_id=user.id, role=OrgMemberRole.OWNER)
    db.add(member)
    db.add(AuditLog(org_id=org.id, user_id=user.id, action="create", resource_type="organization", resource_id=org.id, details=f"Created organization: {org.name}"))
    db.commit()
    db.refresh(org)
    return org_to_dict(org)

@router.get("/me")
async def get_my_org(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    membership = db.query(OrgMember).filter(OrgMember.user_id == user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="No organization found")
    org = db.query(Organization).filter(Organization.id == membership.org_id).first()
    result = org_to_dict(org)
    result["role"] = membership.role
    members = db.query(OrgMember).filter(OrgMember.org_id == org.id).all()
    result["member_count"] = len(members)
    return result

@router.put("/me")
async def update_my_org(req: UpdateOrgRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    membership = db.query(OrgMember).filter(OrgMember.user_id == user.id).first()
    if not membership or membership.role not in [OrgMemberRole.OWNER, OrgMemberRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    org = db.query(Organization).filter(Organization.id == membership.org_id).first()
    if req.name: org.name = req.name
    if req.department: org.department = req.department
    if req.use_case: org.use_case = req.use_case
    db.commit()
    db.refresh(org)
    return org_to_dict(org)

@router.get("/me/members")
async def get_members(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    membership = db.query(OrgMember).filter(OrgMember.user_id == user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="No organization found")
    members = db.query(OrgMember).filter(OrgMember.org_id == membership.org_id).all()
    result = []
    for m in members:
        member_user = db.query(User).filter(User.id == m.user_id).first()
        result.append({"id": m.id, "user_id": m.user_id, "name": member_user.name, "email": member_user.email, "picture": member_user.picture, "role": m.role, "joined_at": m.joined_at.isoformat()})
    return result

@router.post("/me/invite")
async def invite_member(
    req: InviteMemberRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = db.query(OrgMember).filter(OrgMember.user_id == user.id).first()
    if not membership or membership.role not in [OrgMemberRole.OWNER, OrgMemberRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Only owners and admins can invite members")

    role_str = req.role.lower()
    if role_str not in _VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(_VALID_ROLES)}")

    invitee = db.query(User).filter(User.email == req.email).first()
    if not invitee:
        raise HTTPException(status_code=404, detail="No user found with that email. They need to sign up first.")

    existing = db.query(OrgMember).filter(OrgMember.user_id == invitee.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="User is already a member of an organization")

    new_member = OrgMember(
        org_id=membership.org_id,
        user_id=invitee.id,
        role=OrgMemberRole(role_str),
        invited_by=user.id,
    )
    db.add(new_member)
    db.add(AuditLog(
        org_id=membership.org_id, user_id=user.id,
        action="member.invite", resource_type="org_member", resource_id=invitee.id,
        details=f"Invited {invitee.email} as {role_str}",
        ip_address=get_client_ip(request),
    ))
    db.commit()
    db.refresh(new_member)
    return {"id": new_member.id, "user_id": invitee.id, "name": invitee.name, "email": invitee.email, "picture": invitee.picture, "role": new_member.role, "joined_at": new_member.joined_at.isoformat()}

@router.get("/me/audit-logs")
async def get_audit_logs(
    user: User = Depends(require_role("owner", "admin")),
    db: Session = Depends(get_db),
    action_type: Optional[str] = Query(None, description="Filter by action (e.g. 'agent.create')"),
    resource_type: Optional[str] = Query(None),
    since: Optional[str] = Query(None, description="ISO date string"),
    until: Optional[str] = Query(None, description="ISO date string"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    membership = db.query(OrgMember).filter(OrgMember.user_id == user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="No organization found")

    q = db.query(AuditLog).filter(AuditLog.org_id == membership.org_id)
    if action_type:
        q = q.filter(AuditLog.action == action_type)
    if resource_type:
        q = q.filter(AuditLog.resource_type == resource_type)
    if since:
        try:
            q = q.filter(AuditLog.created_at >= datetime.fromisoformat(since))
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid 'since' date format")
    if until:
        try:
            q = q.filter(AuditLog.created_at <= datetime.fromisoformat(until))
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid 'until' date format")

    total = q.count()
    logs = q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()

    # Resolve user names in one query
    user_ids = list({l.user_id for l in logs if l.user_id})
    users_map: dict = {}
    if user_ids:
        users_map = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": l.id,
                "action": l.action,
                "resource_type": l.resource_type,
                "resource_id": l.resource_id,
                "details": l.details,
                "ip_address": l.ip_address,
                "created_at": l.created_at.isoformat(),
                "user": {
                    "id": l.user_id,
                    "name": users_map[l.user_id].name if l.user_id in users_map else None,
                    "email": users_map[l.user_id].email if l.user_id in users_map else None,
                    "picture": users_map[l.user_id].picture if l.user_id in users_map else None,
                } if l.user_id else None,
            }
            for l in logs
        ],
    }


@router.get("/me/usage-stats")
async def get_usage_stats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns plan limits, current consumption, cost/token summary,
    per-agent breakdown, and 30-day daily evaluation counts.
    """
    from app.models.agent import Agent
    from app.models.dataset import Dataset
    from app.models.evaluation import Evaluation, EvaluationStatus
    from app.models.observability import Trace
    from app.models.security import SecurityAssessment

    membership = db.query(OrgMember).filter(OrgMember.user_id == user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="No organization found")
    org = db.query(Organization).filter(Organization.id == membership.org_id).first()

    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    thirty_days_ago = now - timedelta(days=30)

    # ── Plan consumption ──────────────────────────────────────────────────────
    agent_count    = db.query(func.count(Agent.id)).filter(Agent.org_id == org.id).scalar() or 0
    dataset_count  = db.query(func.count(Dataset.id)).filter(Dataset.org_id == org.id).scalar() or 0
    eval_this_month = db.query(func.count(Evaluation.id)).filter(
        Evaluation.org_id == org.id,
        Evaluation.created_at >= month_start,
    ).scalar() or 0
    security_count = db.query(func.count(SecurityAssessment.id)).filter(
        SecurityAssessment.org_id == org.id
    ).scalar() or 0

    # ── Trace / cost summary (last 30 days) ───────────────────────────────────
    traces_30d = db.query(Trace).filter(
        Trace.org_id == org.id,
        Trace.timestamp >= thirty_days_ago,
    ).all()
    total_traces   = len(traces_30d)
    total_tokens   = sum((t.tokens_input or 0) + (t.tokens_output or 0) for t in traces_30d)
    total_cost_usd = round(sum(t.cost_usd or 0 for t in traces_30d), 4)
    error_traces   = sum(1 for t in traces_30d if str(t.status) in ("error", "TraceStatus.ERROR"))

    # ── Eval summary (all time) ───────────────────────────────────────────────
    all_evals = db.query(Evaluation).filter(Evaluation.org_id == org.id).all()
    completed_evals = [e for e in all_evals if e.status == EvaluationStatus.COMPLETED]
    avg_score = round(
        sum(e.overall_score for e in completed_evals if e.overall_score is not None)
        / len(completed_evals), 3
    ) if completed_evals else None

    # ── Daily eval counts — last 30 days ─────────────────────────────────────
    daily_evals: List[dict] = []
    for i in range(30):
        day = (now - timedelta(days=29 - i)).date()
        day_start = datetime(day.year, day.month, day.day)
        day_end   = day_start + timedelta(days=1)
        count = sum(1 for e in all_evals if day_start <= e.created_at < day_end)
        daily_evals.append({"date": day.isoformat(), "count": count})

    # ── Per-agent breakdown ───────────────────────────────────────────────────
    agents = db.query(Agent).filter(Agent.org_id == org.id).all()
    agent_rows = []
    for a in agents:
        agent_evals = [e for e in all_evals if e.agent_id == a.id]
        agent_traces = [t for t in traces_30d if t.agent_id == a.id]
        agent_completed = [e for e in agent_evals if e.status == EvaluationStatus.COMPLETED]
        agent_score = round(
            sum(e.overall_score for e in agent_completed if e.overall_score is not None)
            / len(agent_completed), 3
        ) if agent_completed else None
        agent_rows.append({
            "id": a.id,
            "name": a.name,
            "eval_count": len(agent_evals),
            "trace_count_30d": len(agent_traces),
            "avg_score": agent_score,
            "last_evaluated_at": a.last_evaluated_at.isoformat() if a.last_evaluated_at else None,
        })
    agent_rows.sort(key=lambda r: r["eval_count"], reverse=True)

    return {
        "plan": {
            "name": org.plan.value,
            "max_agents": org.max_agents,
            "max_evaluations_per_month": org.max_evaluations_per_month,
            "max_datasets": org.max_datasets,
        },
        "consumption": {
            "agents": agent_count,
            "datasets": dataset_count,
            "evaluations_this_month": eval_this_month,
            "evaluations_total": len(all_evals),
            "security_scans": security_count,
        },
        "traces_30d": {
            "total": total_traces,
            "errors": error_traces,
            "error_rate_pct": round(error_traces / total_traces * 100, 1) if total_traces else 0,
            "total_tokens": total_tokens,
            "total_cost_usd": total_cost_usd,
        },
        "evals": {
            "completed": len(completed_evals),
            "avg_score": avg_score,
        },
        "daily_evals": daily_evals,
        "agents": agent_rows,
    }
