from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import asyncio

from app.core.database import get_db, SessionLocal
from app.core.security import get_current_user, decrypt_secret, ws_get_current_user
from app.models.user import User
from app.models.security import SecurityAssessment, SecurityFinding, SecurityFramework, AssessmentStatus, VulnerabilitySeverity
from app.models.agent import Agent
from app.models.llm_provider import LLMProvider
from app.models.organization import OrgMember, AuditLog
from app.services.red_team_engine import run_security_assessment, ATTACK_TEMPLATES

router = APIRouter(prefix="/security", tags=["security"])

class AssessmentCreate(BaseModel):
    agent_id: str
    name: str
    framework: str
    attack_categories: List[str] = []
    num_attacks_per_category: int = 5  # MED-2: enforced le=50 below
    llm_attacker_provider_id: Optional[str] = None
    llm_judge_provider_id: Optional[str] = None

    @property
    def safe_num_attacks(self) -> int:
        return max(1, min(self.num_attacks_per_category, 50))

def get_user_org_id(db, user_id):
    m = db.query(OrgMember).filter(OrgMember.user_id == user_id).first()
    if not m:
        raise HTTPException(status_code=403, detail="No organization")
    return m.org_id

def _action_for_error(error: str) -> str:
    e = error.lower()
    if "api key" in e or "401" in e or "unauthorized" in e:
        return "Your LLM attacker/judge API key is invalid or expired. Go to LLM Providers and update the key."
    if "429" in e or "rate limit" in e or "quota" in e:
        return "LLM rate limit hit. Wait 60 seconds and retry, or switch to a different provider."
    if "timeout" in e or "timed out" in e:
        return "Agent endpoint timed out. Check it is reachable, then retry."
    return "Assessment failed. Check the agent endpoint is reachable and the LLM provider key is valid, then retry."

def assessment_to_dict(a: SecurityAssessment) -> dict:
    failed_attacks = (a.total_attacks or 0) - (a.passed_count or 0)
    return {
        "id": a.id, "name": a.name, "agent_id": a.agent_id, "framework": a.framework,
        "status": a.status,
        "attack_categories": a.attack_categories or [],
        "attack_types": a.attack_categories or [],
        "total_attacks": a.total_attacks, "completed_attacks": a.completed_attacks,
        "passed_attacks": a.passed_count,
        "failed_attacks": max(0, failed_attacks),
        "overall_score": a.overall_score,
        "overall_risk_score": a.overall_score,
        "risk_score": a.overall_score,
        "vulnerable_count": max(0, failed_attacks),
        "critical_count": a.critical_count,
        "high_count": a.high_count, "medium_count": a.medium_count,
        "low_count": a.low_count, "passed_count": a.passed_count,
        "vulnerability_summary": a.vulnerability_summary or {},
        "error_message": a.error_message,
        "error_action": _action_for_error(a.error_message) if a.error_message else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "completed_at": a.completed_at.isoformat() if a.completed_at else None,
    }

active_ws_connections: dict[str, list[WebSocket]] = {}

@router.get("/frameworks")
async def list_frameworks():
    result = {}
    for fw, categories in ATTACK_TEMPLATES.items():
        result[fw] = {
            "categories": list(categories.keys()),
            "total_categories": len(categories),
            "severities": list(set(v["severity"] for v in categories.values()))
        }
    return result

