"""
Approval notification service.
Sends email to all org owners/admins when a new approval request arrives.
Gracefully skips email if SMTP is not configured.
"""
import logging

from sqlalchemy.orm import Session

from app.models.approval import ApprovalRequest
from app.models.organization import Organization, OrgMember
from app.models.user import User
from app.core.config import settings

logger = logging.getLogger(__name__)

URGENCY_EMOJI = {
    "critical": "🔴",
    "high": "🟠",
    "normal": "🟡",
    "low": "⚪",
}


async def notify_new_request(req: ApprovalRequest, org: Organization, db: Session) -> None:
    """Notify all org admins/owners that a new approval request is waiting."""
    try:
        from app.services.email_service import send_email, _approval_html

        members = db.query(OrgMember).filter(OrgMember.org_id == org.id).all()
        admin_user_ids = [
            m.user_id for m in members
            if m.role.value in ("owner", "admin")
        ]
        if not admin_user_ids:
            return

        users = db.query(User).filter(User.id.in_(admin_user_ids)).all()
        urgency = req.urgency.value if req.urgency else "normal"
        emoji = URGENCY_EMOJI.get(urgency, "🟡")
        queue_url = f"{settings.FRONTEND_URL}/dashboard/approvals"
        expires = req.expires_at.isoformat() if req.expires_at else None

        html, plain = _approval_html(
            action_title=req.action_title,
            action_type=req.action_type,
            urgency=urgency,
            description=req.action_description,
            queue_url=queue_url,
            expires=expires,
        )
        subject = f"{emoji} Approval Required [{urgency.upper()}]: {req.action_title}"

        for u in users:
            if settings.email_enabled:
                await send_email(to=u.email, subject=subject, html=html, text=plain)
            else:
                logger.info(
                    "APPROVAL NOTIFICATION (email not configured) → %s <%s> | %s",
                    u.name, u.email, req.action_title,
                )

    except Exception as exc:
        logger.error("approval_notifier.notify_new_request failed: %s", exc)
