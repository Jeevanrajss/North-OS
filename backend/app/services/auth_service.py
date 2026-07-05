"""JWT auth helpers for Phase 8 multi-user."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models.user import User

log = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# auto_error=False — a missing header must not immediately 403. We need to
# inspect it ourselves so local (non-cloud) requests can fall back to the
# single-user local account instead of being rejected outright.
bearer_scheme = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_EXPIRE = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_EXPIRE = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))

# The "local" account used when no Bearer token is presented and the server
# is not running in production (i.e. `uvicorn` on someone's own machine, or
# the packaged Electron app pointed at localhost). Its id is the empty
# string on purpose — every pre-Phase-8 row already has user_id="" from the
# ALTER TABLE ... DEFAULT '' migrations, so this naturally reunites a local
# user with their existing local-only data with no extra migration.
LOCAL_USER_ID = ""
LOCAL_USER_EMAIL = "local@localhost"

if JWT_SECRET == "change-me-in-production" and get_settings().app_env != "dev":  # pragma: no cover
    log.warning(
        "JWT_SECRET is unset — using the insecure default. Set the JWT_SECRET "
        "env var before exposing this server publicly; tokens are otherwise forgeable."
    )


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _make_token(data: dict, expires_delta: timedelta) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + expires_delta
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_access_token(user_id: str) -> str:
    return _make_token({"sub": user_id, "type": "access"}, timedelta(minutes=ACCESS_EXPIRE))


def create_refresh_token(user_id: str) -> str:
    return _make_token({"sub": user_id, "type": "refresh"}, timedelta(days=REFRESH_EXPIRE))


def _get_or_create_local_user(db: Session) -> User:
    """The single-user account used for local (non-cloud) dev/desktop use."""
    user = db.query(User).filter(User.id == LOCAL_USER_ID).first()
    if user is None:
        user = User(
            id=LOCAL_USER_ID,
            name="Local User",
            email=LOCAL_USER_EMAIL,
            password_hash="",
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency — inject into any route that needs auth.

    Cloud (production) requests must always present a valid Bearer token.
    Local dev requests (no token, APP_ENV != "prod") fall back to the
    single local account so `uvicorn` on localhost keeps working without
    forcing every dev/desktop user through the register/login flow.
    """
    if credentials is None:
        if get_settings().app_env == "dev":
            return _get_or_create_local_user(db)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise JWTError("Wrong token type")
        user_id: str = payload["sub"]
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
