"""Splits router — tracks who owes the user money for shared transactions."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.contact import Contact
from app.models.finance import Transaction
from app.models.split import Split
from app.models.user import User
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/v1/splits", tags=["splits"])


class SplitIn(BaseModel):
    transaction_id: str
    contact_id: str
    split_amount: float = Field(..., gt=0)
    notes: str | None = None


class SplitOut(BaseModel):
    id: str
    transaction_id: str
    contact_id: str
    contact_name: str
    split_amount: float
    notes: str | None
    status: str
    settled_at: str | None
    created_at: str
    # Denormalized transaction context for display — "Swiggy · 5 Jul"
    transaction_label: str | None
    transaction_date: str | None


def _to_out(split: Split, contact_name: str, txn: Transaction | None) -> SplitOut:
    return SplitOut(
        id=split.id,
        transaction_id=split.transaction_id,
        contact_id=split.contact_id,
        contact_name=contact_name,
        split_amount=split.split_amount,
        notes=split.notes,
        status=split.status,
        settled_at=split.settled_at.isoformat() if split.settled_at else None,
        created_at=split.created_at.isoformat(),
        transaction_label=(txn.payee or txn.category) if txn else None,
        transaction_date=txn.date.isoformat() if txn else None,
    )


@router.get("", response_model=list[SplitOut])
def list_splits(
    status: str = Query("pending"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    splits = (
        db.query(Split)
        .filter(Split.user_id == current_user.id, Split.status == status)
        .order_by(Split.created_at.desc())
        .all()
    )
    if not splits:
        return []

    contact_ids = {s.contact_id for s in splits}
    contacts = {
        c.id: c.name
        for c in db.query(Contact).filter(Contact.id.in_(contact_ids), Contact.user_id == current_user.id).all()
    }
    txn_ids = {s.transaction_id for s in splits}
    txns = {
        t.id: t
        for t in db.query(Transaction).filter(Transaction.id.in_(txn_ids), Transaction.user_id == current_user.id).all()
    }

    return [
        _to_out(s, contacts.get(s.contact_id, "Unknown"), txns.get(s.transaction_id))
        for s in splits
    ]


@router.get("/summary")
def splits_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pending = db.query(Split).filter(Split.user_id == current_user.id, Split.status == "pending").all()
    return {
        "total_pending": round(sum(s.split_amount for s in pending), 2),
        "count": len(pending),
    }


@router.post("", response_model=SplitOut, status_code=201)
def create_split(payload: SplitIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    txn = db.query(Transaction).filter(
        Transaction.id == payload.transaction_id, Transaction.user_id == current_user.id
    ).first()
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")

    contact = db.query(Contact).filter(
        Contact.id == payload.contact_id, Contact.user_id == current_user.id
    ).first()
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")

    split = Split(
        transaction_id=payload.transaction_id,
        contact_id=payload.contact_id,
        split_amount=payload.split_amount,
        notes=payload.notes,
        user_id=current_user.id,
    )
    db.add(split)
    db.commit()
    db.refresh(split)
    return _to_out(split, contact.name, txn)


@router.patch("/{split_id}/settle", response_model=SplitOut)
def settle_split(split_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    split = db.query(Split).filter(Split.id == split_id, Split.user_id == current_user.id).first()
    if split is None:
        raise HTTPException(status_code=404, detail="Split not found")
    split.status = "settled"
    split.settled_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(split)

    contact = db.query(Contact).filter(Contact.id == split.contact_id, Contact.user_id == current_user.id).first()
    txn = db.query(Transaction).filter(Transaction.id == split.transaction_id, Transaction.user_id == current_user.id).first()
    return _to_out(split, contact.name if contact else "Unknown", txn)


@router.delete("/{split_id}", status_code=204)
def delete_split(split_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    split = db.query(Split).filter(Split.id == split_id, Split.user_id == current_user.id).first()
    if split is None:
        raise HTTPException(status_code=404, detail="Split not found")
    db.delete(split)
    db.commit()
