"""Analytics router — cross-module pattern endpoints."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.services.auth_service import get_current_user
from app.services.analytics_engine import (
    backfill_snapshots,
    compute_snapshot_for_date,
    get_correlations,
)

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


class CorrelationsResponse(BaseModel):
    days_analysed: int
    avg_mood_score: float | None
    avg_habit_completion: float | None
    avg_daily_expense: float | None
    low_mood_days: int
    high_mood_days: int
    zero_habit_days: int
    perfect_habit_days: int
    mood_vs_habit_completion: dict | None
    expense_vs_mood: dict | None
    journal_habit_correlation: dict | None
    sleep_vs_mood: dict | None
    best_day_of_week: dict | None
    worst_day_of_week: dict | None


@router.get("/daily-summary")
def daily_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Lightweight summary for the mobile morning-briefing notification
    (Phase 11a). Pulls from existing transactions + habits — no new tables."""
    from app.models.finance import Transaction
    from app.models.habit import Habit, HabitCheckin
    from app.routers.habit import _schedule_fn_for

    today = date.today()
    yesterday = today - timedelta(days=1)

    yesterday_spend = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.type == "expense",
            Transaction.date == yesterday,
        )
        .all()
    )
    total_yesterday = sum(t.amount for t in yesterday_spend)

    habits = (
        db.query(Habit)
        .filter(Habit.user_id == current_user.id, Habit.archived_at.is_(None))
        .all()
    )
    due_today = [h for h in habits if _schedule_fn_for(h)(today)]

    window_days = 365
    start = today - timedelta(days=window_days - 1)
    habit_ids = [h.id for h in habits]
    any_done_days: set = set()
    done_today_ids: set = set()
    if habit_ids:
        checkins = (
            db.query(HabitCheckin)
            .filter(
                HabitCheckin.habit_id.in_(habit_ids),
                HabitCheckin.day_date >= start,
                HabitCheckin.day_date <= today,
            )
            .all()
        )
        any_done_days = {c.day_date for c in checkins}
        done_today_ids = {c.habit_id for c in checkins if c.day_date == today}

    current_streak = 0
    probe = today
    while probe >= start and probe in any_done_days:
        current_streak += 1
        probe -= timedelta(days=1)

    today_complete = all(h.id in done_today_ids for h in due_today) if due_today else True

    return {
        "yesterday_spend": round(total_yesterday, 2),
        "habits_due_today": len(due_today),
        "today_complete": today_complete,
        "current_streak": current_streak,
    }


@router.get("/correlations", response_model=CorrelationsResponse)
def correlations(
    days: int = Query(default=30, ge=7, le=365),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Return cross-module correlation data for the last N days."""
    return get_correlations(db, days=days, user_id=current_user.id)


@router.get("/snapshots")
def snapshots(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Return raw daily snapshots for charting on the frontend."""
    from app.models.analytics import AnalyticsSnapshot

    if not from_date:
        from_date = date.today() - timedelta(days=30)
    if not to_date:
        to_date = date.today()

    rows = (
        db.query(AnalyticsSnapshot).filter(AnalyticsSnapshot.user_id == current_user.id)
        .filter(
            AnalyticsSnapshot.computed_date >= from_date,
            AnalyticsSnapshot.computed_date <= to_date,
        )
        .order_by(AnalyticsSnapshot.computed_date.asc())
        .all()
    )

    return [
        {
            "date": r.computed_date.isoformat(),
            "mood_score": r.mood_score,
            "habit_completion_rate": r.habit_completion_rate,
            "daily_expense": r.daily_expense,
            "daily_income": r.daily_income,
            "journal_written": r.journal_written,
            "habits_done": r.habits_done_count,
            "habits_scheduled": r.habits_scheduled_count,
            "sleep_hours": r.sleep_hours,
            "energy_level": r.energy_level,
        }
        for r in rows
    ]


@router.post("/backfill")
def trigger_backfill(
    days: int = Query(default=90, ge=1, le=365),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Manually trigger a backfill. Exposed for the Settings UI / testing."""
    count = backfill_snapshots(db, days=days, user_id=current_user.id)
    return {"processed": count}


@router.post("/compute-today")
def compute_today(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Recompute today's snapshot on demand."""
    compute_snapshot_for_date(db, date.today(), user_id=current_user.id)
    return {"ok": True, "date": date.today().isoformat()}
