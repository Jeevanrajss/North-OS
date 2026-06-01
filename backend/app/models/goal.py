"""Goal / OKR model."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Goal(Base):
    """A personal goal linked (optionally) to habits or finance metrics."""

    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    emoji: Mapped[str] = mapped_column(String(10), nullable=False, default="🎯")

    # goal_type: habit_streak | habit_rate | finance_save | finance_spend | custom
    goal_type: Mapped[str] = mapped_column(String(50), nullable=False, default="custom")

    # ID of the linked habit (for habit_streak / habit_rate goals)
    linked_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    linked_label: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Target: streak count, completion %, savings amount, spend limit
    target_value: Mapped[float | None] = mapped_column(Float, nullable=True)

    # For habit_rate: window in days to measure over
    target_period_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")

    # For custom goals: user-set current value
    current_value: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Deadline
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # status: active | completed | paused | abandoned
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)

    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
