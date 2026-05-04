"""Finance tracker model."""
from __future__ import annotations

import uuid
from datetime import date as date_cls
from datetime import datetime

from sqlalchemy import Date, DateTime, Float, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Transaction(Base):
    """A single income, expense, or transfer entry."""

    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)

    # "income" | "expense" | "transfer"
    type: Mapped[str] = mapped_column(String(16), nullable=False, default="expense")

    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")

    # The day this transaction occurred.
    date: Mapped[date_cls] = mapped_column(Date, nullable=False, index=True)

    # Free-text fields — no FK to keep it lightweight.
    category: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    account: Mapped[str | None] = mapped_column(String(60), nullable=True)
    payee: Mapped[str | None] = mapped_column(String(80), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Set when the row was created via CSV import (groups rows from same upload)
    import_batch_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