@router.get("")
async def list_assessments(agent_id: Optional[str] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org_id = get_user_org_id(db, user.id)
    q = db.query(SecurityAssessment).filter(SecurityAssessment.org_id == org_id)
    if agent_id:
        q = q.filter(SecurityAssessment.agent_id == agent_id)
    return [assessment_to_dict(a) for a in q.order_by(SecurityAssessment.created_at.desc()).all()]

@router.post("")
async def create_assessment(req: AssessmentCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org_id = get_user_org_id(db, user.id)
    agent = db.query(Agent).filter(Agent.id == req.agent_id, Agent.org_id == org_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    def get_judge_config(provider_id):
        if provider_id:
            p = db.query(LLMProvider).filter(LLMProvider.id == provider_id, LLMProvider.org_id == org_id).first()
            if p and p.api_key_encrypted:
                return {"provider": p.provider_type.value, "model": p.model_name, "api_key": decrypt_secret(p.api_key_encrypted)}
        default = db.query(LLMProvider).filter(LLMProvider.org_id == org_id, LLMProvider.is_default_judge == True, LLMProvider.is_active == True).first()
        if default and default.api_key_encrypted:
            return {"provider": default.provider_type.value, "model": default.model_name, "api_key": decrypt_secret(default.api_key_encrypted)}
        return None

    judge_config = get_judge_config(req.llm_judge_provider_id)
    attacker_config = get_judge_config(req.llm_attacker_provider_id) or judge_config
    if not judge_config:
        raise HTTPException(status_code=400, detail="No LLM provider configured. Add an LLM provider first.")

    fw_attacks = ATTACK_TEMPLATES.get(req.framework, {})
    total_attacks = sum(min(len(v["attack_prompts"]), req.num_attacks_per_category) for v in fw_attacks.values() if not req.attack_categories or any(cat in k for k, _ in [(name, _) for name in fw_attacks]))

    assessment = SecurityAssessment(
        org_id=org_id, agent_id=req.agent_id, name=req.name,
        framework=SecurityFramework(req.framework),
        attack_categories=req.attack_categories,
        num_attacks_per_category=req.num_attacks_per_category,
        total_attacks=total_attacks, status=AssessmentStatus.PENDING,
        created_by=user.id,
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)

    agent_config = {
        "endpoint_url": agent.endpoint_url, "http_method": agent.http_method.value if agent.http_method else "POST",
        "headers": dict(agent.headers or {}), "payload_template": agent.payload_template or '{"input": "{{input}}"}',
        "response_path": agent.response_path, "description": agent.description or "",
    }
    if agent.api_key_encrypted:
        agent_config["headers"]["Authorization"] = f"Bearer {decrypt_secret(agent.api_key_encrypted)}"

    asyncio.create_task(_run_assessment_task(assessment.id, agent_config, req.framework, req.attack_categories, req.num_attacks_per_category, attacker_config, judge_config))
    return assessment_to_dict(assessment)

async def _run_assessment_task(assessment_id, agent_config, framework, attack_categories, num_per_category, attacker_config, judge_config):
    db = SessionLocal()
    try:
        a = db.query(SecurityAssessment).filter(SecurityAssessment.id == assessment_id).first()
        a.status = AssessmentStatus.RUNNING
        a.started_at = datetime.utcnow()
        db.commit()

        async def progress_cb(done, total, finding):
            db2 = SessionLocal()
            try:
                assessment = db2.query(SecurityAssessment).filter(SecurityAssessment.id == assessment_id).first()
                assessment.completed_attacks = done
                f = SecurityFinding(
                    assessment_id=assessment_id,
                    vulnerability_type=finding["vulnerability_type"],
                    category=finding["category"],
                    severity=VulnerabilitySeverity(finding["severity"]) if finding["severity"] in [s.value for s in VulnerabilitySeverity] else VulnerabilitySeverity.INFO,
                    attack_prompt=finding["attack_prompt"],
                    agent_response=finding.get("agent_response", ""),
                    is_vulnerable=finding["is_vulnerable"],
                    confidence_score=finding.get("confidence_score"),
                    reason=finding.get("reason", ""),
                    remediation=finding.get("remediation", ""),
                )
                db2.add(f)
                db2.commit()
                for ws in active_ws_connections.get(assessment_id, []):
                    try:
                        await ws.send_json({"type": "progress", "done": done, "finding": finding})
                    except Exception:
                        pass
            finally:
                db2.close()

        results = await run_security_assessment(assessment_id, agent_config, framework, attack_categories, num_per_category, attacker_config, judge_config, progress_cb)

        a = db.query(SecurityAssessment).filter(SecurityAssessment.id == assessment_id).first()
        a.status = AssessmentStatus.COMPLETED
        a.completed_at = datetime.utcnow()
        a.overall_score = results["overall_score"]
        a.critical_count = results["critical_count"]
        a.high_count = results["high_count"]
        a.medium_count = results["medium_count"]
        a.low_count = results["low_count"]
        a.passed_count = results["passed_count"]
        a.total_attacks = results["total_attacks"]
        a.vulnerability_summary = results["vulnerability_summary"]
        db.commit()

        for ws in active_ws_connections.get(assessment_id, []):
            try:
                await ws.send_json({"type": "completed", "results": results})
            except Exception:
                pass
    except Exception as e:
        a = db.query(SecurityAssessment).filter(SecurityAssessment.id == assessment_id).first()
        if a:
            a.status = AssessmentStatus.FAILED
            a.error_message = str(e)
            db.commit()
    finally:
        db.close()

@router.get("/{assessment_id}")
async def get_assessment(assessment_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org_id = get_user_org_id(db, user.id)
    a = db.query(SecurityAssessment).filter(SecurityAssessment.id == assessment_id, SecurityAssessment.org_id == org_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return assessment_to_dict(a)

@router.get("/{assessment_id}/findings")
async def get_findings(assessment_id: str, is_vulnerable: Optional[bool] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org_id = get_user_org_id(db, user.id)
    a = db.query(SecurityAssessment).filter(SecurityAssessment.id == assessment_id, SecurityAssessment.org_id == org_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")
    q = db.query(SecurityFinding).filter(SecurityFinding.assessment_id == assessment_id)
    if is_vulnerable is not None:
        q = q.filter(SecurityFinding.is_vulnerable == is_vulnerable)
    findings = q.all()
    return [{"id": f.id, "vulnerability_type": f.vulnerability_type, "category": f.category, "severity": f.severity, "attack_prompt": f.attack_prompt, "agent_response": f.agent_response, "is_vulnerable": f.is_vulnerable, "confidence_score": f.confidence_score, "reason": f.reason, "remediation": f.remediation} for f in findings]

@router.websocket("/{assessment_id}/ws")
async def assessment_websocket(assessment_id: str, websocket: WebSocket, token: str = ""):
    # CRIT-6: authenticate WS before accepting
    db = SessionLocal()
    try:
        user = await ws_get_current_user(token, db)
        org_id = get_user_org_id(db, user.id)
        a = db.query(SecurityAssessment).filter(SecurityAssessment.id == assessment_id, SecurityAssessment.org_id == org_id).first()
        if not a:
            await websocket.close(code=4004)
            return
    except Exception:
        await websocket.close(code=4001)
        return
    finally:
        db.close()

    await websocket.accept()
    if assessment_id not in active_ws_connections:
        active_ws_connections[assessment_id] = []
    active_ws_connections[assessment_id].append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_ws_connections.get(assessment_id, []):
            active_ws_connections[assessment_id].remove(websocket)
