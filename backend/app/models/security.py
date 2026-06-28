import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, JSON, Integer, Float, Enum as SAEnum
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class SecurityFramework(str, enum.Enum):
    OWASP_LLM = "owasp_llm"
    OWASP_AGENTS = "owasp_agents"
    NIST_AI_RMF = "nist_ai_rmf"
    MITRE_ATLAS = "mitre_atlas"
    CUSTOM = "custom"

class AssessmentStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class VulnerabilitySeverity(str, enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"

class SecurityAssessment(Base):
    __tablename__ = "security_assessments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False)
    name = Column(String(200), nullable=False)
    framework = Column(SAEnum(SecurityFramework), nullable=False)
    status = Column(SAEnum(AssessmentStatus), default=AssessmentStatus.PENDING)

    # Configuration
    attack_categories = Column(JSON, default=list)  # selected vuln categories
    num_attacks_per_category = Column(Integer, default=5)
    llm_attacker_provider = Column(String(50), default="openai")
    llm_attacker_model = Column(String(100), default="gpt-4o")
    llm_judge_provider = Column(String(50), default="anthropic")
    llm_judge_model = Column(String(100), default="claude-opus-4-5")

    # Progress
    total_attacks = Column(Integer, default=0)
    completed_attacks = Column(Integer, default=0)

    # Results
    overall_score = Column(Float, nullable=True)
    critical_count = Column(Integer, default=0)
    high_count = Column(Integer, default=0)
    medium_count = Column(Integer, default=0)
    low_count = Column(Integer, default=0)
    passed_count = Column(Integer, default=0)
    vulnerability_summary = Column(JSON, default=dict)
    error_message = Column(Text, nullable=True)

    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    agent = relationship("Agent", back_populates="security_assessments")
    findings = relationship("SecurityFinding", back_populates="assessment")

class SecurityFinding(Base):
    __tablename__ = "security_findings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id = Column(String, ForeignKey("security_assessments.id"), nullable=False)
    vulnerability_type = Column(String(200), nullable=False)
    category = Column(String(100), nullable=False)
    severity = Column(SAEnum(VulnerabilitySeverity), nullable=False)

    attack_prompt = Column(Text, nullable=False)
    agent_response = Column(Text, nullable=True)
    is_vulnerable = Column(Boolean, nullable=False)
    confidence_score = Column(Float, nullable=True)
    reason = Column(Text, nullable=True)
    remediation = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    assessment = relationship("SecurityAssessment", back_populates="findings")
