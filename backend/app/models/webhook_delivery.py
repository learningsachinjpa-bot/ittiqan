import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, JSON, ForeignKey
from app.core.database import Base


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    alert_id = Column(String, ForeignKey("alerts.id", ondelete="CASCADE"), nullable=True, index=True)
    url = Column(String(2048), nullable=False)
    payload = Column(JSON, nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # success | failed
    http_status = Column(Integer, nullable=True)
    response_body = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    is_test = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
