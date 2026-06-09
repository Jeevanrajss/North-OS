"""Financial goals router — personal financial targets with timeline and linked investments."""
from __future__ import annotations

import json
import logging
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.financial_goal import FinancialGoal
from app.models.investment import Investment

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/finance/goals", tags=["financial_goals"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class FinancialGoalIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    emoji: str = "🎯"
    goal_type: str = "purchase"
    timeline: str = "medium"
    target_amount: float = Field(..., gt=0)
    current_amount: float = 0.0
    target_date: date | None = None
    priority: int = 2
    currency: str = "INR"
    linked_investment_ids: list[str] | None = None
    notes: str | None = None
    sort_order: int = 0


class FinancialGoalPatch(BaseModel):
    title: str | None = None
    emoji: str | None = None
    goal_type: str | None = None
    timeline: str | None = None
    target_amount: float | None = None
    current_amount: float | None = None
    target_date: date | None = None
    priority: int | None = None
    linked_investment_ids: list[str] | None = None
    notes: str | None = None
    status: str | None = None
    sort_order: int | None = None


def _compute_progress(goal: FinancialGoal, db: Session) -> dict[str, Any]:
    today = date.today()

    # Auto-compute current_amount from linked investments if any
    linked = goal.linked_ids()
    current = goal.current_amount
    if linked:
        invs = db.query(Investment).filter(Investment.id.in_(linked)).all()
        current = round(sum(i.total_invested for i in invs), 2)

    progress_pct = min(100.0, round(current / goal.target_amount * 100, 1)) if goal.target_amount > 0 else 0.0

    days_remaining: int | None = None
    monthly_needed: float | None = None
    is_on_track = False

    if goal.target_date:
        diff = (goal.target_date - today).days
        days_remaining = max(0, diff)
        months_remaining = max(1, diff // 30)
        gap = goal.target_amount - current
        monthly_needed = round(max(0.0, gap / months_remaining), 2)

        # Check if investments this month >= monthly_needed
        if monthly_needed > 0 and linked:
            month_start = today.replace(day=1)
            from app.models.investment_entry import InvestmentEntry
            invested_this_month = db.execute(
                __import__("sqlalchemy").select(__import__("sqlalchemy").func.sum(InvestmentEntry.amount))
                .where(InvestmentEntry.investment_id.in_(linked))
                .where(InvestmentEntry.entry_date >= month_start)
            ).scalar() or 0.0
            is_on_track = invested_this_month >= monthly_needed

    return {
        "computed_current": current,
        "progress_pct": progress_pct,
        "days_remaining": days_remaining,
        "monthly_needed": monthly_needed,
        "is_on_track": is_on_track,
    }


def _goal_out(goal: FinancialGoal, db: Session) -> dict[str, Any]:
    progress = _compute_progress(goal, db)
    return {
        "id": goal.id, "title": goal.title, "emoji": goal.emoji,
        "goal_type": goal.goal_type, "timeline": goal.timeline,
        "target_amount": goal.target_amount, "current_amount": progress["computed_current"],
        "target_date": goal.target_date.isoformat() if goal.target_date else None,
        "priority": goal.priority, "currency": goal.currency,
        "linked_investment_ids": goal.linked_ids(),
        "notes": goal.notes, "status": goal.status, "sort_order": goal.sort_order,
        "created_at": goal.created_at.isoformat(), "updated_at": goal.updated_at.isoformat(),
        # Computed
        "progress_pct": progress["progress_pct"],
        "days_remaining": progress["days_remaining"],
        "monthly_needed": progress["monthly_needed"],
        "is_on_track": progress["is_on_track"],
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
def list_goals(db: Session = Depends(get_db)):
    goals = db.query(FinancialGoal).filter(FinancialGoal.status != "paused").order_by(
        FinancialGoal.priority, FinancialGoal.sort_order
    ).all()
    return [_goal_out(g, db) for g in goals]


@router.post("", status_code=201)
def create_goal(body: FinancialGoalIn, db: Session = Depends(get_db)):
    data = body.model_dump()
    linked = data.pop("linked_investment_ids", None) or []
    goal = FinancialGoal(**data, linked_investment_ids=json.dumps(linked) if linked else None)
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _goal_out(goal, db)


@router.patch("/{goal_id}")
def patch_goal(goal_id: str, body: FinancialGoalPatch, db: Session = Depends(get_db)):
    goal = db.get(FinancialGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Financial goal not found")
    data = body.model_dump(exclude_unset=True)
    if "linked_investment_ids" in data:
        ids = data.pop("linked_investment_ids") or []
        goal.linked_investment_ids = json.dumps(ids) if ids else None
    for k, v in data.items():
        setattr(goal, k, v)
    db.commit()
    db.refresh(goal)
    return _goal_out(goal, db)


@router.delete("/{goal_id}", status_code=204)
def archive_goal(goal_id: str, db: Session = Depends(get_db)):
    goal = db.get(FinancialGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Financial goal not found")
    goal.status = "paused"
    db.commit()


@router.post("/{goal_id}/achieve")
def achieve_goal(goal_id: str, db: Session = Depends(get_db)):
    goal = db.get(FinancialGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Financial goal not found")
    goal.status = "achieved"
    db.commit()
    db.refresh(goal)
    return _goal_out(goal, db)
