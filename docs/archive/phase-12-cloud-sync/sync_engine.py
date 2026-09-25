"""Shared sync engine (Phase 12b/12c).

Two consumers:
  - app/routers/sync.py — the cloud-side HTTP endpoints (/sync/pull, /sync/push)
    that a device calls.
  - app/services/sync_client.py — the LOCAL desktop backend's own sync worker,
    which applies pulled rows to its local DB using the exact same merge
    logic the cloud uses to apply pushed rows (it's the same operation:
    "upsert this row into this DB session, LWW by updated_at").

Keeping this in one place means the merge rule (and any future fix to it,
like the timestamp-precision bug found in Phase 12b) only has to be right
once.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.budget import Budget
from app.models.contact import Contact
from app.models.debt import Debt
from app.models.debt_payment import DebtPayment
from app.models.finance import Transaction
from app.models.financial_goal import FinancialGoal
from app.models.goal import Goal
from app.models.habit import Habit, HabitCheckin
from app.models.health_log import HealthLog
from app.models.investment import Investment
from app.models.investment_entry import InvestmentEntry
from app.models.journal import JournalDay, JournalEntry
from app.models.split import Split
from app.models.sms_transaction import SmsTransaction
from app.models.subscription import Subscription

# Table name -> model. `settings` is deliberately absent — it holds
# device-local AI provider config that must never sync (see PHASE_12_SPEC.md).
SYNCED_MODELS: dict[str, type] = {
    "accounts": Account,
    "budgets": Budget,
    "contacts": Contact,
    "debts": Debt,
    "debt_payments": DebtPayment,
    "transactions": Transaction,
    "financial_goals": FinancialGoal,
    "goals": Goal,
    "habits": Habit,
    "habit_checkins": HabitCheckin,
    "health_logs": HealthLog,
    "investments": Investment,
    "investment_entries": InvestmentEntry,
    "journal_days": JournalDay,
    "journal_entries": JournalEntry,
    "splits": Split,
    "subscriptions": Subscription,
    "sms_transactions": SmsTransaction,
}

# Fields a merge can never overwrite — identity + ownership.
PROTECTED_FIELDS = {"id", "user_id"}


def model_columns(model: type) -> dict[str, Any]:
    return {c.key: c for c in sa_inspect(model).columns}


def serialize_row(model: type, row: Any) -> dict[str, Any]:
    out = {}
    for key, col in model_columns(model).items():
        value = getattr(row, key)
        type_name = type(col.type).__name__
        if value is not None and type_name in ("DateTime", "Date"):
            value = value.isoformat()
        out[key] = value
    return out


def deserialize_fields(model: type, data: dict[str, Any]) -> dict[str, Any]:
    """Convert an incoming JSON row into column-typed values, dropping any
    keys that aren't real columns on this model."""
    cols = model_columns(model)
    out = {}
    for key, value in data.items():
        if key not in cols:
            continue
        col = cols[key]
        type_name = type(col.type).__name__
        if value is not None and isinstance(value, str):
            if type_name == "DateTime":
                value = datetime.fromisoformat(value)
            elif type_name == "Date":
                value = date.fromisoformat(value)
        out[key] = value
    return out


def merge_row(db: Session, model: type, user_id: str, row_data: dict[str, Any]) -> str:
    """Apply one incoming row to `db` for `user_id`, last-write-wins by
    updated_at. Returns "applied", "conflict" (kept the existing, newer row),
    or "skipped" (malformed input — missing id/updated_at).

    Does NOT commit — caller commits once after a batch for a single
    transaction boundary.
    """
    row_id = row_data.get("id")
    incoming_updated_raw = row_data.get("updated_at")
    if not row_id or not incoming_updated_raw:
        return "skipped"
    try:
        incoming_updated_at = datetime.fromisoformat(incoming_updated_raw)
    except (TypeError, ValueError):
        return "skipped"

    fields = deserialize_fields(model, row_data)
    for protected in PROTECTED_FIELDS:
        fields.pop(protected, None)

    # Scoped to user_id — a row can never overwrite another user's data even
    # if it somehow knew the UUID.
    existing = (
        db.query(model)
        .filter(model.id == row_id, model.user_id == user_id)
        .execution_options(include_deleted=True)
        .first()
    )

    if existing is None:
        # The id may belong to another user; inserting would hit the primary
        # key and abort the whole batch.
        taken = (
            db.query(model.id)
            .filter(model.id == row_id)
            .execution_options(include_deleted=True)
            .first()
        )
        if taken is not None:
            return "skipped"
        db.add(model(id=row_id, user_id=user_id, **fields))
        return "applied"
    if incoming_updated_at >= existing.updated_at:
        for key, value in fields.items():
            setattr(existing, key, value)
        return "applied"
    return "conflict"


def pull_changes(db: Session, user_id: str, since: datetime | None) -> dict[str, list[dict[str, Any]]]:
    """Everything changed for `user_id` since `since` (or everything, if
    `since` is None), across all synced tables, including tombstoned rows —
    a puller must see deletes to propagate them."""
    tables: dict[str, list[dict[str, Any]]] = {}
    for table_name, model in SYNCED_MODELS.items():
        q = (
            db.query(model)
            .filter(model.user_id == user_id)
            .execution_options(include_deleted=True)
        )
        if since is not None:
            q = q.filter(model.updated_at > since)
        rows = q.all()
        if rows:
            tables[table_name] = [serialize_row(model, r) for r in rows]
    return tables


def push_changes(db: Session, user_id: str, tables: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    """Merge a batch of incoming rows (grouped by table) into `db` for
    `user_id`. Commits once at the end."""
    applied = conflicts = skipped = 0
    unknown_tables: list[str] = []

    for table_name, rows in tables.items():
        model = SYNCED_MODELS.get(table_name)
        if model is None:
            unknown_tables.append(table_name)
            continue
        for row_data in rows:
            result = merge_row(db, model, user_id, row_data)
            if result == "applied":
                applied += 1
            elif result == "conflict":
                conflicts += 1
            else:
                skipped += 1

    db.commit()
    return {
        "applied": applied,
        "conflicts_resolved": conflicts,
        "skipped": skipped,
        "unknown_tables": unknown_tables,
    }
