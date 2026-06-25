"""Debt / loan / EMI router."""
from __future__ import annotations

import logging
import math
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.services.auth_service import get_current_user
from app.models.debt import Debt
from app.models.debt_payment import DebtPayment

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/finance/debt", tags=["debt"])

VALID_TYPES   = {"home_loan", "personal_loan", "car_loan", "two_wheeler_loan",
                 "education_loan", "credit_card", "no_cost_emi", "other"}
VALID_STATUSES = {"active", "closed", "paused"}


# ── Payoff helpers ────────────────────────────────────────────────────────────

def _months_to_payoff(outstanding: float, emi: float, annual_rate: float) -> int:
    if outstanding <= 0:
        return 0
    if annual_rate == 0.0:
        return math.ceil(outstanding / emi) if emi > 0 else 999
    r = annual_rate / 12 / 100
    if emi <= outstanding * r:
        return 999  # EMI doesn't cover interest
    try:
        return math.ceil(-math.log(1 - (outstanding * r) / emi) / math.log(1 + r))
    except (ValueError, ZeroDivisionError):
        return 999


def _total_interest(outstanding: float, emi: float, months: int) -> float:
    return max(0.0, round(emi * months - outstanding, 2))


# ── Schemas ───────────────────────────────────────────────────────────────────

class DebtIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    emoji: str = "💳"
    debt_type: str = "personal_loan"
    lender: str | None = None
    account_last4: str | None = None
    principal: float = 0.0
    outstanding: float = 0.0
    interest_rate: float = 0.0
    emi_amount: float = 0.0
    emi_due_day: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    currency: str = "INR"
    notes: str | None = None
    sort_order: int = 0


class DebtPatch(BaseModel):
    name: str | None = None
    emoji: str | None = None
    lender: str | None = None
    account_last4: str | None = None
    outstanding: float | None = None
    interest_rate: float | None = None
    emi_amount: float | None = None
    emi_due_day: int | None = None
    end_date: date | None = None
    status: str | None = None
    notes: str | None = None
    sort_order: int | None = None


class PaymentIn(BaseModel):
    amount: float = Field(..., gt=0)
    payment_date: date
    notes: str | None = None


def _debt_out(d: Debt, payments: list[DebtPayment] | None = None) -> dict[str, Any]:
    today = date.today()
    days_to_emi: int | None = None
    if d.emi_due_day:
        # Find next EMI date
        candidate = today.replace(day=min(d.emi_due_day, 28))
        if candidate < today:
            m = candidate.month + 1
            y = candidate.year + (1 if m > 12 else 0)
            m = m if m <= 12 else 1
            candidate = candidate.replace(year=y, month=m, day=min(d.emi_due_day, 28))
        days_to_emi = (candidate - today).days

    months = _months_to_payoff(d.outstanding, d.emi_amount, d.interest_rate)
    total_int = _total_interest(d.outstanding, d.emi_amount, months)
    progress_pct = round((1 - d.outstanding / d.principal) * 100, 1) if d.principal > 0 else 0.0

    out: dict[str, Any] = {
        "id": d.id, "name": d.name, "emoji": d.emoji, "debt_type": d.debt_type,
        "lender": d.lender, "account_last4": d.account_last4,
        "principal": d.principal, "outstanding": d.outstanding,
        "interest_rate": d.interest_rate, "emi_amount": d.emi_amount,
        "emi_due_day": d.emi_due_day, "days_to_emi": days_to_emi,
        "start_date": d.start_date.isoformat() if d.start_date else None,
        "end_date": d.end_date.isoformat() if d.end_date else None,
        "currency": d.currency, "status": d.status,
        "notes": d.notes, "sort_order": d.sort_order,
        "created_at": d.created_at.isoformat(), "updated_at": d.updated_at.isoformat(),
        # Computed
        "progress_pct": min(100.0, max(0.0, progress_pct)),
        "months_to_payoff": months,
        "total_interest_remaining": total_int,
    }
    if payments is not None:
        out["payments"] = [
            {
                "id": p.id, "amount": p.amount,
                "payment_date": p.payment_date.isoformat(),
                "outstanding_after": p.outstanding_after, "notes": p.notes,
                "created_at": p.created_at.isoformat(),
            }
            for p in sorted(payments, key=lambda x: x.payment_date, reverse=True)
        ]
    return out


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/summary")
def debt_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    debts = db.query(Debt).filter(Debt.user_id == current_user.id).filter(Debt.status == "active").all()
    return {
        "active_count": len(debts),
        "total_outstanding": round(sum(d.outstanding for d in debts), 2),
        "total_emi_monthly": round(sum(d.emi_amount for d in debts), 2),
        "total_principal": round(sum(d.principal for d in debts), 2),
    }


