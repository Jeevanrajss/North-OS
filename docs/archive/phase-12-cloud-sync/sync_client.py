"""Desktop sync client (Phase 12c).

Runs INSIDE the local desktop backend. Connects this Mac's local database to
the cloud account, independently of "Connection mode" — signing in for sync
does NOT repoint the app at the cloud backend (that's the pre-existing
Local/Cloud toggle, unchanged). The desktop keeps using its local DB and
local LM Studio the whole time; this just pushes/pulls in the background.

Credentials + sync bookkeeping live in the LOCAL `settings` table under
`sync.*` keys — deliberately NOT in the synced tables list, so they never
propagate anywhere (a cloud access token has no business being copied to
another device via the sync mechanism it authenticates).

Identity note: local rows are always owned by the local sentinel user
(`user_id=""`, see auth_service.LOCAL_USER_ID). The cloud account has its own
real user_id (a UUID). This mismatch is harmless — `sync_engine.merge_row`
takes `user_id` as an explicit parameter and treats the row payload's own
`user_id` field as protected/ignored, so each side always attributes rows to
ITS OWN authenticated identity regardless of what the other side's `user_id`
happened to be.
"""
from __future__ import annotations

import logging
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from app.models.setting import Setting
from app.services.sync_engine import pull_changes, push_changes

log = logging.getLogger(__name__)

LOCAL_USER_ID = ""  # matches auth_service._get_or_create_local_user

_KEY_SERVER_URL = "sync.cloud_server_url"
_KEY_EMAIL = "sync.cloud_email"
_KEY_ACCESS_TOKEN = "sync.cloud_access_token"
_KEY_REFRESH_TOKEN = "sync.cloud_refresh_token"
_KEY_LAST_PUSH_AT = "sync.last_push_at"
_KEY_LAST_PULL_AT = "sync.last_pull_at"
_KEY_ENABLED = "sync.enabled"

_HTTP_TIMEOUT = 30.0


# ---------------------------------------------------------------------------
# Local settings helpers
# ---------------------------------------------------------------------------
def _get(db: Session, key: str) -> str | None:
    row = db.query(Setting).filter(Setting.key == key, Setting.user_id == LOCAL_USER_ID).first()
    return row.value if row else None


def _set(db: Session, key: str, value: str | None) -> None:
    row = db.query(Setting).filter(Setting.key == key, Setting.user_id == LOCAL_USER_ID).first()
    if row is None:
        row = Setting(key=key, user_id=LOCAL_USER_ID)
        db.add(row)
    row.value = value


def get_sync_status(db: Session) -> dict:
    return {
        "signed_in": bool(_get(db, _KEY_ACCESS_TOKEN)),
        "email": _get(db, _KEY_EMAIL),
        "server_url": _get(db, _KEY_SERVER_URL),
        "enabled": _get(db, _KEY_ENABLED) == "true",
        "last_push_at": _get(db, _KEY_LAST_PUSH_AT),
        "last_pull_at": _get(db, _KEY_LAST_PULL_AT),
    }


# ---------------------------------------------------------------------------
# Sign in / out — decoupled from Connection mode. This only stores
# credentials for the background sync worker; it never touches the
# frontend's `server_url`/`access_token` localStorage keys that control
# which backend the UI actually talks to.
# ---------------------------------------------------------------------------
def cloud_login(db: Session, server_url: str, email: str, password: str) -> dict:
    base = server_url.rstrip("/")
    try:
        r = httpx.post(f"{base}/api/v1/auth/login", json={"email": email, "password": password}, timeout=_HTTP_TIMEOUT)
    except httpx.HTTPError as e:
        return {"ok": False, "error": f"Cannot reach {base}: {e}"}
    if r.status_code != 200:
        return {"ok": False, "error": f"Login failed ({r.status_code})"}

    data = r.json()
    _set(db, _KEY_SERVER_URL, base)
    _set(db, _KEY_EMAIL, email)
    _set(db, _KEY_ACCESS_TOKEN, data["access_token"])
    _set(db, _KEY_REFRESH_TOKEN, data["refresh_token"])
    _set(db, _KEY_ENABLED, "true")
    db.commit()
    return {"ok": True}


