import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
from typing import Optional, List
import httpx

from app.core.database import get_db
from app.core.security import get_current_user, encrypt_secret, decrypt_secret, require_role, get_client_ip
from app.core.ssrf import validate_url
from app.models.user import User
from app.models.agent import Agent, AgentStatus, HTTPMethod
from app.models.organization import OrgMember, AuditLog

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agents", tags=["agents"])

_ADMIN_ROLES = ("owner", "admin")
_WRITE_ROLES = ("owner", "admin", "developer")

class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    tags: List[str] = []
    endpoint_url: Optional[str] = None
    http_method: str = "POST"
    headers: dict = {}
    payload_template: Optional[str] = '{"input": "{{input}}"}'
    response_path: Optional[str] = None
    api_key: Optional[str] = None
    enable_multi_turn: bool = False
    enable_trace_metrics: bool = False
    metrics_config: dict = {}
    default_metrics: List[str] = []
    llm_judge_provider: str = "anthropic"
    llm_judge_model: str = "claude-opus-4-5"
    llm_judge_provider_id: Optional[str] = None

    @field_validator("name")
    @classmethod
    def name_length(cls, v: str) -> str:
        if not v or len(v.strip()) > 200:
            raise ValueError("Name must be 1–200 characters")
        return v.strip()

class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    endpoint_url: Optional[str] = None
    http_method: Optional[str] = None
    headers: Optional[dict] = None
    payload_template: Optional[str] = None
    response_path: Optional[str] = None
    api_key: Optional[str] = None
    status: Optional[str] = None
    metrics_config: Optional[dict] = None
    default_metrics: Optional[List[str]] = None
    llm_judge_provider: Optional[str] = None
    llm_judge_model: Optional[str] = None
    llm_judge_provider_id: Optional[str] = None

def get_user_org_member(db: Session, user_id: str) -> OrgMember:
    m = db.query(OrgMember).filter(OrgMember.user_id == user_id).first()
    if not m:
        raise HTTPException(status_code=403, detail="User has no organization")
    return m

def agent_to_dict(a: Agent) -> dict:
    return {
        "id": a.id, "org_id": a.org_id, "name": a.name, "description": a.description,
        "tags": a.tags or [], "status": a.status,
        "endpoint_url": a.endpoint_url, "http_method": a.http_method,
        "headers": a.headers or {}, "payload_template": a.payload_template,
        "response_path": a.response_path, "has_api_key": bool(a.api_key_encrypted),
        "enable_multi_turn": a.enable_multi_turn, "enable_trace_metrics": a.enable_trace_metrics,
        "metrics_config": a.metrics_config or {},
        "default_metrics": getattr(a, "default_metrics", None) or [],
        "llm_judge_provider": a.llm_judge_provider, "llm_judge_model": a.llm_judge_model,
        "llm_judge_provider_id": getattr(a, "llm_judge_provider_id", None),
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "last_evaluated_at": a.last_evaluated_at.isoformat() if a.last_evaluated_at else None,
    }

@router.get("")
async def list_agents(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = get_user_org_member(db, user.id)
    agents = db.query(Agent).filter(Agent.org_id == m.org_id).all()
    return [agent_to_dict(a) for a in agents]

@router.post("")
async def create_agent(
    request: Request,
    req: AgentCreate,
    user: User = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
):
    m = get_user_org_member(db, user.id)
    # CRIT-3: SSRF validation on endpoint URL
    if req.endpoint_url:
        validate_url(req.endpoint_url)

    agent = Agent(
        org_id=m.org_id, name=req.name, description=req.description, tags=req.tags,
        endpoint_url=req.endpoint_url, http_method=HTTPMethod(req.http_method),
        headers=req.headers, payload_template=req.payload_template, response_path=req.response_path,
        api_key_encrypted=encrypt_secret(req.api_key) if req.api_key else None,
        enable_multi_turn=req.enable_multi_turn, enable_trace_metrics=req.enable_trace_metrics,
        metrics_config=req.metrics_config, default_metrics=req.default_metrics,
        llm_judge_provider=req.llm_judge_provider, llm_judge_model=req.llm_judge_model,
        llm_judge_provider_id=req.llm_judge_provider_id,
    )
    db.add(agent)
    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="agent.create", resource_type="agent", resource_id=agent.id,
        details=f"Connected agent: {req.name}",
        ip_address=get_client_ip(request),
    ))
    db.commit()
    db.refresh(agent)
    return agent_to_dict(agent)