@router.get("/payoff-strategy")
def payoff_strategy(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    debts = db.query(Debt).filter(Debt.user_id == current_user.id).filter(Debt.status == "active", Debt.outstanding > 0).all()
    if not debts:
        return {"avalanche": [], "snowball": [], "summary": {}}

    def _entry(d: Debt, priority: int, why: str) -> dict:
        months = _months_to_payoff(d.outstanding, d.emi_amount, d.interest_rate)
        return {
            "priority": priority, "debt_id": d.id, "name": d.name,
            "outstanding": d.outstanding, "interest_rate": d.interest_rate,
            "emi_amount": d.emi_amount, "months_to_payoff": months,
            "total_interest_remaining": _total_interest(d.outstanding, d.emi_amount, months),
            "why_first": why,
        }

    avalanche = sorted(debts, key=lambda d: -d.interest_rate)
    snowball  = sorted(debts, key=lambda d: d.outstanding)

    av_list = [_entry(d, i+1, "Highest interest rate — paying this first saves the most money.") for i, d in enumerate(avalanche)]
    sb_list = [_entry(d, i+1, "Smallest balance — eliminates one obligation fastest.")           for i, d in enumerate(snowball)]

    av_interest = sum(e["total_interest_remaining"] for e in av_list)
    sb_interest = sum(e["total_interest_remaining"] for e in sb_list)
    saved = round(sb_interest - av_interest, 2)

    return {
        "avalanche": av_list,
        "snowball":  sb_list,
        "summary": {
            "total_outstanding": round(sum(d.outstanding for d in debts), 2),
            "total_emi_monthly": round(sum(d.emi_amount for d in debts), 2),
            "avalanche_total_interest": av_interest,
            "snowball_total_interest":  sb_interest,
            "interest_saved_by_avalanche": max(0.0, saved),
            "recommendation": "avalanche",
            "recommendation_reason": (
                f"Following avalanche order saves you ₹{max(0.0, saved):,.0f} in interest "
                "over the life of your loans." if saved > 0
                else "Both strategies have similar costs for your current debt mix."
            ),
        },
    }


@router.get("")
def list_debts(status: str | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Debt).filter(Debt.user_id == current_user.id)
    if status:
        q = q.filter(Debt.status == status)
    return [_debt_out(d) for d in q.order_by(Debt.sort_order, Debt.created_at).all()]


@router.post("", status_code=201)
def create_debt(body: DebtIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    d = Debt(**body.model_dump())
    db.add(d)
    db.commit()
    db.refresh(d)
    return _debt_out(d)


@router.get("/{debt_id}")
def get_debt(debt_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    d = db.query(Debt).filter(Debt.user_id == current_user.id).filter(Debt.id == debt_id, Debt.user_id == current_user.id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Debt not found")
    payments = db.query(DebtPayment).filter(DebtPayment.user_id == current_user.id).filter(DebtPayment.debt_id == debt_id).all()
    return _debt_out(d, payments)


@router.patch("/{debt_id}")
def patch_debt(debt_id: str, body: DebtPatch, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    d = db.query(Debt).filter(Debt.user_id == current_user.id).filter(Debt.id == debt_id, Debt.user_id == current_user.id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Debt not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    db.commit()
    db.refresh(d)
    return _debt_out(d)


@router.delete("/{debt_id}", status_code=204)
def close_debt(debt_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    d = db.query(Debt).filter(Debt.user_id == current_user.id).filter(Debt.id == debt_id, Debt.user_id == current_user.id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Debt not found")
    d.status = "closed"
    db.commit()


@router.post("/{debt_id}/payment", status_code=201)
def record_payment(debt_id: str, body: PaymentIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.finance import Transaction
    d = db.query(Debt).filter(Debt.user_id == current_user.id).filter(Debt.id == debt_id, Debt.user_id == current_user.id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Debt not found")
    if d.status != "active":
        raise HTTPException(status_code=400, detail=f"Debt is {d.status} — cannot record payment")

    # Create expense transaction for the payment
    t = Transaction(
        type="expense",
        amount=body.amount,
        currency=d.currency,
        date=body.payment_date,
        category="EMI/Loan",
        account=d.lender,
        notes=body.notes or f"EMI payment — {d.name}",
        debt_id=d.id,
    )
    db.add(t)
    db.flush()

    outstanding_after = max(0.0, d.outstanding - body.amount)
    db.add(DebtPayment(
        debt_id=d.id, transaction_id=t.id,
        amount=body.amount, payment_date=body.payment_date,
        outstanding_after=outstanding_after, notes=body.notes,
    ))
    d.outstanding = outstanding_after
    if outstanding_after == 0.0:
        d.status = "closed"

    db.commit()
    db.refresh(d)
    return _debt_out(d)


@router.get("/{debt_id}/payments")
def list_payments(debt_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not db.query(Debt).filter(Debt.user_id == current_user.id).filter(Debt.id == debt_id, Debt.user_id == current_user.id).first():
        raise HTTPException(status_code=404, detail="Debt not found")
    payments = db.query(DebtPayment).filter(DebtPayment.user_id == current_user.id).filter(DebtPayment.debt_id == debt_id).order_by(DebtPayment.payment_date.desc()).all()
    return [
        {
            "id": p.id, "amount": p.amount,
            "payment_date": p.payment_date.isoformat(),
            "outstanding_after": p.outstanding_after, "notes": p.notes,
            "created_at": p.created_at.isoformat(),
        }
        for p in payments
    ]
