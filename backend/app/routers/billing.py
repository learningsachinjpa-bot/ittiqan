import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.core.config import settings
from app.models.user import User
from app.models.organization import Organization, OrgMember, PlanType, AuditLog
from app.core.security import get_client_ip

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])

_PLAN_LIMITS = {
    PlanType.FREE:       {"max_agents": 5,  "max_evaluations_per_month": 100,  "max_datasets": 5},
    PlanType.PRO:        {"max_agents": 25, "max_evaluations_per_month": 10000, "max_datasets": 100},
    PlanType.ENTERPRISE: {"max_agents": 0,  "max_evaluations_per_month": 0,    "max_datasets": 0},  # 0 = unlimited
}

def _get_stripe():
    if not settings.stripe_enabled:
        raise HTTPException(status_code=503, detail="Billing not configured")
    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe

def _get_member(db: Session, user_id: str) -> OrgMember:
    m = db.query(OrgMember).filter(OrgMember.user_id == user_id).first()
    if not m:
        raise HTTPException(status_code=403, detail="No organization")
    return m

def _get_org(db: Session, org_id: str) -> Organization:
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org

def _ensure_customer(stripe, org: Organization, user: User, db: Session) -> str:
    """Return existing Stripe customer ID or create a new one."""
    if org.stripe_customer_id:
        return org.stripe_customer_id
    customer = stripe.Customer.create(
        email=user.email,
        name=org.name,
        metadata={"org_id": org.id, "org_slug": org.slug},
    )
    org.stripe_customer_id = customer["id"]
    db.commit()
    return customer["id"]


@router.get("/status")
async def billing_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return current plan and billing info (no Stripe key required for free plan)."""
    m = _get_member(db, user.id)
    org = _get_org(db, m.org_id)

    subscription_status = None
    current_period_end = None

    if org.stripe_subscription_id and settings.stripe_enabled:
        try:
            stripe = _get_stripe()
            sub = stripe.Subscription.retrieve(org.stripe_subscription_id)
            subscription_status = sub["status"]
            current_period_end = sub["current_period_end"]
        except Exception:
            pass

    return {
        "plan": org.plan.value,
        "stripe_customer_id": org.stripe_customer_id,
        "stripe_subscription_id": org.stripe_subscription_id,
        "subscription_status": subscription_status,
        "current_period_end": current_period_end,
        "max_agents": org.max_agents,
        "max_evaluations_per_month": org.max_evaluations_per_month,
        "max_datasets": org.max_datasets,
        "stripe_enabled": settings.stripe_enabled,
        "pro_price_id": settings.STRIPE_PRO_PRICE_ID,
        "enterprise_price_id": settings.STRIPE_ENTERPRISE_PRICE_ID,
    }


class CheckoutRequest(BaseModel):
    price_id: str
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


@router.post("/checkout")
async def create_checkout(
    request: Request,
    body: CheckoutRequest,
    user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
):
    """Create a Stripe Checkout session for the given price ID."""
    stripe = _get_stripe()
    m = _get_member(db, user.id)
    org = _get_org(db, m.org_id)

    customer_id = _ensure_customer(stripe, org, user, db)
    success_url = body.success_url or f"{settings.FRONTEND_URL}/dashboard/billing?success=1"
    cancel_url  = body.cancel_url  or f"{settings.FRONTEND_URL}/dashboard/billing?cancelled=1"

    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": body.price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"org_id": org.id},
        allow_promotion_codes=True,
    )
    return {"checkout_url": session["url"]}


@router.post("/portal")
async def customer_portal(
    request: Request,
    user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
):
    """Create a Stripe Customer Portal session for managing the subscription."""
    stripe = _get_stripe()
    m = _get_member(db, user.id)
    org = _get_org(db, m.org_id)

    if not org.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer yet — start a subscription first")

    session = stripe.billing_portal.Session.create(
        customer=org.stripe_customer_id,
        return_url=f"{settings.FRONTEND_URL}/dashboard/billing",
    )
    return {"portal_url": session["url"]}


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """Receive Stripe webhook events and update org plan accordingly."""
    if not settings.stripe_enabled:
        raise HTTPException(status_code=503, detail="Billing not configured")

    import stripe as stripe_lib
    stripe_lib.api_key = settings.STRIPE_SECRET_KEY

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe_lib.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe_lib.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    evt_type = event["type"]
    data = event["data"]["object"]

    if evt_type in ("customer.subscription.created", "customer.subscription.updated"):
        _handle_subscription_change(data, db)
    elif evt_type == "customer.subscription.deleted":
        _handle_subscription_deleted(data, db)
    elif evt_type == "checkout.session.completed":
        # subscription is already handled by customer.subscription.created
        pass

    return {"received": True}


def _plan_from_price(price_id: Optional[str]) -> PlanType:
    if price_id == settings.STRIPE_ENTERPRISE_PRICE_ID:
        return PlanType.ENTERPRISE
    if price_id == settings.STRIPE_PRO_PRICE_ID:
        return PlanType.PRO
    return PlanType.FREE


def _apply_plan(org: Organization, plan: PlanType):
    org.plan = plan
    limits = _PLAN_LIMITS[plan]
    org.max_agents = limits["max_agents"]
    org.max_evaluations_per_month = limits["max_evaluations_per_month"]
    org.max_datasets = limits["max_datasets"]


def _handle_subscription_change(sub: dict, db: Session):
    customer_id = sub.get("customer")
    status = sub.get("status")
    subscription_id = sub.get("id")
    price_id = None
    items = sub.get("items", {}).get("data", [])
    if items:
        price_id = items[0].get("price", {}).get("id")

    org = db.query(Organization).filter(Organization.stripe_customer_id == customer_id).first()
    if not org:
        logger.warning("Stripe webhook: no org for customer %s", customer_id)
        return

    org.stripe_subscription_id = subscription_id
    if status in ("active", "trialing"):
        _apply_plan(org, _plan_from_price(price_id))
    elif status in ("past_due", "unpaid", "paused"):
        # keep existing plan, just log
        logger.warning("Org %s subscription status: %s", org.id, status)
    db.commit()
    logger.info("Updated org %s plan to %s (sub %s, status %s)", org.id, org.plan, subscription_id, status)


def _handle_subscription_deleted(sub: dict, db: Session):
    customer_id = sub.get("customer")
    org = db.query(Organization).filter(Organization.stripe_customer_id == customer_id).first()
    if not org:
        return
    _apply_plan(org, PlanType.FREE)
    org.stripe_subscription_id = None
    db.commit()
    logger.info("Org %s downgraded to FREE (subscription cancelled)", org.id)
