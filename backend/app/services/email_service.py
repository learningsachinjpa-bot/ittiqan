"""
Async email delivery via aiosmtplib.

Gracefully no-ops when SMTP is not configured (SMTP_HOST not set).
All callers just await send_email(...) — they never need to check if email is enabled.

Configuration (all optional — set in .env):
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=yourapp@gmail.com
    SMTP_PASSWORD=your_app_password
    SMTP_FROM=Ittiqan <yourapp@gmail.com>
    SMTP_USE_TLS=true   (STARTTLS; set false for port-465 SSL)
"""
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_email(
    to: str | list[str],
    subject: str,
    html: str,
    text: str | None = None,
) -> bool:
    """
    Send an email. Returns True on success, False on failure or if email is disabled.
    Never raises — callers treat this as best-effort.
    """
    if not settings.email_enabled:
        logger.debug("Email not configured — skipping send to %s: %s", to, subject)
        return False

    recipients = [to] if isinstance(to, str) else to
    if not recipients:
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = ", ".join(recipients)

    if text:
        msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=settings.SMTP_USE_TLS,
        )
        logger.info("Email sent → %s | %s", recipients, subject)
        return True
    except Exception as exc:
        logger.error("Email send failed → %s | %s | %s", recipients, subject, exc)
        return False


def _approval_html(
    action_title: str,
    action_type: str,
    urgency: str,
    description: str | None,
    queue_url: str,
    expires: str | None,
) -> tuple[str, str]:
    """Returns (html, plain_text) for a new approval request notification."""
    URGENCY_COLOR = {"critical": "#ef4444", "high": "#f97316", "normal": "#eab308", "low": "#9ca3af"}
    color = URGENCY_COLOR.get(urgency, "#eab308")
    exp_line = f"<p style='color:#6b7280;font-size:13px'>Expires: {expires}</p>" if expires else ""
    desc_line = f"<p style='margin:12px 0;color:#374151'>{description}</p>" if description else ""

    html = f"""
    <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px">
      <div style="background:#0e7490;padding:16px 24px;border-radius:8px 8px 0 0">
        <h2 style="color:white;margin:0;font-size:18px">Ittiqan · Approval Required</h2>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <span style="background:{color};color:white;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;text-transform:uppercase">{urgency}</span>
        <h3 style="margin:16px 0 4px">{action_title}</h3>
        <p style="color:#6b7280;font-size:13px;margin:0">{action_type}</p>
        {desc_line}
        {exp_line}
        <a href="{queue_url}" style="display:inline-block;margin-top:20px;background:#0e7490;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600">Review in Dashboard →</a>
      </div>
      <p style="color:#9ca3af;font-size:11px;margin-top:16px;text-align:center">Ittiqan AI Agent Evaluation & Trust Platform</p>
    </div>
    """
    plain = (
        f"[{urgency.upper()}] Approval Required: {action_title}\n"
        f"Type: {action_type}\n"
        + (f"Description: {description}\n" if description else "")
        + (f"Expires: {expires}\n" if expires else "")
        + f"\nReview: {queue_url}"
    )
    return html, plain


def _alert_html(
    alert_name: str,
    severity: str,
    condition_type: str,
    metric_value: float,
    threshold: float,
    agent_name: str,
    dashboard_url: str,
) -> tuple[str, str]:
    """Returns (html, plain_text) for an alert firing notification."""
    SEV_COLOR = {"critical": "#ef4444", "high": "#f97316", "medium": "#eab308", "low": "#3b82f6"}
    color = SEV_COLOR.get(severity, "#eab308")
    html = f"""
    <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px">
      <div style="background:#7c3aed;padding:16px 24px;border-radius:8px 8px 0 0">
        <h2 style="color:white;margin:0;font-size:18px">Ittiqan · Alert Fired</h2>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <span style="background:{color};color:white;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;text-transform:uppercase">{severity}</span>
        <h3 style="margin:16px 0 4px">{alert_name}</h3>
        <p style="color:#6b7280;font-size:13px;margin:0 0 16px">Agent: <strong>{agent_name}</strong></p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px;background:#f9fafb;border:1px solid #e5e7eb">Condition</td><td style="padding:8px;border:1px solid #e5e7eb">{condition_type}</td></tr>
          <tr><td style="padding:8px;background:#f9fafb;border:1px solid #e5e7eb">Threshold</td><td style="padding:8px;border:1px solid #e5e7eb">{threshold}</td></tr>
          <tr><td style="padding:8px;background:#f9fafb;border:1px solid #e5e7eb">Actual value</td><td style="padding:8px;border:1px solid #e5e7eb;color:{color};font-weight:600">{metric_value:.2f}</td></tr>
        </table>
        <a href="{dashboard_url}" style="display:inline-block;margin-top:20px;background:#7c3aed;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600">View Incidents →</a>
      </div>
      <p style="color:#9ca3af;font-size:11px;margin-top:16px;text-align:center">Ittiqan AI Agent Evaluation & Trust Platform</p>
    </div>
    """
    plain = (
        f"[{severity.upper()}] Alert: {alert_name}\n"
        f"Agent: {agent_name}\n"
        f"Condition: {condition_type} | Threshold: {threshold} | Actual: {metric_value:.2f}\n"
        f"\nView: {dashboard_url}"
    )
    return html, plain
