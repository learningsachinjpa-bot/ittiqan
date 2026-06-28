"""
Approval notification service.
Phase 1: email (logged/stubbed) + webhook to callback_url.
Phase 2: WhatsApp, Teams — not yet.
"""
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.approval import ApprovalRequest
from app.models.organization import Organization, OrgMember
from app.models.user import User

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
        members = db.query(OrgMember).filter(
            OrgMember.org_id == org.id,
        ).all()

        admin_user_ids = [
            m.user_id for m in members
            if m.role.value in ("owner", "admin")
        ]

        if not admin_user_ids:
            return

        users = db.query(User).filter(User.id.in_(admin_user_ids)).all()
        emoji = URGENCY_EMOJI.get(req.urgency.value if req.urgency else "normal", "🟡")

        for u in users:
            # Phase 1: log only (SMTP not configured)
            # Phase 2: send via SendGrid/SES — swap log for actual send
            logger.info(
                "APPROVAL NOTIFICATION → %s <%s> | %s [%s] %s | expires %s",
                u.name, u.email,
                emoji,
                req.urgency.value if req.urgency else "normal",
                req.action_title,
                req.expires_at.isoformat() if req.expires_at else "never",
            )

    except Exception as exc:
        logger.error("approval_notifier.notify_new_request failed: %s", exc)
