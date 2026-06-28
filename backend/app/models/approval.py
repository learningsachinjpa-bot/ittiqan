import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, ForeignKey, JSON, Enum as SAEnum
from app.core.database import Base


class ApprovalStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class ApprovalUrgency(str, enum.Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


class ApprovalRequest(Base):
    __tablename__ = "approval_requests"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=True)

    # What the agent wants to do
    action_type = Column(String(100), nullable=False)
    action_title = Column(String(300), nullable=False)
    action_description = Column(Text, nullable=True)
    action_payload = Column(JSON, nullable=True)  # Full data, stored for audit

    urgency = Column(SAEnum(ApprovalUrgency), default=ApprovalUrgency.NORMAL)

    # Status
    status = Column(SAEnum(ApprovalStatus), default=ApprovalStatus.PENDING, index=True)

    # Decision
    reviewed_by = Column(String, ForeignKey("users.id"), nullable=True)
    review_note = Column(Text, nullable=True)

    # Agent webhook — we POST decision here so agent doesn't have to poll
    callback_url = Column(String(500), nullable=True)

    # Timing
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    expires_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
