"""Accounts router — CRUD, card catalog, and AI card-tip."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.services.auth_service import get_current_user
from app.models.account import Account
from app.schemas.account import (
    BANKS_LIST,
    CARD_BENEFITS_DB,
    CARD_CATALOG,
    WALLET_UPI_LIST,
    AccountIn,
    AccountOut,
    AccountPatch,
    CardTipRequest,
    CardTipResponse,
)

router = APIRouter(prefix="/api/v1/accounts", tags=["accounts"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
TYPE_LABEL = {
    "savings": "Savings",
    "credit_card": "Credit Card",
    "debit_card": "Debit Card",
    "wallet": "Wallet",
    "upi": "UPI",
    "cash": "Cash",
}


def _auto_name(payload: AccountIn) -> str:
    """Generate a human-readable display name from type/bank/variant."""
    if payload.bank and payload.card_variant:
        return f"{payload.bank} {payload.card_variant}"
    if payload.bank:
        return f"{payload.bank} {TYPE_LABEL.get(payload.type, payload.type)}"
    if payload.type in ("wallet", "upi"):
        return payload.bank or TYPE_LABEL.get(payload.type, payload.type)
    return TYPE_LABEL.get(payload.type, payload.type)


def _auto_benefits(payload: AccountIn) -> str | None:
    """Look up static benefits for the selected card variant."""
    if payload.type != "credit_card" or not payload.bank or not payload.card_variant:
        return payload.benefits_json
    variants = CARD_CATALOG.get(payload.bank, {}).get("credit", [])
    for v in variants:
        if v["variant"] == payload.card_variant:
            return json.dumps({
                "perks": v["perks"],
                "cashback": v["cashback"],
                "annual_fee": v.get("annual_fee", 0),
                "highlights": v.get("highlights", []),
            })
    return payload.benefits_json


# ---------------------------------------------------------------------------
# Catalog endpoints (called by the frontend wizard)
# ---------------------------------------------------------------------------
@router.get("/banks")
def list_banks():
    return {"banks": BANKS_LIST, "wallets": WALLET_UPI_LIST}


@router.get("/catalog")
def get_catalog():
    """Full card catalog — bank → {credit: [...], debit: [...]}."""
    return CARD_CATALOG


@router.get("/catalog/{bank_name}")
def get_bank_catalog(bank_name: str):
    """Card variants for a specific bank."""
    # Exact match first, then fuzzy
    data = CARD_CATALOG.get(bank_name)
    if data is None:
        for k, v in CARD_CATALOG.items():
            if bank_name.lower() in k.lower() or k.lower() in bank_name.lower():
                data = v
                break
    return data or {"credit": [], "debit": []}


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------
@router.get("", response_model=list[AccountOut])
def list_accounts(include_inactive: bool = False, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Account).filter(Account.user_id == current_user.id)
    if not include_inactive:
        q = q.filter(Account.is_active.is_(True))
    return q.order_by(Account.created_at.asc()).all()


@router.post("", response_model=AccountOut, status_code=201)
def create_account(payload: AccountIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    data = payload.model_dump()
    # Auto-generate display name and benefits
    data["name"] = _auto_name(payload)
    if not data.get("benefits_json"):
        data["benefits_json"] = _auto_benefits(payload)
    data["user_id"] = current_user.id
    acct = Account(**data)
    db.add(acct)
    db.commit()
    db.refresh(acct)
    return acct


@router.get("/{acct_id}", response_model=AccountOut)
def get_account(acct_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acct = db.get(Account, acct_id)
    if acct is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return acct


@router.patch("/{acct_id}", response_model=AccountOut)
def update_account(acct_id: str, patch: AccountPatch, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acct = db.get(Account, acct_id)
    if acct is None:
        raise HTTPException(status_code=404, detail="Account not found")
    for k, v in patch.model_dump(exclude_unset=True).items():
        setattr(acct, k, v)
    # Regenerate display name if bank/variant changed
    if patch.bank is not None or patch.card_variant is not None:
        acct.name = (  # type: ignore[assignment]
            f"{acct.bank} {acct.card_variant}"
            if acct.bank and acct.card_variant
            else f"{acct.bank} {TYPE_LABEL.get(str(acct.type), str(acct.type))}"
            if acct.bank
            else TYPE_LABEL.get(str(acct.type), str(acct.type))
        )
    db.commit()
    db.refresh(acct)
    return acct


@router.delete("/{acct_id}", status_code=204)
def delete_account(acct_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acct = db.get(Account, acct_id)
    if acct is None:
        raise HTTPException(status_code=404, detail="Account not found")
    acct.is_active = False  # type: ignore[assignment]
    db.commit()


# ---------------------------------------------------------------------------
# AI card-tip
# ---------------------------------------------------------------------------
@router.post("/card-tip", response_model=CardTipResponse)
def card_tip(req: CardTipRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Check whether a registered credit card would earn better rewards for
    the given transaction category than the card that was actually used."""
    credit_cards = (
        db.query(Account)
        .filter(Account.is_active.is_(True), Account.type == "credit_card")
        .all()
    )

    def _get_rate(card: Account) -> float:
        # Try static catalog first (most accurate)
        if card.benefits_json:
            try:
                stored = json.loads(card.benefits_json)
                rate = stored.get("cashback", {}).get(req.category)
                if rate is not None:
                    return float(rate)
            except Exception:
                pass
        # Fall back to flat CARD_BENEFITS_DB by full_name
        static = CARD_BENEFITS_DB.get(card.name)
        if static:
            return float(static.get("cashback", {}).get(req.category, 1.0))
        return 1.0

    def _name_matches(card: Account, name: str) -> bool:
        n = name.lower().strip()
        card_names = [
            (card.name or "").lower(),
            (card.nickname or "").lower(),
            (card.bank or "").lower(),
        ]
        return any(n == cn or n in cn or cn in n for cn in card_names if cn)

    used_card = next((c for c in credit_cards if _name_matches(c, req.account)), None)
    current_rate = _get_rate(used_card) if used_card else 0.0
    is_cc = used_card is not None

    best_card: Account | None = None
    best_rate = current_rate if is_cc else 0.0

    for c in credit_cards:
        if _name_matches(c, req.account):
            continue
        rate = _get_rate(c)
        if rate > best_rate:
            best_rate = rate
            best_card = c

    if best_card is None:
        return CardTipResponse(
            tip=None, better_card=None,
            cashback_rate=None, current_rate=current_rate,
        )

    saving = round((best_rate - current_rate) / 100 * req.amount, 2)
    label = best_card.nickname or best_card.name
    used_label = req.account or "the account you used"
    tip = (
        f"💡 Next time, use your {label} for {req.category} — "
        f"it earns {best_rate:.0f}% cashback vs {current_rate:.0f}% on {used_label}. "
        f"On ₹{req.amount:,.0f} that's ₹{saving:,.0f} more back."
    )

    return CardTipResponse(
        tip=tip,
        better_card=label,
        cashback_rate=best_rate,
        current_rate=current_rate,
    )
