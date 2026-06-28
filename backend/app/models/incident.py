import enum
import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Enum as SAEnum, ForeignKey
from app.core.database import Base


class IncidentSeverity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class IncidentStatus(str, enum.Enum):
    OPEN = "open"
    INVESTIGATING = "investigating"
    RESOLVED = "resolved"


class Incident(Base):
    __tablename__ = "incidents"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=True)
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    severity = Column(SAEnum(IncidentSeverity), default=IncidentSeverity.MEDIUM)
    status = Column(SAEnum(IncidentStatus), default=IncidentStatus.OPEN)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
