"""HealthLog — one row per day for sleep, energy, exercise, water."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class HealthLog(Base):
    """One row per day. User logs sleep, energy, and exercise."""

    __tablename__ = "health_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True, default="")
    log_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)

    # Sleep hours e.g. 7.5
    sleep_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Energy level 1–5 (1=exhausted, 5=great)
    energy_level: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Exercise
    exercise_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    exercise_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Water intake (glasses)
    water_glasses: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
