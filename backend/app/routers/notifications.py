from __future__ import annotations
import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session
from app.db import get_db
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
def unread_count(db: Session = Depends(get_db)) -> dict:
    count = db.query(Notification).filter(Notification.read == False).count()  # noqa: E712
    return {"count": count}


@router.get("/")
def list_notifications(limit: int = 50, db: Session = Depends(get_db)) -> list[NotificationOut]:
    rows = (db.query(Notification)
            .order_by(Notification.read.asc(), desc(Notification.created_at))
            .limit(limit).all())
    return [_out(n) for n in rows]


@router.post("/{notif_id}/read")
def mark_read(notif_id: str, db: Session = Depends(get_db)) -> dict:
    n = db.get(Notification, notif_id)
    if not n:
        raise HTTPException(404, "Not found")
    n.read = True
    db.commit()
    return {"ok": True}


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db)) -> dict:
    db.query(Notification).filter(Notification.read == False).update({"read": True})  # noqa: E712
    db.commit()
    return {"ok": True}


@router.delete("/clear-read")
def clear_read(db: Session = Depends(get_db)) -> dict:
    db.query(Notification).filter(Notification.read == True).delete()  # noqa: E712
    db.commit()
    return {"ok": True}


@router.delete("/{notif_id}")
def delete_notification(notif_id: str, db: Session = Depends(get_db)) -> dict:
    n = db.get(Notification, notif_id)
    if not n:
        raise HTTPException(404, "Not found")
    db.delete(n)
    db.commit()
    return {"ok": True}


# ── Manual trigger endpoints (for testing / Settings UI) ──────────────────────
@router.post("/trigger/habit-check")
def trigger_habit_check(db: Session = Depends(get_db)) -> dict:
    from app.services.notification_service import check_habit_reminders
    count = check_habit_reminders(db)
    return {"created": count}


@router.post("/trigger/sub-check")
def trigger_sub_check(db: Session = Depends(get_db)) -> dict:
    from app.services.notification_service import check_subscription_alerts
    count = check_subscription_alerts(db)
    return {"created": count}


@router.post("/trigger/morning-briefing")
def trigger_morning_briefing(db: Session = Depends(get_db)) -> dict:
    from app.services.notification_service import check_morning_briefing
    count = check_morning_briefing(db)
    return {"created": count}


@router.post("/trigger/budget-check")
def trigger_budget_check(db: Session = Depends(get_db)) -> dict:
    from app.services.notification_service import check_budget_warnings
    count = check_budget_warnings(db)
    return {"created": count}


@router.post("/trigger/weekly-review")
def trigger_weekly_review(db: Session = Depends(get_db)) -> dict:
    """Manual trigger for the weekly AI review. Useful for testing or ad-hoc generation."""
    from app.services.notification_service import generate_weekly_review
    notif = generate_weekly_review(db)
    if notif:
        return {"created": True, "body": notif.body}
    return {"created": False, "reason": "AI unavailable or already sent this week"}


@router.post("/reschedule")
def reschedule(db: Session = Depends(get_db)) -> dict:
    from app.scheduler import reschedule_jobs
    try:
        reschedule_jobs()
    except Exception as e:
        log.warning("Reschedule failed: %s", e)
    return {"ok": True}
