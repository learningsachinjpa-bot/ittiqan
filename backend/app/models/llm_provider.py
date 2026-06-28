import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, JSON, Float, Integer, Enum as SAEnum
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class ProviderType(str, enum.Enum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    GEMINI = "gemini"
    MISTRAL = "mistral"
    GROQ = "groq"
    OLLAMA = "ollama"
    AZURE_OPENAI = "azure_openai"
    CUSTOM = "custom"

class LLMProvider(Base):
    __tablename__ = "llm_providers"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    name = Column(String(200), nullable=False)
    provider_type = Column(SAEnum(ProviderType), nullable=False)
    model_name = Column(String(200), nullable=False)
    api_key_encrypted = Column(Text, nullable=True)
    base_url = Column(Text, nullable=True)
    extra_config = Column(JSON, default=dict)
    is_active = Column(Boolean, default=True)
    is_default_judge = Column(Boolean, default=False)
    is_default_attacker = Column(Boolean, default=False)

    # Usage tracking
    total_tokens_used = Column(Integer, default=0)
    total_cost_usd = Column(Float, default=0.0)
    total_calls = Column(Integer, default=0)

    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)

    organization = relationship("Organization", back_populates="llm_providers")
