"""
SMS auto-import router.

Endpoints
─────────
POST /api/v1/sms/inbound                  Android webhook (direct)
POST /api/v1/sms/scan-imessage            Scan macOS Messages.db
GET  /api/v1/sms/pending                  List pending parsed transactions
POST /api/v1/sms/pending/{id}/confirm     Confirm → creates a Transaction
POST /api/v1/sms/pending/{id}/dismiss     Dismiss
GET  /api/v1/sms/status                   Source availability info
"""
from __future__ import annotations

import re
import sqlite3
import uuid
from datetime import date as date_cls, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.services.auth_service import get_current_user
from app.models.finance import Transaction
from app.models.sms_transaction import SmsTransaction
from app.services.sms_parser import parse_sms


router = APIRouter(prefix="/api/v1/sms", tags=["sms"])


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class InboundSmsPayload(BaseModel):
    body: str
    sender: Optional[str] = None
    received_at: Optional[str] = None   # ISO datetime string, optional


class SmsTransactionOut(BaseModel):
    id: str
    source: str
    sender: Optional[str]
    raw_body: str
    received_at: str
    parsed_ok: bool
    txn_type: Optional[str]
    amount: Optional[float]
    currency: Optional[str]
    payee: Optional[str]
    account: Optional[str]
    balance: Optional[float]
    txn_date: Optional[str]
    status: str


# SmsTransaction.raw_body is NOT NULL — required by the unrelated /inbound,
# /scan-imessage flows which legitimately need the raw
# text. The privacy-respecting mobile /import flow never receives raw SMS
# content, so this placeholder satisfies the column constraint without ever
# having stored real SMS text.
_NOT_STORED_PLACEHOLDER = "[not stored — parsed on-device, see PHASE_10_SPEC.md §2.5]"


class SMSImportRequest(BaseModel):
    """
    PRIVACY RULE (PHASE_10_SPEC.md §2.5): the mobile client parses SMS
    on-device (regex only, see BankSmsParser) and sends ONLY these
    already-parsed fields. There is no raw SMS body here, and never should
    be — this backend must not receive or process raw SMS content.
    """
    sms_id: str
    sender: str
    timestamp: int              # ms since epoch, from the device
    amount: float
    direction: str               # "debit" | "credit"
    merchant: Optional[str] = None
    account_last4: Optional[str] = None
    balance_after: Optional[float] = None
    category: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _sms_to_out(row: SmsTransaction) -> SmsTransactionOut:
    return SmsTransactionOut(
        id=row.id,
        source=row.source,
        sender=row.sender,
        raw_body=row.raw_body,
        received_at=row.received_at.isoformat(),
        parsed_ok=row.parsed_ok,
        txn_type=row.txn_type,
        amount=row.amount,
        currency=row.currency,
        payee=row.payee,
        account=row.account,
        balance=row.balance,
        txn_date=row.txn_date,
        status=row.status,
    )


def _already_seen(db: Session, body: str, user_id: str) -> bool:
    """Deduplicate: same raw body ever seen (any status, any age), for this user."""
    return (
        db.query(SmsTransaction).filter(SmsTransaction.user_id == user_id)
        .filter(SmsTransaction.raw_body == body)
        .first()
    ) is not None


