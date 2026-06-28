"""
Approval Gateway router.

Two authentication contexts:
  1. Agent → Ittiqan calls: Bearer <org_api_key> in Authorization header
  2. Human dashboard calls: standard JWT via get_current_user

Plan gate: ApprovalRequest creation requires PlanType.ENTERPRISE.
"""
import hashlib
import hmac
import os
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.core.ssrf import validate_url
from app.models.approval import ApprovalRequest, ApprovalStatus, ApprovalUrgency
from app.models.organization import Organization, OrgMember, PlanType
from app.models.user import User

router = APIRouter(prefix="/approvals", tags=["approvals"])

DEFAULT_EXPIRY_MINUTES = 30
ADVANCED_PLANS = {PlanType.ENTERPRISE}


# ── Plan gate helper ──────────────────────────────────────────────────────────

def _require_advanced(org: Organization) -> None:
    if org.plan not in ADVANCED_PLANS:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "plan_upgrade_required",
                "message": "Approval Gateway is an Advanced plan feature. Upgrade to unlock.",
                "current_plan": org.plan.value,
                "required_plan": "enterprise",
            },
        )


# ── Org API key auth (for agent calls) ───────────────────────────────────────

def _get_org_by_api_key(authorization: str, db: Session) -> Organization:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    key = authorization.removeprefix("Bearer ").strip()
    org = db.query(Organization).filter(Organization.api_key == key, Organization.is_active == True).first()
    if not org:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return org


def _get_member(db: Session, user_id: str) -> OrgMember:
    m = db.query(OrgMember).filter(OrgMember.user_id == user_id).first()
    if not m:
        raise HTTPException(status_code=403, detail="No organization")
    return m


# ── Org API key management ────────────────────────────────────────────────────

@router.post("/api-key/generate")
async def generate_api_key(
    user: User = Depends(require_role("owner", "admin")),
    db: Session = Depends(get_db),
):
    """Generate (or rotate) the org's API key for agent calls."""
    m = _get_member(db, user.id)
    org = db.query(Organization).filter(Organization.id == m.org_id).first()
    _require_advanced(org)

    new_key = f"itq_{secrets.token_hex(32)}"
    org.api_key = new_key
    org.api_key_created_at = datetime.utcnow()
    db.commit()
    return {"api_key": new_key, "created_at": org.api_key_created_at.isoformat()}


@router.get("/api-key")
async def get_api_key_info(
    user: User = Depends(require_role("owner", "admin")),
    db: Session = Depends(get_db),
):
    """Return whether an API key exists and when it was created (never exposes the key itself)."""
    m = _get_member(db, user.id)
    org = db.query(Organization).filter(Organization.id == m.org_id).first()
    return {
        "has_key": org.api_key is not None,
        "created_at": org.api_key_created_at.isoformat() if org.api_key_created_at else None,
    }


@router.delete("/api-key")
async def revoke_api_key(
    user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
):
    m = _get_member(db, user.id)
    org = db.query(Organization).filter(Organization.id == m.org_id).first()
    org.api_key = None
    org.api_key_created_at = None
    db.commit()
    return {"revoked": True}


# ── Agent-facing endpoints ────────────────────────────────────────────────────

class ApprovalRequestCreate(BaseModel):
    action_type: str = Field(..., max_length=100)
    action_title: str = Field(..., max_length=300)
    action_description: Optional[str] = None
    action_payload: Optional[dict] = None
    urgency: str = Field(default="normal")
    agent_id: Optional[str] = None
    callback_url: Optional[str] = None
    expires_in_minutes: Optional[int] = Field(default=None, ge=1, le=1440)


