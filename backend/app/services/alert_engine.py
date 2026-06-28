"""
Alert engine — evaluates active Alert conditions against recent trace data
and fires notifications when thresholds are breached.

Called by the health monitor scheduler after every health check run, and
can also be triggered on-demand via the alerts router.

Condition types supported:
  error_rate      — % of traces that are ERROR or TIMEOUT > threshold (0-100)
  latency_spike   — avg latency_ms in window > threshold (ms)
  score_drop      — not yet: placeholder for future eval score alerts

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


async def _fire_webhook(url: str, payload: dict) -> None:
    try:
        from app.core.ssrf import validate_url
        validate_url(url)
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(url, json=payload)
        logger.info("Webhook fired: %s", url)
    except Exception as exc:
        logger.warning("Webhook delivery failed (%s): %s", url, exc)


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

    for channel in channels:
        channel_type = channel.get("type", "")
        if channel_type == "webhook":
            url = channel.get("url", "")
            if url:
                await _fire_webhook(url, payload)
        elif channel_type == "email":
            # Placeholder — log only until SMTP is configured
            logger.info("Email alert (not yet sent): %s → %s", alert.name, channel.get("address", ""))


def _compute_metric(condition_type: str, traces: list) -> float | None:
    if not traces:
        return None

    if condition_type == "error_rate":
        errors = sum(1 for t in traces if t.status in (TraceStatus.ERROR, TraceStatus.TIMEOUT))
        return errors / len(traces) * 100

    if condition_type == "latency_spike":
        latencies = [t.latency_ms for t in traces if t.latency_ms is not None]
        return mean(latencies) if latencies else None

    # score_drop: not yet implemented, returns None to skip evaluation
    return None


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
                    "metric_value": round(metric, 2),
                })

        return fired
    except Exception as exc:
        logger.error("Alert evaluation failed: %s", exc)
        return []
    finally:
        db.close()
