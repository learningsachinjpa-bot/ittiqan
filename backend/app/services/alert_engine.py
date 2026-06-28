"""
Alert engine — evaluates active Alert conditions against recent trace data
and fires notifications when thresholds are breached.

Called by the health monitor scheduler after every health check run, and
can also be triggered on-demand via the alerts router.

Condition types supported:
  error_rate      — % of traces that are ERROR or TIMEOUT > threshold (0-100)
  latency_spike   — avg latency_ms in window > threshold (ms)
  score_drop      — latest completed eval overall_score dropped below threshold (0.0–1.0)

Notifications:
  - Always: creates an Incident record ("auto" source) so the Reliability page shows it
  - webhook channel: HTTP POST to the configured URL
  - email channel: logged only (no SMTP configured yet, placeholder)

Cooldown: 30 minutes between firings per alert to prevent storm.
"""
import logging
import uuid
from datetime import datetime, timedelta
from statistics import mean

import httpx
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.observability import Alert, Trace, TraceStatus
from app.models.incident import Incident, IncidentSeverity, IncidentStatus

logger = logging.getLogger(__name__)

# How far back to look when computing metrics for alert evaluation
EVAL_WINDOW_MINUTES = 30
# Minimum traces in window before we evaluate (avoid false positives on low traffic)
MIN_TRACES = 3
# Suppress re-firing an alert within this many minutes of its last trigger
COOLDOWN_MINUTES = 30


def _severity_map(alert_severity: str) -> IncidentSeverity:
    mapping = {
        "critical": IncidentSeverity.CRITICAL,
        "high": IncidentSeverity.HIGH,
        "medium": IncidentSeverity.MEDIUM,
        "low": IncidentSeverity.LOW,
    }
    return mapping.get(alert_severity, IncidentSeverity.MEDIUM)


async def _fire_webhook(
    url: str,
    payload: dict,
    org_id: str | None = None,
    alert_id: str | None = None,
    is_test: bool = False,
    db: Session | None = None,
) -> dict:
    """Fire a webhook and log the delivery attempt. Returns a status dict."""
    from app.core.ssrf import validate_url
    from app.models.webhook_delivery import WebhookDelivery
    import time

    status = "failed"
    http_status = None
    response_body = None
    error_message = None
    start = time.monotonic()

    try:
        validate_url(url)
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(url, json=payload)
        http_status = resp.status_code
        response_body = resp.text[:500] if resp.text else None
        status = "success" if resp.status_code < 400 else "failed"
        logger.info("Webhook fired: %s → %s", url, resp.status_code)
    except Exception as exc:
        error_message = str(exc)[:500]
        logger.warning("Webhook delivery failed (%s): %s", url, exc)

    duration_ms = int((time.monotonic() - start) * 1000)

    if org_id and (db is not None):
        try:
            delivery = WebhookDelivery(
                org_id=org_id,
                alert_id=alert_id,
                url=url,
                payload=payload,
                status=status,
                http_status=http_status,
                response_body=response_body,
                error_message=error_message,
                duration_ms=duration_ms,
                is_test=is_test,
            )
            db.add(delivery)
            db.commit()
        except Exception:
            logger.exception("Failed to log webhook delivery")

    return {"status": status, "http_status": http_status, "duration_ms": duration_ms, "error": error_message}


