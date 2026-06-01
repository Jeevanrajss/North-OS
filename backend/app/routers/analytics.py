"""Analytics router — cross-module pattern endpoints."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
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


@router.get("/correlations", response_model=CorrelationsResponse)
def correlations(
    days: int = Query(default=30, ge=7, le=365),
    db: Session = Depends(get_db),
):
    """Return cross-module correlation data for the last N days."""
    return get_correlations(db, days=days)


@router.get("/snapshots")
def snapshots(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Return raw daily snapshots for charting on the frontend."""
    from app.models.analytics import AnalyticsSnapshot

    if not from_date:
        from_date = date.today() - timedelta(days=30)
    if not to_date:
        to_date = date.today()

    rows = (
        db.query(AnalyticsSnapshot)
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
    db: Session = Depends(get_db),
):
    """Manually trigger a backfill. Exposed for the Settings UI / testing."""
    count = backfill_snapshots(db, days=days)
    return {"processed": count}


@router.post("/compute-today")
def compute_today(db: Session = Depends(get_db)):
    """Recompute today's snapshot on demand."""
    compute_snapshot_for_date(db, date.today())
    return {"ok": True, "date": date.today().isoformat()}
