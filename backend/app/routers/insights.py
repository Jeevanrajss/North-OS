"""Insights router — daily rule-based insight + weekly summary (Phase 11b).

Endpoints (all prefixed /api/v1/insights):
  GET /daily            today's insight, cached per user per day
  GET /weekly-summary   habits/spend/insights for the last 7 days
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.finance import Transaction
from app.models.habit import Habit, HabitCheckin
from app.models.setting import Setting
from app.models.user import User
from app.services.auth_service import get_current_user
from app.services.insight_engine import InsightEngine

router = APIRouter(prefix="/api/v1/insights", tags=["insights"])

_CACHE_KEY = "insights.daily_cache"


def get_daily_insight_cached(db: Session, user_id: str) -> dict:
    """Shared by the /daily endpoint and the 6 AM scheduler job — returns
    today's cached insight, generating + caching it if missing or stale."""
    today_iso = date.today().isoformat()
    row = db.query(Setting).filter(Setting.key == _CACHE_KEY, Setting.user_id == user_id).first()
    if row and row.value:
        try:
            cached = json.loads(row.value)
            if cached.get("generated_at", "").startswith(today_iso):
                return cached
        except (json.JSONDecodeError, TypeError):
            pass

    insight = InsightEngine().generate_daily_insight(user_id, db)
    insight["generated_at"] = datetime.now().isoformat()

    if row is None:
        row = Setting(key=_CACHE_KEY, user_id=user_id)
        db.add(row)
    row.value = json.dumps(insight)
    db.commit()
    return insight


@router.get("/daily")
def daily_insight(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_daily_insight_cached(db, current_user.id)


@router.get("/weekly-summary")
def weekly_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = date.today()
    week_start = today - timedelta(days=today.weekday())  # Monday
    week_end = week_start + timedelta(days=6)

    habits = (
        db.query(Habit)
        .filter(Habit.user_id == current_user.id, Habit.archived_at.is_(None))
        .all()
    )
    habit_ids = [h.id for h in habits]
    checkins = (
        db.query(HabitCheckin)
        .filter(
            HabitCheckin.habit_id.in_(habit_ids),
            HabitCheckin.day_date >= week_start,
            HabitCheckin.day_date <= min(week_end, today),
        )
        .all()
        if habit_ids
        else []
    )
    any_done_days = {c.day_date for c in checkins}
    days_elapsed = (min(week_end, today) - week_start).days + 1
    habits_days_done = len(any_done_days)

    txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.date >= week_start,
            Transaction.date <= min(week_end, today),
        )
        .all()
    )
    spent = sum(t.amount for t in txns if t.type == "expense")
    income = sum(t.amount for t in txns if t.type == "income")
    saved = income - spent

    cat_spend: dict[str, float] = {}
    for t in txns:
        if t.type != "expense":
            continue
        cat = t.category or "Other"
        cat_spend[cat] = cat_spend.get(cat, 0.0) + t.amount
    top_category = max(cat_spend.items(), key=lambda kv: kv[1]) if cat_spend else None

    insight = get_daily_insight_cached(db, current_user.id)

    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "habits_days_done": habits_days_done,
        "habits_days_total": days_elapsed,
        "spent": round(spent, 2),
        "saved": round(saved, 2),
        "top_category": {"category": top_category[0], "amount": round(top_category[1], 2)} if top_category else None,
        "insights": [insight["insight_text"]],
    }
