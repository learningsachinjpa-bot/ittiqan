from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import StreamingResponse
import io
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import asyncio, json

from app.core.database import get_db, SessionLocal
from app.core.security import get_current_user, decrypt_secret, ws_get_current_user
from app.models.user import User
from app.models.evaluation import Evaluation, EvaluationResult, EvaluationStatus
from app.models.agent import Agent
from app.models.dataset import Dataset, TestCase
from app.models.llm_provider import LLMProvider
from app.models.organization import OrgMember, AuditLog
from app.services.evaluation_engine import run_evaluation, ALL_METRICS, JUDGE_PROMPT_VERSION

router = APIRouter(prefix="/evaluations", tags=["evaluations"])

class EvaluationCreate(BaseModel):
    agent_id: str
    dataset_id: str
    name: str
    metrics: List[str]
    llm_judge_provider_id: Optional[str] = None
    metric_thresholds: dict = {}

def get_user_org_id(db, user_id):
    m = db.query(OrgMember).filter(OrgMember.user_id == user_id).first()
    if not m:
        raise HTTPException(status_code=403, detail="No organization")
    return m.org_id

def eval_to_dict(e: Evaluation) -> dict:
    return {
        "id": e.id, "name": e.name, "agent_id": e.agent_id, "dataset_id": e.dataset_id,
        "status": e.status, "metrics": e.metrics or [],
        "total_cases": e.total_cases, "completed_cases": e.completed_cases,
        "overall_score": e.overall_score, "metric_scores": e.metric_scores or {},
        "passed_count": e.passed_count, "failed_count": e.failed_count,
        "error_message": e.error_message,
        "error_action": getattr(e, "error_action", None),
        "judge_prompt_version": getattr(e, "judge_prompt_version", None),
        "dataset_version": getattr(e, "dataset_version", None),
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "started_at": e.started_at.isoformat() if e.started_at else None,
        "completed_at": e.completed_at.isoformat() if e.completed_at else None,
    }

active_ws_connections: dict[str, list[WebSocket]] = {}

def _action_for_error(error: str) -> str:
    """Map raw error strings to user-actionable guidance. UX-06 / CODE-03."""
    e = error.lower()
    if "api key" in e or "401" in e or "unauthorized" in e:
        return "Your LLM judge API key is invalid or expired. Go to LLM Providers and update the key."
    if "429" in e or "rate limit" in e or "quota" in e:
        return "LLM judge rate limit hit. Wait 60 seconds and retry, or switch to a different provider."
    if "529" in e or "overloaded" in e:
        return "LLM provider is overloaded. Retry in a few minutes or use a different judge."
    if "timeout" in e or "timed out" in e:
        return "Agent or LLM judge timed out. Check your agent endpoint is reachable, then retry."
    if "no test cases" in e:
        return "Your dataset has no test cases. Upload test data before running an evaluation."
    if "no llm judge" in e:
        return "No LLM judge configured. Add an LLM provider first from the Models page."
    return "Evaluation failed. Check the agent endpoint is reachable and the LLM judge key is valid, then retry."

@router.get("/metrics")
async def list_available_metrics():
    from app.services.evaluation_engine import METRIC_REGISTRY
    return {
        "metrics": list(METRIC_REGISTRY.keys()),
        "registry": {
            k: {
                "id": k,
                "name": v["name"],
                "category": v["category"],
                "description": v["description"],
                "default_threshold": v["default_threshold"],
                "requires_context": v.get("requires_context", False),
                "requires_expected": v.get("requires_expected", False),
            }
            for k, v in METRIC_REGISTRY.items()
        }
    }

