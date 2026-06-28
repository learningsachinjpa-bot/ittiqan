import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class ScheduleStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"

class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=True)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=True)
    llm_judge_provider_id = Column(String, ForeignKey("llm_providers.id"), nullable=True)
    name = Column(String(200), nullable=False)
    cron_expression = Column(String(100), nullable=False)
    status = Column(SAEnum(ScheduleStatus), default=ScheduleStatus.ACTIVE)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_run_at = Column(DateTime, nullable=True)
