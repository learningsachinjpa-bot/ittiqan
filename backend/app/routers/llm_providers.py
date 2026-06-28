import logging
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user, encrypt_secret, decrypt_secret, require_role, get_client_ip
from app.core.ssrf import validate_url
from app.models.user import User
from app.models.llm_provider import LLMProvider, ProviderType
from app.models.organization import OrgMember, AuditLog
from app.services.llm_judge import LLMJudge

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/llm-providers", tags=["llm-providers"])

_ADMIN_ROLES = ("owner", "admin")
_WRITE_ROLES = ("owner", "admin", "developer")

class ProviderCreate(BaseModel):
    name: str
    provider_type: str
    model_name: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    extra_config: dict = {}
    is_default_judge: bool = False
    is_default_attacker: bool = False

class ProviderUpdate(BaseModel):
    name: Optional[str] = None
    model_name: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    is_active: Optional[bool] = None
    is_default_judge: Optional[bool] = None
    is_default_attacker: Optional[bool] = None

SUPPORTED_MODELS = {
    "anthropic": ["claude-opus-4-5-20251101", "claude-sonnet-4-5-20251001", "claude-haiku-4-5-20251001", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo", "o1-preview", "o1-mini"],
    "gemini": ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.5-flash-8b"],
    "mistral": ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest", "open-mixtral-8x7b"],
    "groq": ["llama-3.3-70b-versatile", "llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
    "ollama": ["llama3.3", "llama3.2", "llama3.1", "mistral", "gemma2", "phi4", "qwen2.5", "deepseek-r1"],
    "azure_openai": ["gpt-4o", "gpt-4", "gpt-35-turbo"],
    "custom": [],
}

def get_user_org_member(db: Session, user_id: str) -> OrgMember:
    m = db.query(OrgMember).filter(OrgMember.user_id == user_id).first()
    if not m:
        raise HTTPException(status_code=403, detail="User has no organization")
    return m

def provider_to_dict(p: LLMProvider) -> dict:
    return {
        "id": p.id, "name": p.name, "provider_type": p.provider_type, "model_name": p.model_name,
        "has_api_key": bool(p.api_key_encrypted), "base_url": p.base_url,
        "is_active": p.is_active, "is_default_judge": p.is_default_judge,
        "is_default_attacker": p.is_default_attacker,
        "total_calls": p.total_calls, "total_tokens_used": p.total_tokens_used,
        "total_cost_usd": p.total_cost_usd,
        "last_used_at": p.last_used_at.isoformat() if p.last_used_at else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }

def _validate_base_url(provider_type: str, base_url: Optional[str]) -> None:
    """CRIT-4: Validate base_url to prevent SSRF. Ollama allows http://localhost only."""
    if not base_url:
        return
    is_ollama = provider_type == "ollama"
    validate_url(base_url, allow_http_localhost=is_ollama)

@router.get("/models")
async def get_supported_models():
    return SUPPORTED_MODELS

@router.get("")
async def list_providers(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = get_user_org_member(db, user.id)
    providers = db.query(LLMProvider).filter(LLMProvider.org_id == m.org_id).all()
    return [provider_to_dict(p) for p in providers]

@router.post("")
async def create_provider(
    request: Request,
    req: ProviderCreate,
    user: User = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
):
    m = get_user_org_member(db, user.id)
    _validate_base_url(req.provider_type, req.base_url)

    if req.is_default_judge:
        db.query(LLMProvider).filter(LLMProvider.org_id == m.org_id, LLMProvider.is_default_judge == True).update({"is_default_judge": False})
    if req.is_default_attacker:
        db.query(LLMProvider).filter(LLMProvider.org_id == m.org_id, LLMProvider.is_default_attacker == True).update({"is_default_attacker": False})

    provider = LLMProvider(
        org_id=m.org_id, name=req.name, provider_type=ProviderType(req.provider_type),
        model_name=req.model_name,
        api_key_encrypted=encrypt_secret(req.api_key) if req.api_key else None,
        base_url=req.base_url, extra_config=req.extra_config,
        is_default_judge=req.is_default_judge, is_default_attacker=req.is_default_attacker,
        created_by=user.id,
    )
    db.add(provider)
    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="llm_provider.create", resource_type="llm_provider", resource_id=provider.id,
        details=f"Added provider: {req.name} ({req.provider_type}/{req.model_name})",
        ip_address=get_client_ip(request),
    ))
    db.commit()
    db.refresh(provider)
    return provider_to_dict(provider)

@router.post("/{provider_id}/test")
async def test_provider(provider_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = get_user_org_member(db, user.id)
    p = db.query(LLMProvider).filter(LLMProvider.id == provider_id, LLMProvider.org_id == m.org_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Provider not found")
    if not p.api_key_encrypted:
        raise HTTPException(status_code=400, detail="No API key configured")
    # Re-validate base_url in case it was stored before SSRF protection was added
    _validate_base_url(p.provider_type.value, p.base_url)
    api_key = decrypt_secret(p.api_key_encrypted)
    judge = LLMJudge(provider=p.provider_type.value, model=p.model_name, api_key=api_key, base_url=p.base_url)
    try:
        response = await judge.complete("You are a helpful assistant.", "Say 'Connection successful!' in exactly 3 words.")
        return {"success": True, "response": response, "provider": p.provider_type, "model": p.model_name}
    except Exception as e:
        logger.warning("Provider test failed provider_id=%s: %s", provider_id, e)
        return {"success": False, "error": str(e)}

@router.put("/{provider_id}")
async def update_provider(
    provider_id: str,
    request: Request,
    req: ProviderUpdate,
    user: User = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
):
    m = get_user_org_member(db, user.id)
    p = db.query(LLMProvider).filter(LLMProvider.id == provider_id, LLMProvider.org_id == m.org_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Provider not found")

    if req.base_url is not None:
        _validate_base_url(p.provider_type.value, req.base_url)

    changed_fields = []
    for field, value in req.model_dump(exclude_none=True).items():
        if field == "api_key":
            p.api_key_encrypted = encrypt_secret(value) if value else None
            changed_fields.append("api_key")
        else:
            setattr(p, field, value)
            changed_fields.append(field)

    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="llm_provider.update", resource_type="llm_provider", resource_id=provider_id,
        details=f"Updated fields: {', '.join(changed_fields)}",
        ip_address=get_client_ip(request),
    ))
    db.commit()
    db.refresh(p)
    return provider_to_dict(p)

@router.delete("/{provider_id}")
async def delete_provider(
    provider_id: str,
    request: Request,
    user: User = Depends(require_role(*_ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    m = get_user_org_member(db, user.id)
    p = db.query(LLMProvider).filter(LLMProvider.id == provider_id, LLMProvider.org_id == m.org_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Provider not found")
    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="llm_provider.delete", resource_type="llm_provider", resource_id=provider_id,
        details=f"Deleted provider: {p.name}",
        ip_address=get_client_ip(request),
    ))
    db.delete(p)
    db.commit()
    return {"success": True}