def cloud_logout(db: Session) -> None:
    for key in (_KEY_ACCESS_TOKEN, _KEY_REFRESH_TOKEN, _KEY_EMAIL, _KEY_SERVER_URL, _KEY_ENABLED):
        _set(db, key, None)
    db.commit()


def _refresh_token(db: Session, base: str, refresh_token: str) -> str | None:
    try:
        r = httpx.post(f"{base}/api/v1/auth/refresh", json={"refresh_token": refresh_token}, timeout=_HTTP_TIMEOUT)
    except httpx.HTTPError:
        return None
    if r.status_code != 200:
        return None
    data = r.json()
    _set(db, _KEY_ACCESS_TOKEN, data["access_token"])
    _set(db, _KEY_REFRESH_TOKEN, data["refresh_token"])
    db.commit()
    return data["access_token"]


# ---------------------------------------------------------------------------
# The actual sync cycle: push local changes, then pull remote changes.
# Push-before-pull minimizes the window where a just-pushed row bounces back.
# ---------------------------------------------------------------------------
def run_sync(db: Session) -> dict:
    if _get(db, _KEY_ENABLED) != "true":
        return {"synced": False, "reason": "not signed in"}

    base = _get(db, _KEY_SERVER_URL)
    access_token = _get(db, _KEY_ACCESS_TOKEN)
    refresh_token = _get(db, _KEY_REFRESH_TOKEN)
    if not base or not access_token:
        return {"synced": False, "reason": "not signed in"}

    def _auth_headers() -> dict:
        return {"Authorization": f"Bearer {access_token}"}

    def _request(method: str, url: str, **kwargs) -> httpx.Response:
        nonlocal access_token
        r = httpx.request(method, url, headers=_auth_headers(), timeout=_HTTP_TIMEOUT, **kwargs)
        if r.status_code == 401 and refresh_token:
            new_token = _refresh_token(db, base, refresh_token)
            if new_token:
                access_token = new_token
                r = httpx.request(method, url, headers=_auth_headers(), timeout=_HTTP_TIMEOUT, **kwargs)
        return r

    # --- PUSH: local changes since our last successful push ---
    last_push_at_raw = _get(db, _KEY_LAST_PUSH_AT)
    last_push_at = datetime.fromisoformat(last_push_at_raw) if last_push_at_raw else None
    outgoing = pull_changes(db, LOCAL_USER_ID, last_push_at)  # "changes since X" — reused for gathering, not serving
    pushed_count = sum(len(rows) for rows in outgoing.values())

    try:
        push_resp = _request("POST", f"{base}/api/v1/sync/push", json={"tables": outgoing})
    except httpx.HTTPError as e:
        log.warning("Sync push failed: %s", e)
        return {"synced": False, "reason": f"push failed: {e}"}
    if push_resp.status_code != 200:
        return {"synced": False, "reason": f"push failed ({push_resp.status_code})"}
    push_result = push_resp.json()
    _set(db, _KEY_LAST_PUSH_AT, push_result["server_time"])

    # --- PULL: remote changes since our last successful pull ---
    last_pull_at = _get(db, _KEY_LAST_PULL_AT)
    try:
        pull_resp = _request("GET", f"{base}/api/v1/sync/pull", params={"since": last_pull_at} if last_pull_at else {})
    except httpx.HTTPError as e:
        log.warning("Sync pull failed: %s", e)
        db.commit()  # keep the push bookkeeping even if pull fails
        return {"synced": False, "reason": f"pull failed: {e}"}
    if pull_resp.status_code != 200:
        db.commit()
        return {"synced": False, "reason": f"pull failed ({pull_resp.status_code})"}
    pull_result = pull_resp.json()
    incoming = pull_result.get("tables", {})
    pulled_count = sum(len(rows) for rows in incoming.values())

    merge_result = push_changes(db, LOCAL_USER_ID, incoming)  # apply cloud rows into the LOCAL db
    _set(db, _KEY_LAST_PULL_AT, pull_result["server_time"])
    db.commit()

    return {
        "synced": True,
        "pushed": pushed_count,
        "pulled": pulled_count,
        "applied_locally": merge_result["applied"],
        "conflicts_resolved": merge_result["conflicts_resolved"] + push_result.get("conflicts_resolved", 0),
    }
