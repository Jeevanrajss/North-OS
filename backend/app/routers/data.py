"""Data-management endpoints — wipe all user-generated data."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.account import Account
from app.models.analytics import AnalyticsSnapshot
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
from app.models.notification import Notification
from app.models.sms_transaction import SmsTransaction
from app.models.split import Split
from app.models.subscription import Subscription
from app.models.user import User
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/v1/data", tags=["data"])

# Children before parents.
_USER_TABLES = [
    Split, Contact, DebtPayment, Debt, InvestmentEntry, Investment, FinancialGoal, Goal,
    HealthLog, JournalEntry, JournalDay, HabitCheckin, Habit, Transaction, Budget, Account,
    Subscription, Notification, SmsTransaction, AnalyticsSnapshot,
]


@router.delete("/wipe")
def wipe_all_data(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Permanently delete all of the current user's data.

    Preserves: settings, finance categories, seed data (mood_codes, tags),
               and the user profile.
    """
    uid = current_user.id
    try:
        entry_ids = [
            r[0]
            for r in db.query(JournalEntry.id)
            .filter(JournalEntry.user_id == uid)
            .execution_options(include_deleted=True)
            .all()
        ]
        if entry_ids:
            params = {f"s{i}": sid for i, sid in enumerate(entry_ids)}
            in_clause = ", ".join(f":s{i}" for i in range(len(entry_ids)))
            emb_ids = f"SELECT id FROM embeddings WHERE source_id IN ({in_clause})"
            try:
                db.execute(text(f"DELETE FROM vec_embeddings WHERE rowid IN ({emb_ids})"), params)
            except Exception:
                pass  # sqlite-vec not loaded in this environment
            db.execute(text(f"DELETE FROM embeddings WHERE source_id IN ({in_clause})"), params)

        for model in _USER_TABLES:
            db.query(model).filter(model.user_id == uid).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to wipe data. No changes were made.")

    return {"ok": True, "message": "All data wiped successfully."}
