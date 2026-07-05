"""Split model — records that a contact owes the user money for a shared transaction."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Split(Base):
    __tablename__ = "splits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True, default="")

    transaction_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    contact_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Amount the contact owes the user for this transaction.
    split_amount: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # "pending" | "settled"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