async def _fire_alert(alert: Alert, metric_value: float, db: Session) -> None:
    """Create an Incident and dispatch all configured notification channels."""
    now = datetime.utcnow()

    # Update alert counters
    alert.triggered_count = (alert.triggered_count or 0) + 1
    alert.last_triggered_at = now

    # Build a human-readable description
    condition_label = {
        "error_rate": f"error rate {metric_value:.1f}% exceeded threshold {alert.condition_threshold:.0f}%",
        "latency_spike": f"avg latency {metric_value:.0f}ms exceeded threshold {alert.condition_threshold:.0f}ms",
        "score_drop": f"score {metric_value:.2f} dropped below threshold {alert.condition_threshold:.2f}",
    }.get(alert.condition_type, f"{alert.condition_type} = {metric_value:.2f} (threshold {alert.condition_threshold})")

    description = (
        f"Alert '{alert.name}' fired: {condition_label} "
        f"in the last {EVAL_WINDOW_MINUTES} minutes."
    )

    # Find a system user to assign created_by (use the org's first member)
    from app.models.organization import OrgMember
    member = db.query(OrgMember).filter(OrgMember.org_id == alert.org_id).first()
    created_by = member.user_id if member else "system"

    incident = Incident(
        id=str(uuid.uuid4()),
        org_id=alert.org_id,
        agent_id=alert.agent_id,
        title=f"[Alert] {alert.name}",
        description=description,
        severity=_severity_map(alert.severity.value if alert.severity else "medium"),
        status=IncidentStatus.OPEN,
        created_by=created_by,
        created_at=now,
    )
    db.add(incident)
    db.commit()

    logger.warning("Alert fired: %s | %s", alert.name, condition_label)

    # Dispatch notification channels
    channels = alert.notification_channels or []
    payload = {
        "alert_id": alert.id,
        "alert_name": alert.name,
        "severity": alert.severity.value if alert.severity else "medium",
        "condition_type": alert.condition_type,
        "condition_threshold": alert.condition_threshold,
        "metric_value": metric_value,
        "description": description,
        "incident_id": incident.id,
        "fired_at": now.isoformat(),
    }

    # Resolve agent name for email templates
    from app.models.agent import Agent as AgentModel
    agent_obj = db.query(AgentModel).filter(AgentModel.id == alert.agent_id).first() if alert.agent_id else None
    agent_name = agent_obj.name if agent_obj else (alert.agent_id or "unknown")

    for channel in channels:
        channel_type = channel.get("type", "")
        if channel_type == "webhook":
            url = channel.get("url", "")
            if url:
                await _fire_webhook(url, payload, org_id=alert.org_id, alert_id=alert.id, db=db)
        elif channel_type == "email":
            address = channel.get("address", "")
            if address:
                from app.services.email_service import send_email, _alert_html
                from app.core.config import settings
                dashboard_url = f"{settings.FRONTEND_URL}/project/{alert.agent_id}/reliability/incidents" if alert.agent_id else settings.FRONTEND_URL
                html, plain = _alert_html(
                    alert_name=alert.name,
                    severity=alert.severity.value if alert.severity else "medium",
                    condition_type=alert.condition_type,
                    metric_value=metric_value,
                    threshold=alert.condition_threshold,
                    agent_name=agent_name,
                    dashboard_url=dashboard_url,
                )
                subject = f"[{(alert.severity.value if alert.severity else 'medium').upper()}] Alert fired: {alert.name}"
                await send_email(to=address, subject=subject, html=html, text=plain)
            else:
                logger.info("Email alert channel missing address — skipping: %s", alert.name)


def _compute_metric(condition_type: str, traces: list) -> float | None:
    if condition_type not in ("error_rate", "latency_spike"):
        return None  # score_drop handled separately via _compute_score_drop

    if not traces:
        return None

    if condition_type == "error_rate":
        errors = sum(1 for t in traces if t.status in (TraceStatus.ERROR, TraceStatus.TIMEOUT))
        return errors / len(traces) * 100

    if condition_type == "latency_spike":
        latencies = [t.latency_ms for t in traces if t.latency_ms is not None]
        return mean(latencies) if latencies else None

    return None


def _compute_score_drop(alert: object, db: Session) -> float | None:
    """
    Returns the most recent completed evaluation's overall_score for the alert's agent,
    or None if no completed evaluation exists.
    Fires when the score is BELOW the threshold.
    """
    from app.models.evaluation import Evaluation, EvaluationStatus
    latest = (
        db.query(Evaluation)
        .filter(
            Evaluation.org_id == alert.org_id,
            Evaluation.agent_id == alert.agent_id,
            Evaluation.status == EvaluationStatus.COMPLETED,
            Evaluation.overall_score.isnot(None),
        )
        .order_by(Evaluation.completed_at.desc())
        .first()
    )
    return latest.overall_score if latest else None


async def evaluate_alerts(org_id: str | None = None, agent_id: str | None = None) -> list[dict]:
    """
    Evaluate all active alerts for the given org/agent (or all orgs if None).
    Returns a list of fired alert summaries.
    """
    db: Session = SessionLocal()
    fired = []
    try:
        q = db.query(Alert).filter(Alert.is_active == True)
        if org_id:
            q = q.filter(Alert.org_id == org_id)
        if agent_id:
            q = q.filter(Alert.agent_id == agent_id)
        alerts = q.all()

        if not alerts:
            return []

        now = datetime.utcnow()
        window_start = now - timedelta(minutes=EVAL_WINDOW_MINUTES)
        cooldown_cutoff = now - timedelta(minutes=COOLDOWN_MINUTES)

        for alert in alerts:
            # Skip if still in cooldown
            if alert.last_triggered_at and alert.last_triggered_at > cooldown_cutoff:
                continue

            # Fetch traces in window (scoped to agent if alert has one)
            tq = db.query(Trace).filter(
                Trace.org_id == alert.org_id,
                Trace.timestamp >= window_start,
                # Exclude health_check traces from alert evaluation to avoid feedback loops
                Trace.model_used != "health_check",
            )
            if alert.agent_id:
                tq = tq.filter(Trace.agent_id == alert.agent_id)
            traces = tq.all()

            # score_drop is evaluated against evaluations, not traces
            if alert.condition_type == "score_drop":
                metric = _compute_score_drop(alert, db)
                if metric is None:
                    continue
                # score_drop fires when score is BELOW threshold (unlike error_rate/latency which fire above)
                breached = metric < alert.condition_threshold
            else:
                if len(traces) < MIN_TRACES:
                    continue
                metric = _compute_metric(alert.condition_type, traces)
                if metric is None:
                    continue
                breached = metric > alert.condition_threshold

            if breached:
                await _fire_alert(alert, metric, db)
                fired.append({
                    "alert_id": alert.id,
                    "alert_name": alert.name,
                    "condition_type": alert.condition_type,
                    "threshold": alert.condition_threshold,
                    "metric_value": round(metric, 4),
                })

        return fired
    except Exception as exc:
        logger.error("Alert evaluation failed: %s", exc)
        return []
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Automatic eval regression check
# Called right after an evaluation reaches COMPLETED status.
# Fires a notification if the new score dropped >= REGRESSION_THRESHOLD vs the
# previous run on the same agent (no user-defined alert required).
# ─────────────────────────────────────────────────────────────────────────────

