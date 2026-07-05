"""App error log router.

Clients (frontend) POST errors here with a structured payload.
Errors are stored in a rotating in-memory ring buffer AND written to
{data_dir}/north-os-errors.log so they survive restarts.

Error code format:  <MODULE>-<4-digit-number>
  UI-0001   React unhandled exception
  UI-0002   API fetch failed (frontend)
  UI-0003   React Query mutation failed
  SMS-0001  iMessage scan failed
  SMS-0002  HTTP SMS sync failed
  AI-0001   LLM request failed
  CFG-0001  Settings save failed
"""
from __future__ import annotations

import json
import logging
import os
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.services.auth_service import get_current_user

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/logs", tags=["logs"])

# ── In-memory ring buffer (last 200 errors survive until next restart) ────────
_ERROR_RING: deque[dict] = deque(maxlen=200)

# ── Log file path (persists across restarts) ──────────────────────────────────
def _log_path() -> Path | None:
    data_dir = os.environ.get("PERSONAL_OS_DATA_DIR", "")
    if data_dir:
        return Path(data_dir) / "north-os-errors.log"
    # Dev mode: write next to the DB
    from app.config import get_settings
    try:
        db_path = Path(get_settings().db_path)
        return db_path.parent / "north-os-errors.log"
    except Exception:
        return None


# ── Schemas ───────────────────────────────────────────────────────────────────

class ErrorLogIn(BaseModel):
    error_code: str = Field(..., description="e.g. UI-0001")
    message: str
    stack: str | None = None
    context: dict[str, Any] | None = None   # extra key-value metadata
    url: str | None = None                   # page URL where error occurred
    user_agent: str | None = None


class ErrorLogOut(BaseModel):
    id: int
    ts: str
    error_code: str
    message: str
    stack: str | None
    context: dict | None
    url: str | None


# ── Internal writer ───────────────────────────────────────────────────────────

_counter = 0

def _store_error(payload: dict) -> int:
    global _counter
    _counter += 1
    entry = {"id": _counter, "ts": datetime.utcnow().isoformat(), **payload}
    _ERROR_RING.append(entry)

    # Write to file (best-effort)
    p = _log_path()
    if p:
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            with p.open("a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except Exception:
            pass

    log.warning("[%s] %s | %s", entry["ts"], payload.get("error_code"), payload.get("message"))
    return _counter


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/error", status_code=201)
def log_error(body: ErrorLogIn):
    """Frontend posts client-side errors here."""
    entry_id = _store_error(body.model_dump())
    return {"logged": True, "id": entry_id, "error_code": body.error_code}


@router.get("/errors", response_model=list[ErrorLogOut])
def get_errors(
    limit: int = Query(default=50, ge=1, le=200),
    error_code: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    """Return recent errors, newest first. Filter by error_code prefix optionally."""
    entries = list(reversed(list(_ERROR_RING)))
    if error_code:
        entries = [e for e in entries if e.get("error_code", "").startswith(error_code)]
    return entries[:limit]


@router.delete("/errors", status_code=204)
def clear_errors(current_user: User = Depends(get_current_user)):
    """Clear the in-memory error ring (does not clear the log file)."""
    _ERROR_RING.clear()


@router.get("/file")
def get_log_file_tail(
    lines: int = Query(default=100, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
):
    """Return the last N lines of the error log file as raw NDJSON."""
    p = _log_path()
    if not p or not p.exists():
        return {"available": False, "path": str(p) if p else None, "lines": []}
    try:
        with p.open("r", encoding="utf-8") as f:
            all_lines = f.readlines()
        tail = all_lines[-lines:]
        return {
            "available": True,
            "path": str(p),
            "total_lines": len(all_lines),
            "returned": len(tail),
            "lines": [json.loads(l) for l in tail if l.strip()],
        }
    except Exception as e:
        return {"available": True, "path": str(p), "error": str(e), "lines": []}
