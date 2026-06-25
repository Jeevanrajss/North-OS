"""Investment instrument model (MF, FD, PPF, NPS, gold, RD, etc.)."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Investment(Base):
    """A savings or investment instrument (MF, FD, PPF, NPS, gold, RD, etc.)."""

    __tablename__ = "investments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True, default="")
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    emoji: Mapped[str] = mapped_column(String(10), nullable=False, default="📈")

    # "mutual_fund" | "fd" | "ppf" | "nps" | "gold" | "rd" | "savings_account" | "stocks" | "other"
    investment_type: Mapped[str] = mapped_column(String(40), nullable=False, default="mutual_fund")

    # Denormalised running total — recomputed on every entry add/delete
    total_invested: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    sip_amount: Mapped[float | None] = mapped_column(Float, nullable=True)    # monthly SIP
    sip_date: Mapped[int | None] = mapped_column(Integer, nullable=True)      # day of month

    target_amount: Mapped[float | None] = mapped_column(Float, nullable=True)  # optional corpus target
    goal_id: Mapped[str | None] = mapped_column(String(36), nullable=True)     # linked FinancialGoal

    # For SMS/import auto-matching
    account_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    folio_number: Mapped[str | None] = mapped_column(String(50), nullable=True)

    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")

    # "active" | "paused" | "redeemed"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
