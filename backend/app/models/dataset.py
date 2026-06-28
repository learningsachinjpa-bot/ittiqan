import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, JSON, Integer, Float
from sqlalchemy.orm import relationship
from app.core.database import Base

class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    file_format = Column(String(10), nullable=True)  # csv, json, jsonl
    row_count = Column(Integer, default=0)
    version = Column(Integer, default=1)            # bumped on every test case add/remove (ARCH-01)
    columns = Column(JSON, default=list)
    sample_rows = Column(JSON, default=list)
    storage_path = Column(Text, nullable=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship("Organization", back_populates="datasets")
    test_cases = relationship("TestCase", back_populates="dataset")

class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False)
    input = Column(Text, nullable=False)
    expected_output = Column(Text, nullable=True)
    context = Column(JSON, nullable=True)
    retrieval_context = Column(JSON, nullable=True)
    extra_data = Column(JSON, default=dict)

    dataset = relationship("Dataset", back_populates="test_cases")
    results = relationship("EvaluationResult", back_populates="test_case")
