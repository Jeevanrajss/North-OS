"""Goal schemas."""
from __future__ import annotations

from datetime import date, datetime
from pydantic import BaseModel, Field

GOAL_TYPES = ["habit_streak", "habit_rate", "finance_save", "finance_spend", "custom"]
GOAL_STATUSES = ["active", "completed", "paused", "abandoned"]


class GoalIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    emoji: str = "🎯"
    goal_type: str = "custom"
    linked_id: str | None = None
    linked_label: str | None = None
    target_value: float | None = None
    target_period_days: int | None = None
    currency: str = "INR"
    current_value: float | None = None
    target_date: date | None = None
    sort_order: int = 0


class GoalPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    emoji: str | None = None
    target_value: float | None = None
    target_period_days: int | None = None
    current_value: float | None = None
    target_date: date | None = None
    status: str | None = None
    sort_order: int | None = None


class GoalOut(BaseModel):
    id: str
    title: str
    description: str | None
    emoji: str
    goal_type: str
    linked_id: str | None
    linked_label: str | None
    target_value: float | None
    target_period_days: int | None
    currency: str
    current_value: float | None
    target_date: date | None
    status: str
    sort_order: int
    created_at: datetime
    updated_at: datetime
    # Computed fields — filled by router
    progress_pct: float | None = None        # 0.0–100.0
    computed_current: float | None = None    # live-computed value for linked goals
    days_remaining: int | None = None        # days until target_date
    overdue: bool = False                    # past target_date and still active
    linked_missing: bool = False             # linked habit was deleted

    model_config = {"from_attributes": True}