@router.post("/request")
async def submit_approval_request(
    body: ApprovalRequestCreate,
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
):
    """
    Agent submits an action for human approval.
    Auth: Authorization: Bearer <org_api_key>
    Returns immediately with request id + status=pending.
    Agent then polls GET /approvals/{id}/status or waits for callback_url webhook.
    """
    org = _get_org_by_api_key(authorization, db)
    _require_advanced(org)

    # Validate callback URL if provided
    if body.callback_url:
        try:
            validate_url(body.callback_url)
        except Exception:
            raise HTTPException(status_code=400, detail="callback_url is not a safe/reachable URL")

    try:
        urgency = ApprovalUrgency(body.urgency)
    except ValueError:
        urgency = ApprovalUrgency.NORMAL

    expiry_minutes = body.expires_in_minutes or DEFAULT_EXPIRY_MINUTES
    req = ApprovalRequest(
        id=str(uuid.uuid4()),
        org_id=org.id,
        agent_id=body.agent_id,
        action_type=body.action_type,
        action_title=body.action_title,
        action_description=body.action_description,
        action_payload=body.action_payload,
        urgency=urgency,
        callback_url=body.callback_url,
        expires_at=datetime.utcnow() + timedelta(minutes=expiry_minutes),
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    # Fire notification to org admins async (best-effort)
    try:
        from app.services.approval_notifier import notify_new_request
        import asyncio
        asyncio.create_task(notify_new_request(req, org, db))
    except Exception:
        pass

    return {
        "id": req.id,
        "status": req.status.value,
        "expires_at": req.expires_at.isoformat(),
        "message": "Approval request submitted. Poll /approvals/{id}/status or await callback.",
    }


@router.get("/request/{request_id}/status")
async def poll_approval_status(
    request_id: str,
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
):
    """Agent polls this to check decision. Returns status + review_note."""
    org = _get_org_by_api_key(authorization, db)
    req = db.query(ApprovalRequest).filter(
        ApprovalRequest.id == request_id,
        ApprovalRequest.org_id == org.id,
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Approval request not found")
    return {
        "id": req.id,
        "status": req.status.value,
        "review_note": req.review_note,
        "reviewed_at": req.reviewed_at.isoformat() if req.reviewed_at else None,
        "expires_at": req.expires_at.isoformat() if req.expires_at else None,
    }


# ── Human dashboard endpoints ─────────────────────────────────────────────────

def _req_to_dict(r: ApprovalRequest) -> dict:
    return {
        "id": r.id,
        "org_id": r.org_id,
        "agent_id": r.agent_id,
        "action_type": r.action_type,
        "action_title": r.action_title,
        "action_description": r.action_description,
        "action_payload": r.action_payload,
        "urgency": r.urgency.value if r.urgency else "normal",
        "status": r.status.value,
        "review_note": r.review_note,
        "reviewed_by": r.reviewed_by,
        "callback_url": r.callback_url,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "expires_at": r.expires_at.isoformat() if r.expires_at else None,
        "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
    }


@router.get("/queue")
async def get_queue(
    agent_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pending approval requests for the org, sorted by urgency then age."""
    m = _get_member(db, user.id)
    org = db.query(Organization).filter(Organization.id == m.org_id).first()
    _require_advanced(org)

    q = db.query(ApprovalRequest).filter(
        ApprovalRequest.org_id == m.org_id,
        ApprovalRequest.status == ApprovalStatus.PENDING,
    )
    if agent_id:
        q = q.filter(ApprovalRequest.agent_id == agent_id)

    URGENCY_ORDER = {"critical": 0, "high": 1, "normal": 2, "low": 3}
    items = q.order_by(ApprovalRequest.created_at.asc()).all()
    items.sort(key=lambda r: URGENCY_ORDER.get(r.urgency.value if r.urgency else "normal", 2))
    return [_req_to_dict(r) for r in items]


@router.get("/history")
async def get_history(
    status: Optional[str] = None,
    agent_id: Optional[str] = None,
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    m = _get_member(db, user.id)
    org = db.query(Organization).filter(Organization.id == m.org_id).first()
    _require_advanced(org)

    q = db.query(ApprovalRequest).filter(ApprovalRequest.org_id == m.org_id)
    if status:
        try:
            q = q.filter(ApprovalRequest.status == ApprovalStatus(status))
        except ValueError:
            pass
    if agent_id:
        q = q.filter(ApprovalRequest.agent_id == agent_id)

    items = q.order_by(ApprovalRequest.created_at.desc()).limit(min(limit, 200)).all()
    return [_req_to_dict(r) for r in items]


@router.get("/stats")
async def get_stats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    m = _get_member(db, user.id)
    org = db.query(Organization).filter(Organization.id == m.org_id).first()
    _require_advanced(org)

    all_reqs = db.query(ApprovalRequest).filter(ApprovalRequest.org_id == m.org_id).all()
    stats = {s.value: 0 for s in ApprovalStatus}
    for r in all_reqs:
        stats[r.status.value] += 1
    stats["total"] = len(all_reqs)
    return stats


@router.get("/{request_id}")
async def get_request(
    request_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    m = _get_member(db, user.id)
    req = db.query(ApprovalRequest).filter(
        ApprovalRequest.id == request_id,
        ApprovalRequest.org_id == m.org_id,
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    return _req_to_dict(req)


class DecisionBody(BaseModel):
    note: Optional[str] = Field(default=None, max_length=1000)


@router.post("/{request_id}/approve")
async def approve_request(
    request_id: str,
    body: DecisionBody = DecisionBody(),
    user: User = Depends(require_role("owner", "admin", "developer")),
    db: Session = Depends(get_db),
):
    m = _get_member(db, user.id)
    req = db.query(ApprovalRequest).filter(
        ApprovalRequest.id == request_id,
        ApprovalRequest.org_id == m.org_id,
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if req.status != ApprovalStatus.PENDING:
        raise HTTPException(status_code=409, detail=f"Request is already {req.status.value}")

    req.status = ApprovalStatus.APPROVED
    req.reviewed_by = user.id
    req.review_note = body.note
    req.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(req)

    # Fire callback webhook
    if req.callback_url:
        import asyncio
        asyncio.create_task(_fire_callback(req))

    return _req_to_dict(req)


@router.post("/{request_id}/reject")
async def reject_request(
    request_id: str,
    body: DecisionBody,
    user: User = Depends(require_role("owner", "admin", "developer")),
    db: Session = Depends(get_db),
):
    m = _get_member(db, user.id)
    req = db.query(ApprovalRequest).filter(
        ApprovalRequest.id == request_id,
        ApprovalRequest.org_id == m.org_id,
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if req.status != ApprovalStatus.PENDING:
        raise HTTPException(status_code=409, detail=f"Request is already {req.status.value}")
    if not body.note or not body.note.strip():
        raise HTTPException(status_code=422, detail="Rejection requires a note explaining why")

    req.status = ApprovalStatus.REJECTED
    req.reviewed_by = user.id
    req.review_note = body.note.strip()
    req.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(req)

    if req.callback_url:
        import asyncio
        asyncio.create_task(_fire_callback(req))

    return _req_to_dict(req)


@router.post("/{request_id}/cancel")
async def cancel_request(
    request_id: str,
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
):
    """Agent cancels its own pending request."""
    org = _get_org_by_api_key(authorization, db)
    req = db.query(ApprovalRequest).filter(
        ApprovalRequest.id == request_id,
        ApprovalRequest.org_id == org.id,
        ApprovalRequest.status == ApprovalStatus.PENDING,
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Not found or not cancellable")
    req.status = ApprovalStatus.CANCELLED
    req.reviewed_at = datetime.utcnow()
    db.commit()
    return {"cancelled": True}


# ── Webhook delivery ──────────────────────────────────────────────────────────

async def _fire_callback(req: ApprovalRequest) -> None:
    try:
        validate_url(req.callback_url)
        payload = {
            "id": req.id,
            "status": req.status.value,
            "review_note": req.review_note,
            "reviewed_at": req.reviewed_at.isoformat() if req.reviewed_at else None,
            "action_type": req.action_type,
            "action_title": req.action_title,
        }
        async with httpx.AsyncClient(timeout=8.0) as client:
            await client.post(req.callback_url, json=payload)
    except Exception:
        pass
