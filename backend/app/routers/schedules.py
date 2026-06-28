from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user, require_role, get_client_ip
from app.models.user import User
from app.models.organization import OrgMember, AuditLog
from app.models.schedule import Schedule, ScheduleStatus

router = APIRouter(prefix="/schedules", tags=["schedules"])

_WRITE_ROLES = ("owner", "admin", "developer")

def get_member(db: Session, user_id: str) -> OrgMember:
    m = db.query(OrgMember).filter(OrgMember.user_id == user_id).first()
    if not m:
        raise HTTPException(status_code=403, detail="No organization")
    return m

def schedule_to_dict(s: Schedule) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "cron_expression": s.cron_expression,
        "agent_id": s.agent_id,
        "dataset_id": s.dataset_id,
        "llm_judge_provider_id": s.llm_judge_provider_id,
        "status": s.status,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "last_run_at": s.last_run_at.isoformat() if s.last_run_at else None,
    }

class CreateScheduleRequest(BaseModel):
    name: str
    cron_expression: str
    agent_id: Optional[str] = None
    dataset_id: Optional[str] = None
    llm_judge_provider_id: Optional[str] = None

class UpdateScheduleRequest(BaseModel):
    name: Optional[str] = None
    cron_expression: Optional[str] = None
    status: Optional[str] = None

@router.get("")
async def list_schedules(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = get_member(db, user.id)
    schedules = db.query(Schedule).filter(Schedule.org_id == m.org_id).order_by(Schedule.created_at.desc()).all()
    return [schedule_to_dict(s) for s in schedules]

@router.post("")
async def create_schedule(
    req: CreateScheduleRequest,
    request: Request,
    user: User = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
):
    m = get_member(db, user.id)
    if not req.name or not req.cron_expression:
        raise HTTPException(status_code=400, detail="name and cron_expression are required")

    schedule = Schedule(
        org_id=m.org_id,
        name=req.name[:200],
        cron_expression=req.cron_expression[:100],
        agent_id=req.agent_id,
        dataset_id=req.dataset_id,
        llm_judge_provider_id=req.llm_judge_provider_id,
        created_by=user.id,
    )
    db.add(schedule)
    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="schedule.create", resource_type="schedule", resource_id=schedule.id,
        details=f"Created schedule '{req.name}' ({req.cron_expression})",
        ip_address=get_client_ip(request),
    ))
    db.commit()
    db.refresh(schedule)
    return schedule_to_dict(schedule)

@router.put("/{schedule_id}")
async def update_schedule(
    schedule_id: str,
    req: UpdateScheduleRequest,
    request: Request,
    user: User = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
):
    m = get_member(db, user.id)
    s = db.query(Schedule).filter(Schedule.id == schedule_id, Schedule.org_id == m.org_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")

    if req.name is not None:
        s.name = req.name[:200]
    if req.cron_expression is not None:
        s.cron_expression = req.cron_expression[:100]
    if req.status is not None:
        s.status = ScheduleStatus(req.status)

    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="schedule.update", resource_type="schedule", resource_id=schedule_id,
        details=f"Updated schedule '{s.name}'",
        ip_address=get_client_ip(request),
    ))
    db.commit()
    db.refresh(s)
    return schedule_to_dict(s)

@router.delete("/{schedule_id}")
async def delete_schedule(
    schedule_id: str,
    request: Request,
    user: User = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
):
    m = get_member(db, user.id)
    s = db.query(Schedule).filter(Schedule.id == schedule_id, Schedule.org_id == m.org_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")

    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="schedule.delete", resource_type="schedule", resource_id=schedule_id,
        details=f"Deleted schedule '{s.name}'",
        ip_address=get_client_ip(request),
    ))
    db.delete(s)
    db.commit()
    return {"success": True}

@router.post("/pause-all")
async def pause_all_schedules(
    request: Request,
    user: User = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
):
    m = get_member(db, user.id)
    db.query(Schedule).filter(Schedule.org_id == m.org_id).update({"status": ScheduleStatus.PAUSED})
    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="schedule.pause_all", resource_type="schedule", resource_id=None,
        details="Paused all schedules",
        ip_address=get_client_ip(request),
    ))
    db.commit()
    return {"success": True}
