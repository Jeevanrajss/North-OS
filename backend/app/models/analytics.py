"""AnalyticsSnapshot — one row per day, pre-computed cross-module stats."""
from __future__ import annotations

import json
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class AnalyticsSnapshot(Base):
    """One row per (user, computed_date). Stores pre-computed cross-module stats as JSON blobs.

    `computed_date` used to carry `unique=True` on its own, so the whole
    server shared one snapshot row per calendar date — every user's habit/
    mood/finance stats overwrote each other, and a second user's scheduled
    job crashed on the UNIQUE constraint outright. Uniqueness now lives on
    (user_id, computed_date) instead.
    """

    __tablename__ = "analytics_snapshots"
    __table_args__ = (
        UniqueConstraint("user_id", "computed_date", name="uq_analytics_snapshot_user_date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True, default="")
    computed_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Daily habit completion rate (0.0–1.0)
    habit_completion_rate: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Journal mood score (average of mood_codes mapped to 1–5; None if no entry)
    mood_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Total daily expense / income
    daily_expense: Mapped[float | None] = mapped_column(Float, nullable=True)
    daily_income: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Habit counts
    habits_done_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    habits_scheduled_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Journal presence
    journal_written: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    journal_word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Health fields (populated in Phase 5)
    sleep_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    energy_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    exercise_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # JSON blobs
    mood_codes_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    expense_categories_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    habit_detail_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Helper decoders
    def mood_codes(self) -> list:
        return json.loads(self.mood_codes_json) if self.mood_codes_json else []

    def expense_categories(self) -> dict:
        return json.loads(self.expense_categories_json) if self.expense_categories_json else {}

    def habit_detail(self) -> dict:
        return json.loads(self.habit_detail_json) if self.habit_detail_json else {}
