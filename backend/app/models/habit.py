"""Habit tracker models — Week 3.

Data model:

  habits            one row per habit the user is tracking. Soft-archived
                    rather than deleted so existing check-ins keep their FK
                    integrity and historical heatmaps stay intact.
  habit_checkins    one row per (habit, day). Presence = did it. Value is
                    1 for binary v1; reserved as int for future
                    quantitative habits.

v1 scope: binary check-ins, emoji icon, good habits only, frequency is
"daily" or "weekly" (N times per week).
"""
from __future__ import annotations

import uuid
from datetime import date as date_cls
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Habit(Base):
    """A habit the user is tracking."""

    __tablename__ = "habits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    emoji: Mapped[str] = mapped_column(String(8), nullable=False, default="✅")

    # Frequency.
    #   frequency_kind = "daily"  → every day. weekdays is ignored.
    #   frequency_kind = "weekly" → only on the selected weekdays. target is
    #                               derived from len(weekdays).
    frequency_kind: Mapped[str] = mapped_column(String(16), nullable=False, default="daily")
    frequency_target: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Weekly schedule. Comma-separated ISO weekday ints (0=Mon … 6=Sun), e.g.
    # "1,4" for Tue+Fri. Null/empty for daily habits.
    weekdays: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Ordering inside the Today list. Lower = earlier.
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Soft-archive. When archived_at is set, the habit is hidden from Today
    # but historical check-ins stay queryable.
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    checkins: Mapped[list["HabitCheckin"]] = relationship(
        back_populates="habit",
        cascade="all, delete-orphan",
        order_by="HabitCheckin.day_date",
    )

    @property
    def is_active(self) -> bool:
        return self.archived_at is None


class HabitCheckin(Base):
    """A single (habit, day) check-in. Presence = done."""

    __tablename__ = "habit_checkins"
    __table_args__ = (
        UniqueConstraint("habit_id", "day_date", name="uq_habit_checkin_per_day"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    habit_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("habits.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day_date: Mapped[date_cls] = mapped_column(Date, nullable=False, index=True)

    # Binary v1 — always 1 when present. Reserved for future quantitative habits.
    value: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Optional note attached to a check-in (e.g. "read 30 pages of X").
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    habit: Mapped[Habit] = relationship(back_populates="checkins")
