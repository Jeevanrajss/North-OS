"""InvestmentEntry — individual investment transaction (SIP, lumpsum, or manual)."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class InvestmentEntry(Base):
    """Individual investment transaction (SIP instalment, lumpsum, or manual entry)."""

    __tablename__ = "investment_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    investment_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    transaction_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    amount: Mapped[float] = mapped_column(Float, nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # "sip" | "lumpsum" | "manual"
    entry_type: Mapped[str] = mapped_column(String(20), nullable=False, default="sip")

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
