"""Debt / loan / EMI obligation model."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Debt(Base):
    """A loan, EMI obligation, or credit card balance."""

    __tablename__ = "debts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True, default="")
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    emoji: Mapped[str] = mapped_column(String(10), nullable=False, default="💳")

    # "home_loan" | "personal_loan" | "car_loan" | "two_wheeler_loan"
    # | "education_loan" | "credit_card" | "no_cost_emi" | "other"
    debt_type: Mapped[str] = mapped_column(String(40), nullable=False, default="personal_loan")

    lender: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Last 4 digits of account/loan number — used to auto-match EMI rows in SMS and CC import
    account_last4: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Original sanctioned amount (user-entered when adding)
    principal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Current outstanding balance. Reduced on each confirmed EMI payment.
    outstanding: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Annual interest rate %. Enter 0.0 for no-cost EMI.
    interest_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Fixed monthly EMI amount
    emi_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Day of month EMI is auto-debited (1–31)
    emi_due_day: Mapped[int | None] = mapped_column(Integer, nullable=True)

    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")

    # "active" | "closed" | "paused"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
