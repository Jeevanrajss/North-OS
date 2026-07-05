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
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True, default="")

    # "income" | "expense" | "transfer" | "investment"
    # "investment" is a 4th type — SIP/MF debits are NOT expenses; they build net worth.
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

    # Phase 7 extensions
    # GST/tax component from CC statement — kept separate so spending analytics exclude it
    tax_amount: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Set when this transaction is an EMI payment → DebtPayment created + outstanding reduced
    debt_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Set when this transaction is a SIP/investment → InvestmentEntry created + total_invested updated
    investment_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # Phase 10 — SMS auto-import provenance.
    # source: "manual" | "sms_auto" (created straight from a parsed SMS) |
    #         "sms_verified" (user-entered row later matched to an SMS)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    # FK-by-convention to sms_transactions.sms_id — set once a mobile SMS
    # scan creates or verifies this row. Used for import dedup.
    sms_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # Last 4 digits of the account/card the SMS mentioned — bank SMS rarely
    # gives a friendly account name, only this. Distinct from `account`
    # (free-text label like "HDFC Savings") which manual entries use.
    account_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
