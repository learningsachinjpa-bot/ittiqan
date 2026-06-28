import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, JSON, Integer, Float, Enum as SAEnum
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class EvaluationStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"        # agent calls in progress
    JUDGE_RUNNING = "judge_running"  # scoring metrics with LLM judge
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class Evaluation(Base):
    __tablename__ = "evaluations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=True)
    name = Column(String(200), nullable=False)
    status = Column(SAEnum(EvaluationStatus), default=EvaluationStatus.PENDING)

    # Configuration
    metrics = Column(JSON, default=list)  # list of metric names to run
    llm_judge_provider = Column(String(50), nullable=True)
    llm_judge_model = Column(String(100), nullable=True)
    llm_judge_api_key_encrypted = Column(Text, nullable=True)

    # Progress
    total_cases = Column(Integer, default=0)
    completed_cases = Column(Integer, default=0)
    failed_cases = Column(Integer, default=0)

    # Immutable snapshot at run time (ARCH-01, EVAL-07)
    agent_endpoint_snapshot = Column(Text, nullable=True)   # agent endpoint URL at time of run
    dataset_version = Column(Integer, nullable=True)         # dataset.version at time of run
    judge_provider_id = Column(String, nullable=True)        # LLMProvider.id used as judge
    judge_prompt_version = Column(Integer, default=1)        # version of metric prompt templates used

    # Results summary
    overall_score = Column(Float, nullable=True)
    metric_scores = Column(JSON, default=dict)
    passed_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)

    # Scheduling
    is_scheduled = Column(Boolean, default=False)
    schedule_cron = Column(String(100), nullable=True)

    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    agent = relationship("Agent", back_populates="evaluations")
    results = relationship("EvaluationResult", back_populates="evaluation")

class EvaluationResult(Base):
    __tablename__ = "evaluation_results"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    evaluation_id = Column(String, ForeignKey("evaluations.id"), nullable=False)
    test_case_id = Column(String, ForeignKey("test_cases.id"), nullable=True)

    input = Column(Text, nullable=False)
    actual_output = Column(Text, nullable=True)
    expected_output = Column(Text, nullable=True)
    context = Column(JSON, nullable=True)
    retrieval_context = Column(JSON, nullable=True)

    # {metric_name: {score, passed, reason, failure_taxonomy: [], failure_attribution: str}}
    metric_results = Column(JSON, default=dict)
    overall_passed = Column(Boolean, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    cost_usd = Column(Float, nullable=True)         # cost for this single test case
    tokens_used = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)
    error_action = Column(Text, nullable=True)      # user-actionable guidance (UX-06)
    created_at = Column(DateTime, default=datetime.utcnow)

    evaluation = relationship("Evaluation", back_populates="results")
    test_case = relationship("TestCase", back_populates="results")