REGRESSION_THRESHOLD = 0.05  # 5 percentage points

async def check_eval_regression(eval_id: str) -> None:
    """Compare newly-completed eval against its predecessor; fire notification on regression."""
    from app.models.evaluation import Evaluation, EvaluationStatus
    from app.models.agent import Agent as AgentModel
    from app.models.organization import Organization

    db = SessionLocal()
    try:
        current = db.query(Evaluation).filter(
            Evaluation.id == eval_id,
            Evaluation.status == EvaluationStatus.COMPLETED,
            Evaluation.overall_score.isnot(None),
        ).first()
        if not current:
            return

        previous = (
            db.query(Evaluation)
            .filter(
                Evaluation.org_id == current.org_id,
                Evaluation.agent_id == current.agent_id,
                Evaluation.dataset_id == current.dataset_id,
                Evaluation.status == EvaluationStatus.COMPLETED,
                Evaluation.overall_score.isnot(None),
                Evaluation.id != current.id,
                Evaluation.completed_at < current.completed_at,
            )
            .order_by(Evaluation.completed_at.desc())
            .first()
        )
        if not previous:
            return

        drop = previous.overall_score - current.overall_score
        if drop < REGRESSION_THRESHOLD:
            return

        agent = db.query(AgentModel).filter(AgentModel.id == current.agent_id).first()
        org   = db.query(Organization).filter(Organization.id == current.org_id).first()
        agent_name = agent.name if agent else current.agent_id
        org_name   = org.name   if org   else current.org_id

        incident_title = (
            f"Eval regression — {agent_name}: "
            f"{round(previous.overall_score * 100)}% → {round(current.overall_score * 100)}% "
            f"(−{round(drop * 100)}pp)"
        )
        incident = Incident(
            org_id=current.org_id,
            agent_id=current.agent_id,
            title=incident_title,
            description=(
                f"Evaluation '{eval_id}' completed with score "
                f"{round(current.overall_score * 100, 1)}%, "
                f"down from {round(previous.overall_score * 100, 1)}% in the previous run "
                f"'{previous.id}'. Regression threshold: {round(REGRESSION_THRESHOLD * 100)}pp."
            ),
            severity=IncidentSeverity.HIGH if drop >= 0.10 else IncidentSeverity.MEDIUM,
            status=IncidentStatus.OPEN,
            source="auto",
        )
        db.add(incident)
        db.commit()
        logger.warning("Eval regression detected for agent %s: %.1f%% drop", agent_name, drop * 100)

        # Send email if configured
        try:
            from app.services.email_service import send_email, _alert_html
            from app.core.config import settings
            if settings.email_enabled and org and org.members:
                owner = next((m for m in org.members if m.role == "owner"), org.members[0])
                if owner and owner.user:
                    html, text = _alert_html(
                        alert_name="Automatic Regression Detection",
                        severity="high" if drop >= 0.10 else "medium",
                        condition_type="eval_regression",
                        metric_value=round(current.overall_score * 100, 1),
                        threshold=round(previous.overall_score * 100, 1),
                        agent_name=agent_name,
                        dashboard_url=f"{settings.FRONTEND_URL}/project/{current.agent_id}/evaluations",
                    )
                    await send_email(
                        to=owner.user.email,
                        subject=f"[Ittiqan] Eval regression — {agent_name}",
                        html=html,
                        text=text,
                    )
        except Exception:
            pass
    except Exception as exc:
        logger.error("check_eval_regression failed for eval %s: %s", eval_id, exc)
    finally:
        db.close()
