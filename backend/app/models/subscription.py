"""Subscription tracker model — Week 4."""
from __future__ import annotations

import uuid
from datetime import date as date_cls
from datetime import datetime

from sqlalchemy import Date, DateTime, Float, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Subscription(Base):
    """A recurring subscription the user is tracking."""

    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    emoji: Mapped[str] = mapped_column(String(8), nullable=False, default="💳")

    # Cost per billing period.
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")

    # billing_cycle: monthly | yearly | quarterly | weekly
    billing_cycle: Mapped[str] = mapped_column(String(16), nullable=False, default="monthly")

    # Next payment due date. User-managed; shown with urgency coloring.
    next_billing_date: Mapped[date_cls] = mapped_column(Date, nullable=False)

    # Payment method.
    # payment_type: credit_card | debit_card | upi | net_banking | wallet | other
    payment_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # e.g. "HDFC", "ICICI", "Amazon Pay", "PhonePe"
    account_name: Mapped[str | None] = mapped_column(String(60), nullable=True)

    # Optional metadata.
    category: Mapped[str | None] = mapped_column(String(40), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    url: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Soft-pause — subscription is still active but billing is on hold.
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Soft-cancel — keeps history without deleting the row.
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