@router.get("/{agent_id}")
async def get_agent(agent_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = get_user_org_member(db, user.id)
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.org_id == m.org_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent_to_dict(agent)

@router.put("/{agent_id}")
async def update_agent(
    agent_id: str,
    request: Request,
    req: AgentUpdate,
    user: User = Depends(require_role(*_WRITE_ROLES)),
    db: Session = Depends(get_db),
):
    m = get_user_org_member(db, user.id)
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.org_id == m.org_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    changed_fields = []
    for field, value in req.model_dump(exclude_none=True).items():
        if field == "endpoint_url":
            validate_url(value)  # SSRF check on update too
            agent.endpoint_url = value
            changed_fields.append("endpoint_url")
        elif field == "api_key":
            agent.api_key_encrypted = encrypt_secret(value) if value else None
            changed_fields.append("api_key")
        elif field == "http_method":
            agent.http_method = HTTPMethod(value)
            changed_fields.append("http_method")
        elif field == "status":
            agent.status = AgentStatus(value)
            changed_fields.append("status")
        else:
            setattr(agent, field, value)
            changed_fields.append(field)

    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="agent.update", resource_type="agent", resource_id=agent_id,
        details=f"Updated fields: {', '.join(changed_fields)}",
        ip_address=get_client_ip(request),
    ))
    db.commit()
    db.refresh(agent)
    return agent_to_dict(agent)

@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: str,
    request: Request,
    user: User = Depends(require_role(*_ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    m = get_user_org_member(db, user.id)
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.org_id == m.org_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    db.add(AuditLog(
        org_id=m.org_id, user_id=user.id,
        action="agent.delete", resource_type="agent", resource_id=agent_id,
        details=f"Deleted agent: {agent.name}",
        ip_address=get_client_ip(request),
    ))
    db.delete(agent)
    db.commit()
    return {"success": True}

@router.post("/{agent_id}/test-connection")
async def test_connection(
    agent_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    m = get_user_org_member(db, user.id)
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.org_id == m.org_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if not agent.endpoint_url:
        raise HTTPException(status_code=400, detail="Agent has no endpoint URL configured")

    # CRIT-3: SSRF validation before any outbound call
    validate_url(agent.endpoint_url)

    test_input = body.get("test_input", "Hello, this is a test message.")
    headers = dict(agent.headers or {})
    if agent.api_key_encrypted:
        headers["Authorization"] = f"Bearer {decrypt_secret(agent.api_key_encrypted)}"

    payload_template = agent.payload_template or '{"input": "{{input}}"}'
    # HIGH-7: escape test_input with json.dumps to prevent template injection
    safe_input = json.dumps(test_input)[1:-1]  # dumps adds quotes; strip them for string replacement
    payload_str = payload_template.replace("{{input}}", safe_input).replace("{{message}}", safe_input)
    try:
        payload = json.loads(payload_str)
    except Exception:
        payload = {"input": test_input}

    try:
        import time
        start = time.time()
        async with httpx.AsyncClient(timeout=15) as client:
            if agent.http_method == HTTPMethod.GET:
                resp = await client.get(agent.endpoint_url, headers=headers)
            else:
                resp = await client.request(str(agent.http_method.value), agent.endpoint_url, headers=headers, json=payload)
        latency_ms = int((time.time() - start) * 1000)
        try:
            data = resp.json()
            output = str(data)
            if agent.response_path:
                for key in agent.response_path.split("."):
                    if isinstance(data, dict):
                        data = data.get(key, "")
                output = str(data)
        except Exception:
            output = resp.text[:500]
        return {"success": resp.status_code < 400, "status_code": resp.status_code, "response": output, "latency_ms": latency_ms}
    except HTTPException:
        raise
    except httpx.ConnectError:
        return {"success": False, "error": f"Cannot connect to {agent.endpoint_url}. Check the URL is correct and the service is running.", "latency_ms": 0}
    except httpx.TimeoutException:
        return {"success": False, "error": "Request timed out after 15 seconds. Check that your endpoint is responding.", "latency_ms": 15000}
    except httpx.InvalidURL:
        return {"success": False, "error": f"Invalid URL format: {agent.endpoint_url}", "latency_ms": 0}
    except Exception as e:
        logger.warning("Agent test-connection failed agent_id=%s: %s", agent_id, e)
        return {"success": False, "error": str(e), "latency_ms": 0}
