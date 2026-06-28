import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, JSON, Enum as SAEnum, Float, Integer
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class AgentStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    DEGRADED = "degraded"

class HTTPMethod(str, enum.Enum):
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"

class Agent(Base):
    __tablename__ = "agents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    tags = Column(JSON, default=list)
    status = Column(SAEnum(AgentStatus), default=AgentStatus.ACTIVE)

    # API Configuration (endpoint encrypted at rest)
    endpoint_url = Column(Text, nullable=True)
    http_method = Column(SAEnum(HTTPMethod), default=HTTPMethod.POST)
    headers = Column(JSON, default=dict)
    payload_template = Column(Text, nullable=True)
    response_path = Column(String(200), nullable=True)
    api_key_encrypted = Column(Text, nullable=True)

    # Evaluation settings
    enable_multi_turn = Column(Boolean, default=False)
    enable_trace_metrics = Column(Boolean, default=False)
    metrics_config = Column(JSON, default=dict)
    default_metrics = Column(JSON, default=list)
    llm_judge_provider = Column(String(50), default="anthropic")
    llm_judge_model = Column(String(100), default="claude-opus-4-5")
    llm_judge_provider_id = Column(String, ForeignKey("llm_providers.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_evaluated_at = Column(DateTime, nullable=True)

    organization = relationship("Organization", back_populates="agents")
    evaluations = relationship("Evaluation", back_populates="agent")
    security_assessments = relationship("SecurityAssessment", back_populates="agent")
    traces = relationship("Trace", back_populates="agent")
