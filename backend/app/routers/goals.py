"""Goals / OKRs router."""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.goal import Goal
from app.schemas.goal import GoalIn, GoalOut, GoalPatch

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/goals", tags=["goals"])


# ---------------------------------------------------------------------------
# Progress computation
# ---------------------------------------------------------------------------

def _compute_progress(goal: Goal, db: Session) -> dict[str, Any]:
    """
    Returns a dict with:
      progress_pct      float | None   0–100
      computed_current  float | None   live computed value
      linked_missing    bool
    """
    progress_pct: float | None = None
    computed_current: float | None = None
    linked_missing = False

    if goal.goal_type == "habit_streak":
        from app.models.habit import Habit, HabitCheckin
        habit = db.get(Habit, goal.linked_id) if goal.linked_id else None
        if not habit:
            linked_missing = bool(goal.linked_id)
        else:
            # Compute current streak using the same schedule-aware logic as habit.py
            today = date.today()
            start = today - timedelta(days=365)  # search up to a year back
            checkins = db.query(HabitCheckin).filter(
                HabitCheckin.habit_id == habit.id,
                HabitCheckin.day_date >= start,
            ).all()
            done_days: set[date] = {c.day_date for c in checkins}

            if habit.frequency_kind == "weekly":
                weekdays_raw = habit.weekdays or ""
                wd_set = {int(x) for x in weekdays_raw.split(",") if x.strip()}
                is_scheduled = (lambda d: d.weekday() in wd_set) if wd_set else (lambda _: True)
            else:
                is_scheduled = lambda _: True

            streak = 0
            probe = today
            while probe >= start:
                if is_scheduled(probe):
                    if probe in done_days:
                        streak += 1
                    else:
                        break
                probe -= timedelta(days=1)

            computed_current = float(streak)
            if goal.target_value and goal.target_value > 0:
                progress_pct = min(100.0, round(streak / goal.target_value * 100, 1))

    elif goal.goal_type == "habit_rate":
        from app.models.habit import Habit, HabitCheckin
        habit = db.get(Habit, goal.linked_id) if goal.linked_id else None
        if not habit:
            linked_missing = bool(goal.linked_id)
        else:
            period = goal.target_period_days or 30
            today = date.today()
            start = today - timedelta(days=period - 1)
            checkins = db.query(HabitCheckin).filter(
                HabitCheckin.habit_id == habit.id,
                HabitCheckin.day_date >= start,
            ).all()
            done_days: set[date] = {c.day_date for c in checkins}

            # Count scheduled days and done days
            if habit.frequency_kind == "weekly":
                wd_set = {int(x) for x in (habit.weekdays or "").split(",") if x.strip()}
                is_scheduled = (lambda d: d.weekday() in wd_set) if wd_set else (lambda _: True)
            else:
                is_scheduled = lambda _: True

            scheduled = sum(1 for i in range(period) if is_scheduled(start + timedelta(days=i)))
            done = sum(1 for d in done_days if start <= d <= today)
            actual_rate = done / max(scheduled, 1)
            computed_current = round(actual_rate * 100, 1)

            if goal.target_value and goal.target_value > 0:
                target_rate = goal.target_value / 100.0
                progress_pct = min(100.0, round(actual_rate / target_rate * 100, 1))

    elif goal.goal_type == "finance_save":
        from app.models.finance import Transaction
        txns = db.query(Transaction).filter(
            Transaction.type == "income",
            Transaction.date >= goal.created_at.date() if goal.created_at else date(2000, 1, 1),
        ).all()
        total_saved = sum(t.amount for t in txns)
        computed_current = round(total_saved, 2)
        if goal.target_value and goal.target_value > 0:
            progress_pct = min(100.0, round(total_saved / goal.target_value * 100, 1))

    elif goal.goal_type == "finance_spend":
        from app.models.finance import Transaction
        today = date.today()
        month_start = today.replace(day=1)
        category_filter = goal.linked_id  # linked_id holds the category name
        query = db.query(Transaction).filter(
            Transaction.type == "expense",
            Transaction.date >= month_start,
        )
        if category_filter:
            query = query.filter(Transaction.category == category_filter)
        total_spent = sum(t.amount for t in query.all())
        computed_current = round(total_spent, 2)
        if goal.target_value and goal.target_value > 0:
            # Inverse: less spent = better progress (spending within limit)
            progress_pct = max(0.0, min(100.0, round((1 - total_spent / goal.target_value) * 100, 1)))

    else:  # custom
        computed_current = goal.current_value
        if goal.target_value and goal.target_value > 0 and goal.current_value is not None:
            progress_pct = min(100.0, round(goal.current_value / goal.target_value * 100, 1))

    return {
        "progress_pct": progress_pct,
        "computed_current": computed_current,
        "linked_missing": linked_missing,
    }


def _build_out(goal: Goal, db: Session) -> GoalOut:
    today = date.today()
    progress = _compute_progress(goal, db)

    days_remaining: int | None = None
    overdue = False
    if goal.target_date:
        diff = (goal.target_date - today).days
        if diff >= 0:
            days_remaining = diff
        elif goal.status == "active":
            overdue = True

    out = GoalOut.model_validate(goal)
    out.progress_pct = progress["progress_pct"]
    out.computed_current = progress["computed_current"]
    out.linked_missing = progress["linked_missing"]
    out.days_remaining = days_remaining
    out.overdue = overdue
    return out


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[GoalOut])
def list_goals(
    status: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Goal).filter(Goal.archived_at.is_(None))
    if status:
        q = q.filter(Goal.status == status)
    else:
        q = q.filter(Goal.status != "abandoned")
    goals = q.order_by(Goal.sort_order, Goal.created_at).all()
    return [_build_out(g, db) for g in goals]


@router.post("/", response_model=GoalOut, status_code=201)
def create_goal(body: GoalIn, db: Session = Depends(get_db)):
    goal = Goal(**body.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _build_out(goal, db)


@router.get("/{goal_id}", response_model=GoalOut)
def get_goal(goal_id: str, db: Session = Depends(get_db)):
    goal = db.get(Goal, goal_id)
    if not goal or goal.archived_at:
        raise HTTPException(status_code=404, detail="Goal not found")
    return _build_out(goal, db)


@router.patch("/{goal_id}", response_model=GoalOut)
def patch_goal(goal_id: str, body: GoalPatch, db: Session = Depends(get_db)):
    goal = db.get(Goal, goal_id)
    if not goal or goal.archived_at:
        raise HTTPException(status_code=404, detail="Goal not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(goal, k, v)
    db.commit()
    db.refresh(goal)
    return _build_out(goal, db)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: str, db: Session = Depends(get_db)):
    goal = db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    from datetime import datetime
    goal.archived_at = datetime.utcnow()
    db.commit()


@router.post("/{goal_id}/complete", response_model=GoalOut)
def complete_goal(goal_id: str, db: Session = Depends(get_db)):
    goal = db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    goal.status = "completed"
    db.commit()
    db.refresh(goal)
    return _build_out(goal, db)


@router.post("/{goal_id}/abandon", response_model=GoalOut)
def abandon_goal(goal_id: str, db: Session = Depends(get_db)):
    goal = db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    goal.status = "abandoned"
    db.commit()
    db.refresh(goal)
    return _build_out(goal, db)
