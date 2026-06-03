"""FinancialGoal — personal financial target with timeline and linked investments."""
from __future__ import annotations

import json
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class FinancialGoal(Base):
    """A personal financial target with timeline and linked investments."""

    __tablename__ = "financial_goals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    emoji: Mapped[str] = mapped_column(String(10), nullable=False, default="🎯")

    # "emergency_fund" | "purchase" | "education" | "retirement" | "travel" | "wedding" | "other"
    goal_type: Mapped[str] = mapped_column(String(40), nullable=False, default="purchase")

    # "short" = <1yr | "medium" = 1–5yr | "long" = >5yr
    timeline: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")

    target_amount: Mapped[float] = mapped_column(Float, nullable=False)

    # Manually updated OR auto-computed from linked investments' total_invested
    current_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # 1=high | 2=medium | 3=low
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")

    # JSON array of Investment IDs e.g. '["uuid1", "uuid2"]'
    linked_investment_ids: Mapped[str | None] = mapped_column(Text, nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # "active" | "achieved" | "paused"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def linked_ids(self) -> list[str]:
        if self.linked_investment_ids:
            try:
                return json.loads(self.linked_investment_ids)
            except Exception:
                pass
        return []
