"""Health endpoints — app, db, llm."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import __version__
from app.config import get_settings
from app.db import get_db
from app.services import llm_client

router = APIRouter(prefix="/api/v1", tags=["health"])


@router.get("/health")
async def health(db: Session = Depends(get_db)):
    settings = get_settings()
    db_ok = True
    db_error: str | None = None
    try:
        db.execute(text("SELECT 1")).scalar()
    except Exception as e:
        db_ok = False
        db_error = str(e)

    llm_status = await llm_client.health()

    return {
        "app": {
            "name": settings.app_name,
            "version": __version__,
            "env": settings.app_env,
            "timezone": settings.timezone,
            "currency": settings.currency,
        },
        "db": {"ok": db_ok, "path": settings.db_path, "error": db_error},
        "llm": llm_status,
    }
