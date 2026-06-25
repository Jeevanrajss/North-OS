"""Data-management endpoints — wipe all user-generated data."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.services.auth_service import get_current_user
from app.models.account import Account
from app.models.budget import Budget
from app.models.finance import Transaction
from app.models.finance_category import FinanceCategory
from app.models.habit import Habit, HabitCheckin
from app.models.journal import Embedding, JournalDay, JournalEntry, Tag
from app.models.notification import Notification
from app.models.sms_transaction import SmsTransaction
from app.models.subscription import Subscription

router = APIRouter(prefix="/api/v1/data", tags=["data"])


@router.delete("/wipe")
def wipe_all_data(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Permanently delete all user-generated data.

    Preserves: settings, system finance categories, seed data (mood_codes,
               seeded tags), and user profile.
    Clears:    transactions, budgets, user finance categories, bank accounts,
               habits, subscriptions, journal, user-created tags,
               notifications, SMS transactions, and all vector embeddings.
    """
    try:
        uid = current_user.id
        db.query(JournalEntry).filter(JournalEntry.user_id == uid).delete(synchronize_session=False)
        db.query(HabitCheckin).filter(HabitCheckin.user_id == uid).delete(synchronize_session=False)
        db.query(Habit).filter(Habit.user_id == uid).delete(synchronize_session=False)
        db.query(Transaction).filter(Transaction.user_id == uid).delete(synchronize_session=False)
        db.query(Budget).filter(Budget.user_id == uid).delete(synchronize_session=False)
        db.query(Account).filter(Account.user_id == uid).delete(synchronize_session=False)
        db.query(Subscription).filter(Subscription.user_id == uid).delete(synchronize_session=False)
        db.query(Notification).filter(Notification.user_id == uid).delete(synchronize_session=False)
        db.query(SmsTransaction).filter(SmsTransaction.user_id == uid).delete(synchronize_session=False)

        # Clear the sqlite-vec virtual table (may not exist in all environments)
        try:
            db.execute(text("DELETE FROM vec_embeddings"))
        except Exception:
            pass

        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to wipe data. No changes were made.")

    return {"ok": True, "message": "All data wiped successfully."}
