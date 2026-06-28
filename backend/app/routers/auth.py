import re
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from app.core.limiter import limiter
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime
import httpx

from app.core.database import get_db
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    decode_token, get_current_user, get_client_ip,
)
from app.models.user import User
from app.models.organization import Organization, OrgMember, OrgMemberRole, AuditLog

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

_GOOGLE_PICTURE_RE = re.compile(r'^https://[a-zA-Z0-9.\-_/]+\.googleusercontent\.com/')

class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 200:
            raise ValueError("Name must be 1–200 characters")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class GoogleAuthRequest(BaseModel):
    access_token: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict

def user_to_dict(user: User, org: Optional[Organization] = None) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "picture": user.picture,
        "is_verified": user.is_verified,
        "org": {"id": org.id, "name": org.name, "slug": org.slug, "plan": org.plan} if org else None,
    }

def get_user_org(db: Session, user_id: str) -> Optional[Organization]:
    membership = db.query(OrgMember).filter(OrgMember.user_id == user_id).first()
    if membership:
        return db.query(Organization).filter(Organization.id == membership.org_id).first()
    return None

@router.post("/signup", response_model=TokenResponse)
@limiter.limit("10/minute")
async def signup(request: Request, req: SignupRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        name=req.name, email=req.email,
        password_hash=hash_password(req.password), is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("signup user_id=%s ip=%s", user.id, get_client_ip(request))
    access_token = create_access_token({"sub": user.id})
    refresh_token = create_refresh_token({"sub": user.id})
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user=user_to_dict(user))

@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email, User.is_active == True).first()
    if not user or not user.password_hash or not verify_password(req.password, user.password_hash):
        # identical message for valid and invalid accounts (user enumeration prevention)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user.last_login = datetime.utcnow()
    org = get_user_org(db, user.id)
    membership = db.query(OrgMember).filter(OrgMember.user_id == user.id).first()
    if membership:
        db.add(AuditLog(
            org_id=membership.org_id, user_id=user.id,
            action="auth.login", resource_type="user", resource_id=user.id,
            details=f"Login from {get_client_ip(request)}",
            ip_address=get_client_ip(request),
        ))
    db.commit()
    access_token = create_access_token({"sub": user.id})
    refresh_token = create_refresh_token({"sub": user.id})
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user=user_to_dict(user, org))

@router.post("/google", response_model=TokenResponse)
@limiter.limit("10/minute")
async def google_auth(request: Request, req: GoogleAuthRequest, db: Session = Depends(get_db)):
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {req.access_token}"},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google token")
        profile = resp.json()

    # HIGH-5: verify token is for THIS application
    from app.core.config import settings
    token_audience = profile.get("aud") or profile.get("azp")
    if token_audience and settings.GOOGLE_CLIENT_ID and token_audience != settings.GOOGLE_CLIENT_ID:
        logger.warning("Google OAuth audience mismatch: got %s", token_audience)
        raise HTTPException(status_code=401, detail="Invalid Google token audience")

    email = profile.get("email")
    name = profile.get("name", email)
    raw_picture = profile.get("picture", "")
    google_id = profile.get("sub")

    # Validate picture URL — only allow Google's CDN
    picture = raw_picture if raw_picture and _GOOGLE_PICTURE_RE.match(raw_picture) else None

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(name=name, email=email, picture=picture, google_id=google_id, is_verified=True)
        db.add(user)
    else:
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account deactivated")
        user.picture = picture
        user.google_id = google_id
    user.last_login = datetime.utcnow()
    db.commit()
    db.refresh(user)

    org = get_user_org(db, user.id)
    membership = db.query(OrgMember).filter(OrgMember.user_id == user.id).first()
    if membership:
        db.add(AuditLog(
            org_id=membership.org_id, user_id=user.id,
            action="auth.google_login", resource_type="user", resource_id=user.id,
            details=f"Google login from {get_client_ip(request)}",
            ip_address=get_client_ip(request),
        ))
        db.commit()

    access_token = create_access_token({"sub": user.id})
    refresh_token = create_refresh_token({"sub": user.id})
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user=user_to_dict(user, org))

@router.post("/refresh")
@limiter.limit("20/minute")
async def refresh_token(request: Request, body: dict, db: Session = Depends(get_db)):
    from app.core.redis_client import blacklist_token, is_token_blacklisted
    from datetime import datetime
    token = body.get("refresh_token")
    if not token:
        raise HTTPException(status_code=400, detail="refresh_token required")
    payload = decode_token(token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=400, detail="Not a refresh token")
    # Check refresh token not already revoked
    jti = payload.get("jti")
    if jti and await is_token_blacklisted(jti):
        raise HTTPException(status_code=401, detail="Refresh token has been revoked")
    # HIGH-4: check user is still active
    user = db.query(User).filter(User.id == payload["sub"], User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or deactivated")
    # Rotate: blacklist the used refresh token, issue new pair
    exp = payload.get("exp")
    if jti and exp:
        ttl = max(0, int(exp - datetime.utcnow().timestamp()))
        await blacklist_token(jti, ttl)
    new_access = create_access_token({"sub": user.id})
    new_refresh = create_refresh_token({"sub": user.id})
    return {"access_token": new_access, "refresh_token": new_refresh, "token_type": "bearer"}

class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None


@router.post("/logout")
async def logout(
    request: Request,
    body: LogoutRequest = LogoutRequest(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Blacklist the access token (and refresh token if provided) in Redis so they
    cannot be reused even within their remaining TTL."""
    from app.models.organization import OrgMember
    from app.core.redis_client import blacklist_token
    from app.core.security import decode_token
    from datetime import datetime

    # Blacklist the current access token
    raw_token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if raw_token:
        try:
            payload = decode_token(raw_token)
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti and exp:
                ttl = max(0, int(exp - datetime.utcnow().timestamp()))
                await blacklist_token(jti, ttl)
        except Exception:
            pass

    # Blacklist the refresh token if the client sent it
    if body.refresh_token:
        try:
            payload = decode_token(body.refresh_token)
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti and exp:
                ttl = max(0, int(exp - datetime.utcnow().timestamp()))
                await blacklist_token(jti, ttl)
        except Exception:
            pass

    membership = db.query(OrgMember).filter(OrgMember.user_id == user.id).first()
    if membership:
        db.add(AuditLog(
            org_id=membership.org_id, user_id=user.id,
            action="auth.logout", resource_type="user", resource_id=user.id,
            details=f"Logout from {get_client_ip(request)}",
            ip_address=get_client_ip(request),
        ))
        db.commit()
    return {"success": True}

@router.get("/me")
async def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = get_user_org(db, user.id)
    return user_to_dict(user, org)