@router.get("")
async def list_evaluations(agent_id: Optional[str] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org_id = get_user_org_id(db, user.id)
    q = db.query(Evaluation).filter(Evaluation.org_id == org_id)
    if agent_id:
        q = q.filter(Evaluation.agent_id == agent_id)
    evals = q.order_by(Evaluation.created_at.desc()).all()
    return [eval_to_dict(e) for e in evals]

@router.post("")
async def create_and_run_evaluation(req: EvaluationCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org_id = get_user_org_id(db, user.id)
    agent = db.query(Agent).filter(Agent.id == req.agent_id, Agent.org_id == org_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    dataset = db.query(Dataset).filter(Dataset.id == req.dataset_id, Dataset.org_id == org_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    judge_config = None
    if req.llm_judge_provider_id:
        provider = db.query(LLMProvider).filter(LLMProvider.id == req.llm_judge_provider_id, LLMProvider.org_id == org_id).first()
        if provider and provider.api_key_encrypted:
            judge_config = {"provider": provider.provider_type.value, "model": provider.model_name, "api_key": decrypt_secret(provider.api_key_encrypted), "base_url": provider.base_url}

    if not judge_config:
        default_provider = db.query(LLMProvider).filter(LLMProvider.org_id == org_id, LLMProvider.is_default_judge == True, LLMProvider.is_active == True).first()
        if default_provider and default_provider.api_key_encrypted:
            judge_config = {"provider": default_provider.provider_type.value, "model": default_provider.model_name, "api_key": decrypt_secret(default_provider.api_key_encrypted), "base_url": default_provider.base_url}

    if not judge_config:
        raise HTTPException(status_code=400, detail="No LLM judge configured. Please add an LLM provider first.")

    test_cases = db.query(TestCase).filter(TestCase.dataset_id == req.dataset_id).all()
    if not test_cases:
        raise HTTPException(status_code=400, detail="Dataset has no test cases")

    evaluation = Evaluation(
        org_id=org_id, agent_id=req.agent_id, dataset_id=req.dataset_id,
        name=req.name, status=EvaluationStatus.PENDING,
        metrics=req.metrics, total_cases=len(test_cases), created_by=user.id,
        llm_judge_provider=judge_config["provider"], llm_judge_model=judge_config["model"],
        # Immutable snapshot — ARCH-01, EVAL-07
        agent_endpoint_snapshot=agent.endpoint_url,
        dataset_version=dataset.version,
        judge_provider_id=req.llm_judge_provider_id,
        judge_prompt_version=JUDGE_PROMPT_VERSION,
    )
    db.add(evaluation)
    # Audit log — SEC-03
    db.add(AuditLog(org_id=org_id, user_id=user.id, action="evaluation.create",
                    resource_type="evaluation", resource_id=evaluation.id,
                    details={"name": req.name, "agent_id": req.agent_id, "metrics": req.metrics}))
    db.commit()
    db.refresh(evaluation)

    from app.core.field_encryption import decrypt_text, decrypt_json
    asyncio.create_task(_run_evaluation_task(evaluation.id, agent, [{"id": tc.id, "input": decrypt_text(tc.input), "expected_output": decrypt_text(tc.expected_output), "context": decrypt_json(tc.context), "retrieval_context": decrypt_json(tc.retrieval_context)} for tc in test_cases], req.metrics, judge_config, req.metric_thresholds))
    return eval_to_dict(evaluation)

async def _run_evaluation_task(eval_id: str, agent: Agent, test_cases: list, metrics: list, judge_config: dict, thresholds: dict):
    db = SessionLocal()
    try:
        evaluation = db.query(Evaluation).filter(Evaluation.id == eval_id).first()
        evaluation.status = EvaluationStatus.RUNNING  # ARCH-05: explicit state
        evaluation.started_at = datetime.utcnow()
        db.commit()

        agent_config = {
            "endpoint_url": agent.endpoint_url, "http_method": agent.http_method.value if agent.http_method else "POST",
            "headers": agent.headers or {}, "payload_template": agent.payload_template or '{"input": "{{input}}"}',
            "response_path": agent.response_path,
        }
        if agent.api_key_encrypted:
            decrypted = decrypt_secret(agent.api_key_encrypted)
            agent_config["headers"]["Authorization"] = f"Bearer {decrypted}"

        async def progress_cb(done, total, result):
            db2 = SessionLocal()
            try:
                ev = db2.query(Evaluation).filter(Evaluation.id == eval_id).first()
                ev.completed_cases = done
                er = EvaluationResult(
                    evaluation_id=eval_id, test_case_id=result.get("test_case_id"),
                    input=result["input"], actual_output=result.get("actual_output"),
                    expected_output=result.get("expected_output"),
                    metric_results=result.get("metric_results", {}),
                    overall_passed=result.get("overall_passed"),
                    latency_ms=result.get("latency_ms"), error=result.get("error"),
                )
                db2.add(er)
                db2.commit()
                for ws in active_ws_connections.get(eval_id, []):
                    try:
                        await ws.send_json({"type": "progress", "done": done, "total": total, "result": result})
                    except Exception:
                        pass
            finally:
                db2.close()

        # Transition to judge phase — ARCH-05
        ev_judge = db.query(Evaluation).filter(Evaluation.id == eval_id).first()
        ev_judge.status = EvaluationStatus.JUDGE_RUNNING
        db.commit()

        results = await run_evaluation(eval_id, agent_config, test_cases, metrics, judge_config, thresholds, progress_cb)

        evaluation = db.query(Evaluation).filter(Evaluation.id == eval_id).first()
        evaluation.status = EvaluationStatus.COMPLETED
        evaluation.completed_at = datetime.utcnow()
        evaluation.overall_score = results["overall_score"]
        evaluation.metric_scores = results["metric_scores"]
        evaluation.passed_count = results["passed_count"]
        evaluation.failed_count = results["failed_count"]
        agent.last_evaluated_at = datetime.utcnow()
        db.commit()

        # Automatic regression detection — compare against previous run
        try:
            from app.services.alert_engine import check_eval_regression
            await check_eval_regression(eval_id)
        except Exception:
            pass

        for ws in active_ws_connections.get(eval_id, []):
            try:
                await ws.send_json({"type": "completed", "overall_score": results["overall_score"], "metric_scores": results["metric_scores"], "passed_count": results["passed_count"], "failed_count": results["failed_count"]})
            except Exception:
                pass
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Evaluation task failed eval_id=%s", eval_id)
        action = _action_for_error(str(e))
        evaluation = db.query(Evaluation).filter(Evaluation.id == eval_id).first()
        if evaluation:
            evaluation.status = EvaluationStatus.FAILED
            # HIGH-9: store full error server-side for debugging, never leak raw exception to clients
            evaluation.error_message = str(e)
            evaluation.error_action = action
            db.commit()
        for ws in active_ws_connections.get(eval_id, []):
            try:
                # Send only the sanitized user-actionable message to the client
                await ws.send_json({"type": "failed", "error": action, "action": action})
            except Exception:
                pass
    finally:
        db.close()

@router.get("/{eval_id}")
async def get_evaluation(eval_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org_id = get_user_org_id(db, user.id)
    e = db.query(Evaluation).filter(Evaluation.id == eval_id, Evaluation.org_id == org_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    return eval_to_dict(e)

@router.get("/{eval_id}/results")
async def get_results(
    eval_id: str,
    request: Request,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # HIGH-8: cap limit; SEC-05: log data exports
    limit = max(1, min(limit, 500))
    org_id = get_user_org_id(db, user.id)
    e = db.query(Evaluation).filter(Evaluation.id == eval_id, Evaluation.org_id == org_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    db.add(AuditLog(
        org_id=org_id, user_id=user.id,
        action="evaluation.results.export", resource_type="evaluation", resource_id=eval_id,
        details=f"Exported results limit={limit} offset={offset}",
        ip_address=request.client.host if request.client else "unknown",
    ))
    db.commit()
    results = db.query(EvaluationResult).filter(EvaluationResult.evaluation_id == eval_id).offset(offset).limit(limit).all()
    return [
        {
            "id": r.id, "input": r.input, "actual_output": r.actual_output,
            "expected_output": r.expected_output, "metric_results": r.metric_results,
            "overall_passed": r.overall_passed, "latency_ms": r.latency_ms,
            "error": r.error, "error_action": r.error_action,
        }
        for r in results
    ]

@router.get("/{eval_id}/report/pdf")
async def download_evaluation_pdf(
    eval_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download a PDF report for a completed evaluation."""
    org_id = get_user_org_id(db, user.id)
    e = db.query(Evaluation).filter(Evaluation.id == eval_id, Evaluation.org_id == org_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    if e.status.value not in ("completed", "failed"):
        raise HTTPException(status_code=409, detail="Report only available for completed evaluations")

    agent = db.query(Agent).filter(Agent.id == e.agent_id).first()
    agent_name = agent.name if agent else e.agent_id

    from app.models.organization import Organization
    org = db.query(Organization).filter(Organization.id == org_id).first()
    org_name = org.name if org else org_id

    results = db.query(EvaluationResult).filter(EvaluationResult.evaluation_id == eval_id).all()

    from app.services.report_generator import generate_evaluation_report
    pdf_bytes = generate_evaluation_report(
        evaluation=e,
        agent_name=agent_name,
        org_name=org_name,
        results=results,
    )

    filename = f"ittiqan-eval-{e.name.replace(' ', '-')[:40]}-{eval_id[:8]}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.websocket("/{eval_id}/ws")
async def evaluation_websocket(eval_id: str, websocket: WebSocket, token: str = ""):
    # CRIT-6: authenticate WS before accepting
    db = SessionLocal()
    try:
        user = await ws_get_current_user(token, db)
        org_id = get_user_org_id(db, user.id)
        eval_ = db.query(Evaluation).filter(Evaluation.id == eval_id, Evaluation.org_id == org_id).first()
        if not eval_:
            await websocket.close(code=4004)
            return
    except Exception:
        await websocket.close(code=4001)
        return
    finally:
        db.close()

    await websocket.accept()
    if eval_id not in active_ws_connections:
        active_ws_connections[eval_id] = []
    active_ws_connections[eval_id].append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_ws_connections.get(eval_id, []):
            active_ws_connections[eval_id].remove(websocket)
