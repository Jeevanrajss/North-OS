"""Settings router — AI provider configuration."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.services.auth_service import get_current_user
from app.models.setting import Setting
from app.schemas.setting import (
    PROVIDER_PRESETS,
    LLMHealthResult,
    LLMTestResult,
    SettingsBulkUpdate,
)
from app.services import llm_client
from app.services.llm_client import LLMError
from app.scheduler import reschedule_jobs

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])

# Keys we persist (prefix "ai.")
AI_KEYS = {"provider", "api_base", "api_key", "chat_model", "fast_model", "embed_model", "is_anthropic"}


# ---------------------------------------------------------------------------
# GET /settings — return all stored settings (API key masked)
# ---------------------------------------------------------------------------
@router.get("")
def get_settings_all(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(Setting).filter(Setting.user_id == current_user.id).all()
    result: dict[str, str] = {r.key: (r.value or "") for r in rows}
    # Mask key for transport
    if "ai.api_key" in result and result["ai.api_key"]:
        result["ai.api_key"] = "•" * 12  # masked
    return result


# ---------------------------------------------------------------------------
# GET /settings/providers — provider catalog (for the frontend picker)
# ---------------------------------------------------------------------------
@router.get("/providers")
def get_providers():
    return PROVIDER_PRESETS


# ---------------------------------------------------------------------------
# PUT /settings — bulk upsert
# ---------------------------------------------------------------------------
@router.put("")
def update_settings(body: SettingsBulkUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    for key, value in body.settings.items():
        # Don't overwrite existing API key with a masked placeholder
        if key == "ai.api_key" and set(value) <= {"•"}:
            continue
        row = db.get(Setting, key)
        if row:
            row.value = value  # type: ignore[assignment]
        else:
            db.add(Setting(key=key, value=value))
    db.commit()
    # Invalidate LLM client cache so next call reads fresh config
    llm_client.invalidate_config_cache()
    # Re-apply notification schedule if any timing key changed
    NOTIF_TIME_KEYS = {
        "notif.morning_briefing_time",
        "notif.habit_reminder_time",
        "notif.sub_alert_time",
    }
    if NOTIF_TIME_KEYS & set(body.settings.keys()):
        reschedule_jobs()
    return {"ok": True}


# ---------------------------------------------------------------------------
# POST /settings/test-llm — fire one real request with current config
# ---------------------------------------------------------------------------
@router.post("/test-llm", response_model=LLMTestResult)
async def test_llm(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Send a trivial prompt with the currently configured provider/model."""
    llm_client.invalidate_config_cache()  # force fresh load
    cfg = llm_client._load_config()
    provider = cfg.get("provider", "local")
    model = cfg.get("chat_model", "")

    try:
        response = await llm_client.generate(
            "Reply with exactly: 'North OS connected.'",
            purpose="chat",
            temperature=0.0,
            max_tokens=32,
        )
        return LLMTestResult(ok=True, provider=provider, model=model, response=response, error=None)
    except LLMError as e:
        return LLMTestResult(ok=False, provider=provider, model=model, response=None, error=str(e))


# ---------------------------------------------------------------------------
# GET /settings/health — fast reachability probe (5 s timeout)
# ---------------------------------------------------------------------------
@router.get("/health", response_model=LLMHealthResult)
async def llm_health():
    """Quick connectivity probe used by the Settings UI on load.
    Returns in ≤5 s — much faster than test-llm which runs a full generation."""
    result = await llm_client.quick_health()
    return result


# ---------------------------------------------------------------------------
# GET /settings/models — live model list from current provider
# ---------------------------------------------------------------------------
@router.get("/models")
async def get_models():
    try:
        models = await llm_client.list_models()
        return {"models": models}
    except LLMError as e:
        return {"models": [], "error": str(e)}
