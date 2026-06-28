import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, Enum as SAEnum, Integer
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class PlanType(str, enum.Enum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"

class OrgMemberRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    DEVELOPER = "developer"
    QA = "qa"
    VIEWER = "viewer"

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(200), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    plan = Column(SAEnum(PlanType), default=PlanType.FREE)
    department = Column(String(100), nullable=True)
    use_case = Column(Text, nullable=True)
    region = Column(String(10), nullable=False, default="uae")  # uae | eu | us — drives data residency policy
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # API key for agent-to-Ittiqan calls (approval gateway auth)
    api_key = Column(String(64), nullable=True, unique=True, index=True)
    api_key_created_at = Column(DateTime, nullable=True)

    # Limits based on plan
    max_agents = Column(Integer, default=3)
    max_evaluations_per_month = Column(Integer, default=100)
    max_datasets = Column(Integer, default=5)

    members = relationship("OrgMember", back_populates="organization")
    agents = relationship("Agent", back_populates="organization")
    datasets = relationship("Dataset", back_populates="organization")
    llm_providers = relationship("LLMProvider", back_populates="organization")
    audit_logs = relationship("AuditLog", back_populates="organization")

class OrgMember(Base):
    __tablename__ = "org_members"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    role = Column(SAEnum(OrgMemberRole), default=OrgMemberRole.DEVELOPER)
    invited_by = Column(String, ForeignKey("users.id"), nullable=True)
    joined_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="members", foreign_keys=[org_id])
    user = relationship("User", foreign_keys=[user_id], back_populates="org_memberships")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    action = Column(String(100), nullable=False)
    resource_type = Column(String(50), nullable=False)
    resource_id = Column(String, nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="audit_logs")
    user = relationship("User", back_populates="audit_logs")
