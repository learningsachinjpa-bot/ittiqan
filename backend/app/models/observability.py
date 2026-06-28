import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, JSON, Integer, Float, Enum as SAEnum
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class TraceStatus(str, enum.Enum):
    SUCCESS = "success"
    ERROR = "error"
    TIMEOUT = "timeout"

class AlertSeverity(str, enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class Trace(Base):
    __tablename__ = "traces"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False)
    trace_id = Column(String, unique=True, index=True)
    status = Column(SAEnum(TraceStatus), default=TraceStatus.SUCCESS)

    input = Column(Text, nullable=True)
    output = Column(Text, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    tokens_input = Column(Integer, default=0)
    tokens_output = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)
    model_used = Column(String(100), nullable=True)
    spans = Column(JSON, default=list)  # tool calls, retrieval steps
    extra_data = Column(JSON, default=dict)
    error_message = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    agent = relationship("Agent", back_populates="traces")

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=True)
    name = Column(String(200), nullable=False)
    severity = Column(SAEnum(AlertSeverity), default=AlertSeverity.MEDIUM)
    condition_type = Column(String(50), nullable=False)  # score_drop, latency_spike, error_rate
    condition_threshold = Column(Float, nullable=False)
    notification_channels = Column(JSON, default=list)  # email, webhook, slack
    is_active = Column(Boolean, default=True)
    triggered_count = Column(Integer, default=0)
    last_triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
