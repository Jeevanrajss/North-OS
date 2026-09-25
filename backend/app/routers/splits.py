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


class ShareIn(BaseModel):
    contact_id: str
    count: int = Field(..., ge=1, le=100)


class SplitBatchIn(BaseModel):
    """Weighted split of one transaction: everyone (you included) takes a
    number of shares; one share = amount / total shares, and each contact
    owes count × one share. Dinner ₹1,000 with Asha ×2, Bala ×1 and you ×1
    … totalling 10 shares → ₹100 a share, Asha owes ₹200."""
    transaction_id: str
    shares: list[ShareIn] = Field(..., min_length=1, max_length=50)
    self_count: int = Field(1, ge=0, le=100)
    notes: str | None = None


class SplitOut(BaseModel):
    id: str
    transaction_id: str
    contact_id: str
    contact_name: str
    split_amount: float
    share_count: int | None
    notes: str | None
    status: str
    settled_at: str | None
    created_at: str
    # Denormalized transaction context for display — "Swiggy · 5 Jul"
    transaction_label: str | None
    transaction_date: str | None
    transaction_amount: float | None


def _to_out(split: Split, contact_name: str, txn: Transaction | None) -> SplitOut:
    return SplitOut(
        id=split.id,
        transaction_id=split.transaction_id,
        contact_id=split.contact_id,
        contact_name=contact_name,
        split_amount=split.split_amount,
        share_count=split.share_count,
        notes=split.notes,
        status=split.status,
        settled_at=split.settled_at.isoformat() if split.settled_at else None,
        created_at=split.created_at.isoformat(),
        transaction_label=(txn.payee or txn.category) if txn else None,
        transaction_date=txn.date.isoformat() if txn else None,
        transaction_amount=txn.amount if txn else None,
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


@router.post("/batch", response_model=list[SplitOut], status_code=201)
def create_split_batch(payload: SplitBatchIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ids = [sh.contact_id for sh in payload.shares]
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=422, detail="Each person can only be picked once")

    txn = db.query(Transaction).filter(
        Transaction.id == payload.transaction_id, Transaction.user_id == current_user.id
    ).first()
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")

    contacts = {
        c.id: c
        for c in db.query(Contact).filter(Contact.id.in_(ids), Contact.user_id == current_user.id).all()
    }
    if len(contacts) != len(ids):
        raise HTTPException(status_code=404, detail="Contact not found")

    total_shares = payload.self_count + sum(sh.count for sh in payload.shares)
    splits = [
        Split(
            transaction_id=txn.id,
            contact_id=sh.contact_id,
            split_amount=round(txn.amount * sh.count / total_shares, 2),
            share_count=sh.count,
            notes=payload.notes,
            user_id=current_user.id,
        )
        for sh in payload.shares
    ]
    db.add_all(splits)
    db.commit()  # all shares or none
    for sp in splits:
        db.refresh(sp)
    return [_to_out(sp, contacts[sp.contact_id].name, txn) for sp in splits]


@router.get("/people")
def splits_by_person(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Pending splits grouped by who owes you, biggest balance first."""
    pending = list_splits(status="pending", db=db, current_user=current_user)
    people: dict[str, dict] = {}
    for sp in pending:
        p = people.setdefault(sp.contact_id, {
            "contact_id": sp.contact_id, "contact_name": sp.contact_name, "total": 0.0, "splits": [],
        })
        p["total"] = round(p["total"] + sp.split_amount, 2)
        p["splits"].append(sp)
    ordered = sorted(people.values(), key=lambda p: (-p["total"], p["contact_name"].lower()))
    return {
        "total_pending": round(sum(p["total"] for p in ordered), 2),
        "people_count": len(ordered),
        "people": ordered,
    }


@router.post("/people/{contact_id}/settle")
def settle_person(contact_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """They paid you back everything — settle all their pending splits."""
    pending = db.query(Split).filter(
        Split.user_id == current_user.id, Split.contact_id == contact_id, Split.status == "pending"
    ).all()
    if not pending:
        raise HTTPException(status_code=404, detail="Nothing pending for this person")
    now = datetime.now(timezone.utc)
    for sp in pending:
        sp.status = "settled"
        sp.settled_at = now
    db.commit()
    return {"settled": len(pending), "amount": round(sum(sp.split_amount for sp in pending), 2)}


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
    split.deleted_at = datetime.utcnow()  # Phase 12a — soft delete for sync
    db.commit()
