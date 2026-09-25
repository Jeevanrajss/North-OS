"""Sync router — two-way sync between devices via the cloud (Phase 12b/12c).

Endpoints (prefixed /api/v1/sync):
  GET  /pull?since=<iso8601>   everything changed since `since`, all synced
                                tables, including tombstoned (deleted) rows
  POST /push                   upsert rows from the client; last-write-wins
                                by `updated_at`, deletes propagate via
                                `deleted_at`

This is the HTTP surface only — the actual (de)serialization and
last-write-wins merge logic live in app/services/sync_engine.py, shared with
the desktop backend's own sync worker (app/services/sync_client.py, Phase
12c), which applies pulled rows to its LOCAL database using the identical
merge rule.

See PHASE_12_SPEC.md for the design (why `settings` never syncs, why
conflicts resolve last-write-wins, why deletes are tombstones not hard
deletes).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models.user import User
from app.services.auth_service import get_current_user
from app.services.sync_engine import pull_changes, push_changes

router = APIRouter(prefix="/api/v1/sync", tags=["sync"])


def _require_local_instance() -> None:
    """The sync-CLIENT endpoints below (cloud-login/status/run) only make
    sense on a local desktop backend syncing OUT to the cloud. Block them on
    the cloud deployment itself — it has nothing to sync with."""
    if get_settings().app_env not in ("dev", "desktop"):
        raise HTTPException(400, "Sync client endpoints are not available on a cloud instance.")


@router.get("/pull")
def pull(
    since: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    since_dt: datetime | None = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
        except ValueError:
            raise HTTPException(422, "`since` must be ISO 8601")

    tables = pull_changes(db, current_user.id, since_dt)
    return {"server_time": datetime.utcnow().isoformat(), "tables": tables}


class SyncPushBody(BaseModel):
    tables: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)


@router.post("/push")
def push(
    body: SyncPushBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = push_changes(db, current_user.id, body.tables)
    return {"server_time": datetime.utcnow().isoformat(), **result}


# ---------------------------------------------------------------------------
# Sync-CLIENT endpoints — desktop-only (Phase 12c). These let the LOCAL
# backend authenticate against a cloud account and run the push/pull cycle
# against it, WITHOUT changing which backend the app's own UI talks to (that
# remains whatever the existing Local/Cloud Connection toggle says). No
# `get_current_user` here — these operate on the local backend's own
# device-local settings, not on any authenticated request to this instance.
# ---------------------------------------------------------------------------
class CloudLoginBody(BaseModel):
    server_url: str
    email: str
    password: str


@router.post("/cloud-login")
def cloud_login_endpoint(body: CloudLoginBody, db: Session = Depends(get_db)):
    _require_local_instance()
    from app.services.sync_client import cloud_login

    result = cloud_login(db, body.server_url, body.email, body.password)
    if not result["ok"]:
        raise HTTPException(400, result["error"])
    return {"ok": True}


@router.post("/cloud-logout")
def cloud_logout_endpoint(db: Session = Depends(get_db)):
    _require_local_instance()
    from app.services.sync_client import cloud_logout

    cloud_logout(db)
    return {"ok": True}


@router.get("/status")
def sync_status_endpoint(db: Session = Depends(get_db)):
    _require_local_instance()
    from app.services.sync_client import get_sync_status

    return get_sync_status(db)


@router.post("/run")
def sync_run_endpoint(db: Session = Depends(get_db)):
    _require_local_instance()
    from app.services.sync_client import run_sync

    return run_sync(db)
