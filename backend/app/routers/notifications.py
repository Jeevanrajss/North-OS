from __future__ import annotations
import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session
from app.db import get_db
from app.models.user import User
from app.services.auth_service import get_current_user
from app.models.notification import Notification

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    body: str
    data: dict[str, Any]
    read: bool
    created_at: str
    model_config = {"from_attributes": True}


def _out(n: Notification) -> NotificationOut:
    # SQLite stores func.now() as UTC but the datetime object is naive (no tzinfo).
    # Appending "Z" (≡ +00:00) ensures the browser parses it correctly instead of
    # treating it as local time, which would show e.g. "5h ago" for IST users.
    if n.created_at:
        ts = n.created_at.isoformat()
        if not ts.endswith("Z") and "+" not in ts:
            ts += "Z"
    else:
        ts = ""
    return NotificationOut(
        id=n.id, type=n.type, title=n.title, body=n.body,
        data=n.data_dict(), read=n.read,
        created_at=ts,
    )


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    count = db.query(Notification).filter(Notification.user_id == current_user.id).filter(Notification.read == False).count()  # noqa: E712
    return {"count": count}


@router.get("/")
def list_notifications(limit: int = 50, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[NotificationOut]:
    rows = (db.query(Notification).filter(Notification.user_id == current_user.id)
            .order_by(Notification.read.asc(), desc(Notification.created_at))
            .limit(limit).all())
    return [_out(n) for n in rows]


@router.post("/{notif_id}/read")
def mark_read(notif_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    n = db.get(Notification, notif_id)
    if not n:
        raise HTTPException(404, "Not found")
    n.read = True
    db.commit()
    return {"ok": True}


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    db.query(Notification).filter(Notification.user_id == current_user.id).filter(Notification.read == False).update({"read": True})  # noqa: E712
    db.commit()
    return {"ok": True}


@router.delete("/clear-read")
def clear_read(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    db.query(Notification).filter(Notification.user_id == current_user.id).filter(Notification.read == True).delete()  # noqa: E712
    db.commit()
    return {"ok": True}


@router.delete("/{notif_id}")
def delete_notification(notif_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    n = db.get(Notification, notif_id)
    if not n:
        raise HTTPException(404, "Not found")
    db.delete(n)
    db.commit()
    return {"ok": True}


# ── Manual trigger endpoints (for testing / Settings UI) ──────────────────────
@router.post("/trigger/habit-check")
def trigger_habit_check(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    """Manual trigger — bypasses de-dup so a fresh notification is always created."""
    from app.services.notification_service import check_habit_reminders
    count = check_habit_reminders(db, force=True, user_id=current_user.id)
    return {"created": count}


@router.post("/trigger/sub-check")
def trigger_sub_check(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    """Manual trigger — bypasses per-sub daily de-dup."""
    from app.services.notification_service import check_subscription_alerts
    count = check_subscription_alerts(db, force=True, user_id=current_user.id)
    return {"created": count}


@router.post("/trigger/morning-briefing")
def trigger_morning_briefing(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    """Manual trigger — deletes today's existing briefing and creates a fresh one."""
    from app.services.notification_service import check_morning_briefing
    count = check_morning_briefing(db, force=True, user_id=current_user.id)
    return {"created": count}


@router.post("/trigger/budget-check")
def trigger_budget_check(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    """Manual trigger — bypasses monthly de-dup."""
    from app.services.notification_service import check_budget_warnings
    count = check_budget_warnings(db, force=True, user_id=current_user.id)
    return {"created": count}


@router.post("/trigger/finance-advisor")
async def trigger_finance_advisor(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    """Manual trigger for the Finance Advisor. Returns the advice if successful."""
    from app.routers.finance_advisor import _build_finance_context, ADVISOR_SYSTEM
    from app.services.llm_client import generate, LLMError
    from app.services.notification_service import create_notification
    context = await _build_finance_context(db, user_id=current_user.id)
    try:
        response = await generate(context, purpose="insights", system=ADVISOR_SYSTEM,
                                   temperature=0.4, max_tokens=600, user_id=current_user.id)
        if response:
            create_notification(db=db, type="finance_advisor",
                                title="Your finance check-in 💰",
                                body=response.strip(), skip_quiet=True,
                                user_id=current_user.id)
        return {"created": bool(response), "advice": response}
    except LLMError as e:
        return {"created": False, "reason": str(e)}


@router.post("/trigger/weekly-review")
def trigger_weekly_review(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    """Manual trigger for the weekly AI review. Useful for testing or ad-hoc generation."""
    from app.services.notification_service import generate_weekly_review
    notif = generate_weekly_review(db, user_id=current_user.id)
    if notif:
        return {"created": True, "body": notif.body}
    return {"created": False, "reason": "AI unavailable or already sent this week"}


@router.post("/reschedule")
def reschedule(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    from app.scheduler import reschedule_jobs
    try:
        reschedule_jobs()
    except Exception as e:
        log.warning("Reschedule failed: %s", e)
    return {"ok": True}
