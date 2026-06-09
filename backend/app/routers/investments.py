"""Investments router — SIPs, FDs, PPF, MF, NPS, gold, etc."""
from __future__ import annotations

import logging
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.investment import Investment
from app.models.investment_entry import InvestmentEntry

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/finance/investments", tags=["investments"])

VALID_TYPES = {"mutual_fund", "fd", "ppf", "nps", "gold", "rd", "savings_account", "stocks", "other"}


# ── Schemas ───────────────────────────────────────────────────────────────────

class InvestmentIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    emoji: str = "📈"
    investment_type: str = "mutual_fund"
    sip_amount: float | None = None
    sip_date: int | None = None
    target_amount: float | None = None
    goal_id: str | None = None
    account_number: str | None = None
    folio_number: str | None = None
    currency: str = "INR"
    notes: str | None = None
    sort_order: int = 0


class InvestmentPatch(BaseModel):
    name: str | None = None
    emoji: str | None = None
    sip_amount: float | None = None
    sip_date: int | None = None
    target_amount: float | None = None
    goal_id: str | None = None
    status: str | None = None
    notes: str | None = None
    sort_order: int | None = None


class EntryIn(BaseModel):
    amount: float = Field(..., gt=0)
    entry_date: date
    entry_type: str = "sip"   # "sip" | "lumpsum" | "manual"
    notes: str | None = None


def _inv_out(inv: Investment) -> dict[str, Any]:
    return {
        "id": inv.id, "name": inv.name, "emoji": inv.emoji,
        "investment_type": inv.investment_type,
        "total_invested": inv.total_invested,
        "sip_amount": inv.sip_amount, "sip_date": inv.sip_date,
        "target_amount": inv.target_amount, "goal_id": inv.goal_id,
        "account_number": inv.account_number, "folio_number": inv.folio_number,
        "currency": inv.currency, "status": inv.status,
        "notes": inv.notes, "sort_order": inv.sort_order,
        "created_at": inv.created_at.isoformat(), "updated_at": inv.updated_at.isoformat(),
        # Computed
        "progress_pct": round(inv.total_invested / inv.target_amount * 100, 1) if inv.target_amount and inv.target_amount > 0 else None,
    }


def _recompute_goal(db: Session, goal_id: str) -> None:
    """Recompute FinancialGoal.current_amount from all linked investments."""
    try:
        from app.models.financial_goal import FinancialGoal
        goal = db.get(FinancialGoal, goal_id)
        if not goal:
            return
        linked = goal.linked_ids()
        if goal_id not in linked:
            linked.append(goal_id)
        invs = db.query(Investment).filter(Investment.id.in_(linked)).all()
        goal.current_amount = round(sum(i.total_invested for i in invs), 2)
        db.flush()
    except Exception as e:
        log.debug("Goal recompute skipped: %s", e)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/summary")
def investment_summary(db: Session = Depends(get_db)):
    invs = db.query(Investment).filter(Investment.status == "active").all()
    by_type: dict[str, float] = {}
    for inv in invs:
        by_type[inv.investment_type] = by_type.get(inv.investment_type, 0) + inv.total_invested

    today = date.today()
    sip_this_month = 0.0
    for inv in invs:
        if inv.sip_amount:
            # Count entries this month
            entries = db.query(InvestmentEntry).filter(
                InvestmentEntry.investment_id == inv.id,
                InvestmentEntry.entry_date >= today.replace(day=1),
            ).all()
            sip_this_month += sum(e.amount for e in entries)

    return {
        "total_invested": round(sum(i.total_invested for i in invs), 2),
        "by_type": {k: round(v, 2) for k, v in by_type.items()},
        "sip_this_month": round(sip_this_month, 2),
        "active_count": len(invs),
        "investments": [_inv_out(i) for i in invs],
    }


@router.get("")
def list_investments(db: Session = Depends(get_db)):
    return [_inv_out(i) for i in db.query(Investment).order_by(Investment.sort_order, Investment.created_at).all()]


@router.post("", status_code=201)
def create_investment(body: InvestmentIn, db: Session = Depends(get_db)):
    inv = Investment(**body.model_dump())
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return _inv_out(inv)


@router.patch("/{inv_id}")
def patch_investment(inv_id: str, body: InvestmentPatch, db: Session = Depends(get_db)):
    inv = db.get(Investment, inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investment not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(inv, k, v)
    db.commit()
    db.refresh(inv)
    return _inv_out(inv)


@router.delete("/{inv_id}", status_code=204)
def redeem_investment(inv_id: str, db: Session = Depends(get_db)):
    inv = db.get(Investment, inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investment not found")
    inv.status = "redeemed"
    db.commit()


@router.post("/{inv_id}/entry", status_code=201)
def add_entry(inv_id: str, body: EntryIn, db: Session = Depends(get_db)):
    from app.models.finance import Transaction

    inv = db.get(Investment, inv_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investment not found")

    # Create investment transaction
    t = Transaction(
        type="investment",
        amount=body.amount,
        currency=inv.currency,
        date=body.entry_date,
        category=inv.investment_type,
        account=inv.name,
        notes=body.notes or f"{body.entry_type.title()} — {inv.name}",
        investment_id=inv.id,
    )
    db.add(t)
    db.flush()

    # Create entry record
    entry = InvestmentEntry(
        investment_id=inv.id,
        transaction_id=t.id,
        amount=body.amount,
        entry_date=body.entry_date,
        entry_type=body.entry_type,
        notes=body.notes,
    )
    db.add(entry)

    # Update running total
    inv.total_invested = round(inv.total_invested + body.amount, 2)

    db.flush()

    # If linked to a financial goal, recompute goal progress
    if inv.goal_id:
        _recompute_goal(db, inv.goal_id)

    db.commit()
    db.refresh(inv)
    return {"entry_id": entry.id, "investment": _inv_out(inv)}


@router.get("/{inv_id}/entries")
def list_entries(inv_id: str, db: Session = Depends(get_db)):
    if not db.get(Investment, inv_id):
        raise HTTPException(status_code=404, detail="Investment not found")
    entries = db.query(InvestmentEntry).filter(InvestmentEntry.investment_id == inv_id).order_by(InvestmentEntry.entry_date.desc()).all()
    return [
        {
            "id": e.id, "amount": e.amount, "entry_date": e.entry_date.isoformat(),
            "entry_type": e.entry_type, "notes": e.notes, "created_at": e.created_at.isoformat(),
        }
        for e in entries
    ]