def _ingest(
    db: Session, body: str, sender: Optional[str], source: str, user_id: str,
    received_at: Optional[datetime] = None,
) -> Optional[SmsTransaction]:
    """Parse and persist one SMS. Returns None if duplicate, not a transaction, or already exists."""
    body = body.strip()
    if not body:
        return None

    parsed = parse_sms(body, sender)

    # Only save SMS that were recognised as bank transactions — skip personal messages entirely
    if not parsed["ok"]:
        return None

    # Dedup: same raw body already seen in last 48 h
    if _already_seen(db, body, user_id):
        return None

    row = SmsTransaction(
        id=str(uuid.uuid4()),
        user_id=user_id,
        source=source,
        sender=sender,
        raw_body=body,
        received_at=received_at or datetime.utcnow(),
        parsed_ok=True,
        txn_type=parsed.get("type"),
        amount=parsed.get("amount"),
        currency=parsed.get("currency", "INR"),
        payee=parsed.get("payee"),
        account=parsed.get("account"),
        balance=parsed.get("balance"),
        txn_date=parsed.get("date"),
        status="pending",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ── iMessage scanner ─────────────────────────────────────────────────────────

IMESSAGE_DB = Path.home() / "Library" / "Messages" / "chat.db"

# Known bank sender IDs / display names seen in iMessage
BANK_SENDER_RE = re.compile(
    r"(HDFC|ICICI|SBI|AXIS|KOTAK|YESBNK|INDUSIND|PNB|CANARA|BOB|UNION|IDFCFB|FEDERAL|RBL|PAYTM|HDFCBK|ICICIB|SBIIN|AXISBK)",
    re.IGNORECASE,
)

def _scan_imessage_db(db: Session, user_id: str, days_back: int = 7) -> tuple[list[SmsTransaction], dict]:
    """
    Read macOS Messages.db and ingest any new bank SMS.
    Returns (ingested_rows, debug_info).

    Bug fix: Apple stores timestamps as nanoseconds since 2001-01-01.
    The correct cutoff is: (unix_seconds - 978307200) * 1e9
    NOT: unix_nanoseconds + 978307200_000_000_000 (the old wrong formula).
    """
    APPLE_EPOCH_OFFSET = 978307200  # seconds from 1970-01-01 to 2001-01-01

    debug: dict = {
        "db_exists": IMESSAGE_DB.exists(),
        "db_path": str(IMESSAGE_DB),
        "days_back": days_back,
        "error": None,
        "total_messages_in_window": 0,
        "bank_sender_matches": 0,
        "ingested": 0,
    }

    if not IMESSAGE_DB.exists():
        debug["error"] = f"IMSG-001: chat.db not found at {IMESSAGE_DB}. Enable iMessage + SMS relay in macOS Settings → Messages."
        return [], debug

    # Correct cutoff: convert Unix time → Apple nanoseconds by SUBTRACTING the epoch offset
    cutoff_unix = (datetime.utcnow() - timedelta(days=days_back)).timestamp()
    cutoff_apple_ns = int((cutoff_unix - APPLE_EPOCH_OFFSET) * 1_000_000_000)

    results: list[SmsTransaction] = []
    tmp_path: str | None = None

    try:
        import shutil, tempfile, os

        # Messages.app keeps chat.db open with a write-lock. Connecting
        # directly with ?mode=ro often fails with "unable to open database".
        # Solution: copy to a temp file first — SQLite can open the copy
        # without competing for the lock.
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
            tmp_path = tmp.name
        shutil.copy2(str(IMESSAGE_DB), tmp_path)

        conn = sqlite3.connect(tmp_path, timeout=5)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("""
            SELECT
                m.text,
                m.date,
                h.id AS handle_id,
                h.service
            FROM message m
            LEFT JOIN handle h ON m.handle_id = h.rowid
            WHERE m.is_from_me = 0
              AND m.date > ?
              AND m.text IS NOT NULL
              AND length(m.text) > 10
            ORDER BY m.date DESC
            LIMIT 1000
        """, (cutoff_apple_ns,))
        rows = cur.fetchall()
        conn.close()
    except PermissionError:
        debug["error"] = (
            "IMSG-002: Permission denied copying chat.db. "
            "Grant Full Disk Access to Terminal (or the North OS app) in "
            "System Settings → Privacy & Security → Full Disk Access."
        )
        return [], debug
    except Exception as e:
        debug["error"] = (
            f"IMSG-003: Failed to read chat.db — {e}. "
            "Try: System Settings → Privacy & Security → Full Disk Access "
            "→ add Terminal or the North OS app."
        )
        return [], debug
    finally:
        # Always remove the temp copy
        if tmp_path:
            try:
                import os
                os.unlink(tmp_path)
            except Exception:
                pass

    debug["total_messages_in_window"] = len(rows)

    for row in rows:
        sender = row["handle_id"] or ""
        text = row["text"] or ""

        # Privacy & efficiency: only process messages from known bank alpha-sender IDs.
        # Personal messages from friends/family (phone numbers like +91XXXXXXXXXX or
        # contact names) are silently skipped — we never read personal conversations.
        # The BANK_SENDER_RE matches Indian bank SMS sender IDs (HDFC, ICICI, etc.)
        # The parser is the SECONDARY filter — it confirms the message is a transaction.
        is_bank_sender = bool(BANK_SENDER_RE.search(sender.upper()))
        if is_bank_sender:
            debug["bank_sender_matches"] += 1
        else:
            # Skip personal messages entirely — protect user privacy
            continue

        # Convert Apple timestamp → Python datetime
        ts = datetime.utcfromtimestamp(row["date"] / 1_000_000_000 + APPLE_EPOCH_OFFSET)

        sms_row = _ingest(db, text, sender, "imessage", user_id, ts)
        if sms_row:
            results.append(sms_row)
            debug["ingested"] += 1

    return results, debug


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/inbound", status_code=201)
def receive_sms(payload: InboundSmsPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Webhook called by Android SMS forwarder apps (HTTP SMS, SMS Forwarder, etc.).
    Accept any POST with { body, sender?, received_at?, encrypted? }.
    """
    received_at = None
    if payload.received_at:
        try:
            received_at = datetime.fromisoformat(payload.received_at.replace("Z", "+00:00"))
        except ValueError:
            pass

    row = _ingest(db, payload.body, payload.sender, "android", current_user.id, received_at)
    if row is None:
        return {"status": "duplicate_or_skipped"}
    return {"status": "ok", "id": row.id, "parsed": row.parsed_ok}


@router.post("/import")
def import_sms_transaction(
    payload: SMSImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Mobile-only entry point: the client already parsed the SMS on-device
    (local regex, see BankSmsParser) and asks the backend to create/dedup
    the transaction. The backend never sees the raw SMS body.

    Dedup order:
      1. Same sms_id already imported for this user → return the existing txn.
      2. Same amount + account_last4 + day, on a manually-entered transaction
         (sms_id IS NULL) → mark that transaction "sms_verified" instead of
         creating a duplicate.
      3. Otherwise → create a new Transaction + SmsTransaction record.
    """
    existing_sms = db.query(SmsTransaction).filter(
        SmsTransaction.sms_id == payload.sms_id,
        SmsTransaction.user_id == current_user.id,
    ).first()
    if existing_sms:
        return {"is_duplicate": True, "transaction_id": existing_sms.transaction_id}

    txn_date = date_cls.fromtimestamp(payload.timestamp / 1000)
    txn_type = "income" if payload.direction == "credit" else "expense"

    fingerprint_match = None
    if payload.account_last4:
        fingerprint_match = db.query(Transaction).filter(
            Transaction.user_id == current_user.id,
            Transaction.amount == payload.amount,
            Transaction.account_last4 == payload.account_last4,
            Transaction.date == txn_date,
            Transaction.sms_id.is_(None),
        ).first()

    if fingerprint_match:
        fingerprint_match.sms_id = payload.sms_id
        fingerprint_match.source = "sms_verified"
        sms_rec = SmsTransaction(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            source="android",
            sms_id=payload.sms_id,
            sender=payload.sender,
            raw_body=_NOT_STORED_PLACEHOLDER,
            received_at=datetime.utcfromtimestamp(payload.timestamp / 1000),
            parsed_ok=True,
            txn_type=txn_type,
            amount=payload.amount,
            payee=payload.merchant,
            balance=payload.balance_after,
            txn_date=txn_date.isoformat(),
            status="confirmed",
            transaction_id=fingerprint_match.id,
        )
        db.add(sms_rec)
        db.commit()
        return {"is_duplicate": True, "transaction_id": fingerprint_match.id}

    txn = Transaction(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        amount=payload.amount,
        type=txn_type,
        date=txn_date,
        payee=payload.merchant,
        category=payload.category or "Other",
        account_last4=payload.account_last4,
        source="sms_auto",
        sms_id=payload.sms_id,
        notes=f"Auto-imported from SMS ({payload.sender})",
    )
    db.add(txn)
    db.flush()

    sms_rec = SmsTransaction(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        source="android",
        sms_id=payload.sms_id,
        sender=payload.sender,
        raw_body=_NOT_STORED_PLACEHOLDER,
        received_at=datetime.utcfromtimestamp(payload.timestamp / 1000),
        parsed_ok=True,
        txn_type=txn_type,
        amount=payload.amount,
        payee=payload.merchant,
        balance=payload.balance_after,
        txn_date=txn_date.isoformat(),
        status="confirmed",
        transaction_id=txn.id,
    )
    db.add(sms_rec)
    db.commit()
    return {"is_duplicate": False, "transaction_id": txn.id}


@router.post("/scan-imessage")
def scan_imessage(days_back: int = 7, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Scan macOS Messages.db for recent bank SMS (read-only)."""
    ingested, debug = _scan_imessage_db(db, current_user.id, days_back)
    if debug.get("error"):
        # Return 200 with error detail so the frontend can show a useful message
        return {
            "scanned": False,
            "new_transactions": 0,
            "error_code": debug["error"].split(":")[0],  # e.g. "IMSG-002"
            "error": debug["error"],
            "debug": debug,
        }
    return {
        "scanned": True,
        "new_transactions": len(ingested),
        "debug": debug,
    }


@router.get("/pending", response_model=list[SmsTransactionOut])
def list_pending(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return all pending (not yet confirmed/dismissed) SMS transactions."""
    rows = (
        db.query(SmsTransaction).filter(SmsTransaction.user_id == current_user.id)
        .filter(SmsTransaction.status == "pending", SmsTransaction.parsed_ok == True)  # noqa: E712
        .order_by(SmsTransaction.received_at.desc())
        .all()
    )
    return [_sms_to_out(r) for r in rows]


class ConfirmSmsBody(BaseModel):
    category: Optional[str] = None


@router.post("/pending/{sms_id}/confirm", status_code=201)
def confirm_sms(sms_id: str, body: ConfirmSmsBody = ConfirmSmsBody(), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Confirm a parsed SMS → creates a Transaction record. Returns the full transaction."""
    row = db.query(SmsTransaction).filter(SmsTransaction.user_id == current_user.id).filter(SmsTransaction.id == sms_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="SMS not found")
    if row.status != "pending":
        raise HTTPException(status_code=400, detail=f"SMS is already {row.status}")

    # Parse stored date string → Python date (Transaction.date requires a date object)
    txn_date: date_cls = date_cls.today()
    if row.txn_date:
        try:
            txn_date = date_cls.fromisoformat(row.txn_date)
        except (ValueError, TypeError):
            pass

    txn = Transaction(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        date=txn_date,
        type=row.txn_type or "expense",
        amount=row.amount or 0.0,
        currency=row.currency or "INR",
        payee=row.payee,
        account=row.account,
        category=body.category or None,
        notes=f"Auto-imported from SMS ({row.source})",
        source="sms_auto",
    )
    db.add(txn)

    row.status = "confirmed"
    row.transaction_id = txn.id
    db.commit()
    db.refresh(txn)

    # Return full transaction so the frontend can inject it into the cache immediately
    return {
        "status": "confirmed",
        "transaction": {
            "id": txn.id,
            "type": txn.type,
            "amount": txn.amount,
            "currency": txn.currency,
            "date": txn.date.isoformat(),
            "category": txn.category,
            "account": txn.account,
            "payee": txn.payee,
            "notes": txn.notes,
            "created_at": txn.created_at.isoformat(),
            "updated_at": txn.updated_at.isoformat(),
        },
    }


@router.post("/pending/{sms_id}/dismiss", status_code=200)
def dismiss_sms(sms_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Dismiss — marks SMS as reviewed but not imported."""
    row = db.query(SmsTransaction).filter(SmsTransaction.user_id == current_user.id).filter(SmsTransaction.id == sms_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="SMS not found")
    row.status = "dismissed"
    db.commit()
    return {"status": "dismissed"}


@router.get("/status")
def sms_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Returns availability info for each source."""
    return {
        "imessage_available": IMESSAGE_DB.exists(),
        "android_webhook_url": "/api/v1/sms/inbound",
        "imessage_db_path": str(IMESSAGE_DB),
    }
