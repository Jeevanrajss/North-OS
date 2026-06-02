"""
SMS auto-import router.

Endpoints
─────────
POST /api/v1/sms/inbound                  Android webhook (direct)
POST /api/v1/sms/sync-httpsms             Pull from HTTP SMS cloud API
POST /api/v1/sms/scan-imessage            Scan macOS Messages.db
GET  /api/v1/sms/pending                  List pending parsed transactions
POST /api/v1/sms/pending/{id}/confirm     Confirm → creates a Transaction
POST /api/v1/sms/pending/{id}/dismiss     Dismiss
GET  /api/v1/sms/status                   Source availability info
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import re
import sqlite3
import uuid
from datetime import date as date_cls, datetime, timedelta
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.finance import Transaction
from app.models.setting import Setting
from app.models.sms_transaction import SmsTransaction
from app.services.sms_parser import parse_sms

HTTPSMS_API = "https://api.httpsms.com"
HTTPSMS_KEY_SETTING       = "http_sms_api_key"
HTTPSMS_LAST_SETTING      = "http_sms_last_sync"      # ISO timestamp of last successful sync
HTTPSMS_ENC_KEY_SETTING   = "http_sms_encryption_key"  # AES-256 passphrase


# ── AES-256-CBC decryption (httpSMS format) ──────────────────────────────────
# The httpSMS Android app:
#   1. SHA-256 hashes the user passphrase → 32-byte AES key
#   2. Generates a random 16-byte IV
#   3. Encrypts with AES-256-CBC
#   4. Prepends the IV to the ciphertext, then base64-encodes the whole thing
#
# Reference: https://httpsms.com/blog/end-to-end-encryption-to-sms-messages/

def _httpsms_decrypt(passphrase: str, b64_payload: str) -> str:
    """Decrypt an httpSMS AES-256-CBC encrypted message. Returns plaintext."""
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.backends import default_backend

    # Derive 32-byte AES key by SHA-256-hashing the passphrase
    key = hashlib.sha256(passphrase.encode()).digest()

    # Fix missing base64 padding (some implementations strip "=" chars)
    padded_b64 = b64_payload.strip() + "=" * (-len(b64_payload.strip()) % 4)
    raw = base64.b64decode(padded_b64)

    # Decode payload: first 16 bytes = IV, rest = ciphertext
    iv, ciphertext = raw[:16], raw[16:]

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    padded = decryptor.update(ciphertext) + decryptor.finalize()

    # Remove PKCS7 padding
    pad_len = padded[-1]
    return padded[:-pad_len].decode("utf-8", errors="replace")

router = APIRouter(prefix="/api/v1/sms", tags=["sms"])


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class InboundSmsPayload(BaseModel):
    body: str
    sender: Optional[str] = None
    received_at: Optional[str] = None   # ISO datetime string, optional
    encrypted: bool = False             # set by httpSMS when E2E encryption is enabled


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


def _already_seen(db: Session, body: str) -> bool:
    """Deduplicate: same raw body ever seen (any status, any age)."""
    return (
        db.query(SmsTransaction)
        .filter(SmsTransaction.raw_body == body)
        .first()
    ) is not None


def _ingest(db: Session, body: str, sender: Optional[str], source: str, received_at: Optional[datetime] = None) -> Optional[SmsTransaction]:
    """Parse and persist one SMS. Returns None if duplicate, not a transaction, or already exists."""
    body = body.strip()
    if not body:
        return None

    parsed = parse_sms(body, sender)

    # Only save SMS that were recognised as bank transactions — skip personal messages entirely
    if not parsed["ok"]:
        return None

    # Dedup: same raw body already seen in last 48 h
    if _already_seen(db, body):
        return None

    row = SmsTransaction(
        id=str(uuid.uuid4()),
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

def _scan_imessage_db(db: Session, days_back: int = 7) -> tuple[list[SmsTransaction], dict]:
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

    try:
        conn = sqlite3.connect(f"file:{IMESSAGE_DB}?mode=ro", uri=True, timeout=5)
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
            "IMSG-002: Permission denied reading chat.db. "
            "Grant Full Disk Access to Terminal (or the North OS app) in "
            "System Settings → Privacy & Security → Full Disk Access."
        )
        return [], debug
    except Exception as e:
        debug["error"] = f"IMSG-003: Failed to read chat.db — {e}"
        return [], debug

    debug["total_messages_in_window"] = len(rows)

    for row in rows:
        sender = row["handle_id"] or ""
        text = row["text"] or ""

        # Pass ALL messages to the parser — it decides what's a transaction.
        # We still skip clearly personal senders (phone numbers that are NOT bank alpha IDs)
        # by checking if the parser thinks it's a bank transaction first.
        # This is more permissive than the old BANK_SENDER_RE pre-filter.
        if BANK_SENDER_RE.search(sender):
            debug["bank_sender_matches"] += 1

        # Convert Apple timestamp → Python datetime
        ts = datetime.utcfromtimestamp(row["date"] / 1_000_000_000 + APPLE_EPOCH_OFFSET)

        sms_row = _ingest(db, text, sender, "imessage", ts)
        if sms_row:
            results.append(sms_row)
            debug["ingested"] += 1

    return results, debug


# ── Endpoints ────────────────────────────────────────────────────────────────

def _resolve_body(body: str, encrypted: bool, db: Session) -> str:
    """Decrypt the SMS body if encryption is enabled, otherwise return as-is."""
    if not encrypted:
        return body
    enc_key_row = db.get(Setting, HTTPSMS_ENC_KEY_SETTING)
    if not enc_key_row or not enc_key_row.value:
        # No key stored — return raw (will likely fail to parse as a bank transaction)
        return body
    try:
        return _httpsms_decrypt(enc_key_row.value.strip(), body)
    except Exception:
        # Decryption failed (wrong key, corrupted payload, etc.) — return raw
        return body


@router.post("/inbound", status_code=201)
def receive_sms(payload: InboundSmsPayload, db: Session = Depends(get_db)):
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

    body = _resolve_body(payload.body, payload.encrypted, db)
    row = _ingest(db, body, payload.sender, "android", received_at)
    if row is None:
        return {"status": "duplicate_or_skipped"}
    return {"status": "ok", "id": row.id, "parsed": row.parsed_ok}


@router.post("/scan-imessage")
def scan_imessage(days_back: int = 7, db: Session = Depends(get_db)):
    """Scan macOS Messages.db for recent bank SMS (read-only)."""
    ingested, debug = _scan_imessage_db(db, days_back)
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
def list_pending(db: Session = Depends(get_db)):
    """Return all pending (not yet confirmed/dismissed) SMS transactions."""
    rows = (
        db.query(SmsTransaction)
        .filter(SmsTransaction.status == "pending", SmsTransaction.parsed_ok == True)  # noqa: E712
        .order_by(SmsTransaction.received_at.desc())
        .all()
    )
    return [_sms_to_out(r) for r in rows]


class ConfirmSmsBody(BaseModel):
    category: Optional[str] = None


@router.post("/pending/{sms_id}/confirm", status_code=201)
def confirm_sms(sms_id: str, body: ConfirmSmsBody = ConfirmSmsBody(), db: Session = Depends(get_db)):
    """Confirm a parsed SMS → creates a Transaction record. Returns the full transaction."""
    row = db.query(SmsTransaction).filter(SmsTransaction.id == sms_id).first()
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
        date=txn_date,
        type=row.txn_type or "expense",
        amount=row.amount or 0.0,
        currency=row.currency or "INR",
        payee=row.payee,
        account=row.account,
        category=body.category or None,
        notes=f"Auto-imported from SMS ({row.source})",
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
def dismiss_sms(sms_id: str, db: Session = Depends(get_db)):
    """Dismiss — marks SMS as reviewed but not imported."""
    row = db.query(SmsTransaction).filter(SmsTransaction.id == sms_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="SMS not found")
    row.status = "dismissed"
    db.commit()
    return {"status": "dismissed"}


@router.get("/debug")
async def sms_debug(db: Session = Depends(get_db)):
    """Full diagnostic — shows every raw API response to pinpoint the issue."""
    key_row = db.get(Setting, HTTPSMS_KEY_SETTING)
    if not key_row or not key_row.value:
        return {"error": "No API key configured"}

    api_key = key_row.value.strip()
    out: dict = {}

    async with httpx.AsyncClient(timeout=20) as client:
        hdrs = {"x-api-key": api_key}

        # ── 1. Phones ────────────────────────────────────────────────────────
        r = await client.get(f"{HTTPSMS_API}/v1/phones", headers=hdrs)
        out["step1_phones"] = {"status": r.status_code, "body": r.json() if r.is_success else r.text[:400]}

        if not r.is_success:
            out["verdict"] = "API key rejected — check it in Settings → SMS Import"
            return out

        phones_data = r.json().get("data", [])
        if not phones_data:
            out["verdict"] = "No phones registered. Open the HTTP SMS Android app and make sure it shows 'Connected'."
            return out

        # Show all fields of the phone object so we know which field is the number
        phone_obj = phones_data[0]
        out["step1_phone_object"] = phone_obj
        # ── 2. Check threads for EVERY registered phone ──────────────────────
        threads_per_sim: dict = {}
        all_threads_for_ui: list = []

        for ph in phones_data:
            sim_owner = ph.get("phone_number") or ph.get("id") or ""
            sim_label = ph.get("sim") or sim_owner
            r2 = await client.get(
                f"{HTTPSMS_API}/v1/message-threads",
                headers=hdrs,
                params={"owner": sim_owner, "skip": 0, "limit": 50},
            )
            threads = r2.json().get("data", []) if r2.is_success else []
            threads_per_sim[sim_label] = {
                "owner": sim_owner,
                "status": r2.status_code,
                "count": len(threads),
                "contacts": [t.get("contact") or t.get("id") for t in threads],
            }
            for t in threads:
                c = t.get("contact") or t.get("id") or ""
                all_threads_for_ui.append({
                    "contact": c,
                    "sim": sim_label,
                    "is_bank": bool(BANK_SENDER_PATTERN.search(c)),
                })

        out["step2_threads_per_sim"] = threads_per_sim
        out["threads"] = all_threads_for_ui

        # ── 3. Verdict ────────────────────────────────────────────────────────
        total_threads = sum(v["count"] for v in threads_per_sim.values())
        if total_threads == 0:
            out["verdict"] = (
                "✗ No threads found on any SIM. "
                "HTTP SMS only captures SMS received AFTER the app was installed. "
                "Make a small UPI payment or bank transaction to trigger a bank SMS, "
                "then run Sync again. "
                "Also ensure the HTTP SMS Android app has 'Read SMS' permission in Android Settings."
            )
        else:
            bank_count = sum(1 for t in all_threads_for_ui if t["is_bank"])
            out["verdict"] = (
                f"✓ Found {total_threads} threads across all SIMs, "
                f"{bank_count} matched as bank senders."
            )

        # ── 4. parse_samples — try ALL bank threads, decrypt if key is set ──────
        enc_key_row = db.get(Setting, HTTPSMS_ENC_KEY_SETTING)
        enc_pass_debug: Optional[str] = enc_key_row.value.strip() if (enc_key_row and enc_key_row.value) else None

        out["parse_samples"] = []
        out["encryption_key_set"] = bool(enc_pass_debug)
        bank_threads = [t for t in all_threads_for_ui if t["is_bank"]]

        for bt in bank_threads:
            if len(out["parse_samples"]) >= 10:
                break  # cap at 10 total samples
            bt_owner = next(
                (v["owner"] for k, v in threads_per_sim.items() if k == bt["sim"]),
                phones_data[0].get("phone_number") or phones_data[0].get("id"),
            )
            r5 = await client.get(
                f"{HTTPSMS_API}/v1/messages",
                headers=hdrs,
                params={"owner": bt_owner, "contact": bt["contact"], "skip": 0, "limit": 3},
            )
            if not r5.is_success:
                continue
            for m in r5.json().get("data", []):
                raw_body = m.get("content") or ""
                is_enc = bool(m.get("encrypted"))

                # Attempt decryption
                body = raw_body
                decrypt_ok = False
                decrypt_error = None
                if is_enc and enc_pass_debug and raw_body:
                    try:
                        body = _httpsms_decrypt(enc_pass_debug, raw_body)
                        decrypt_ok = True
                    except Exception as e:
                        decrypt_error = str(e)

                p = parse_sms(body, bt["contact"])
                out["parse_samples"].append({
                    "sender": bt["contact"],
                    "sim": bt["sim"],
                    "msg_type_field": m.get("type"),
                    "encrypted": is_enc,
                    "decrypt_ok": decrypt_ok,
                    "decrypt_error": decrypt_error,
                    "body_preview": body[:120] if decrypt_ok else f"[RAW ENCRYPTED] {raw_body[:80]}",
                    "parsed_ok": p["ok"],
                    "parsed_type": p.get("type"),
                    "parsed_amount": p.get("amount"),
                    "parsed_date": p.get("date"),
                })

    return out


@router.get("/status")
def sms_status(db: Session = Depends(get_db)):
    """Returns availability info for each source."""
    key_row = db.get(Setting, HTTPSMS_KEY_SETTING)
    last_row = db.get(Setting, HTTPSMS_LAST_SETTING)
    enc_row  = db.get(Setting, HTTPSMS_ENC_KEY_SETTING)
    api_key_set = bool(key_row and key_row.value)
    return {
        "imessage_available": IMESSAGE_DB.exists(),
        "android_webhook_url": "/api/v1/sms/inbound",
        "imessage_db_path": str(IMESSAGE_DB),
        "httpsms_configured": api_key_set,
        "httpsms_last_sync": last_row.value if last_row else None,
        "httpsms_encryption_enabled": bool(enc_row and enc_row.value),
    }


# ── HTTP SMS cloud sync ───────────────────────────────────────────────────────

BANK_SENDER_PATTERN = re.compile(
    r"(HDFC|ICICI|SBI|AXIS|KOTAK|YESBNK|INDUS|PNB|CANARA|BOB|UNION|IDFC|FEDERAL|RBL|PAYTM|AMEX|SCBANK|HDFCBK|ICICIB|SBIIN|AXISBK|KOTAKB|INDBNK|PNBSMS)",
    re.IGNORECASE,
)


def _raise_httpsms_error(resp: httpx.Response, context: str) -> None:
    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="Invalid HTTP SMS API key. Check Settings → SMS Import.")
    if not resp.is_success:
        try:
            detail = resp.json().get("message") or resp.text[:200]
        except Exception:
            detail = resp.text[:200]
        raise HTTPException(status_code=502, detail=f"HTTP SMS {context}: {detail}")


async def _get_phones(client: httpx.AsyncClient, api_key: str) -> list[str]:
    """Return phone numbers registered on this HTTP SMS account."""
    resp = await client.get(f"{HTTPSMS_API}/v1/phones", headers={"x-api-key": api_key})
    _raise_httpsms_error(resp, "GET /v1/phones")
    phones = resp.json().get("data", [])
    return [p.get("phone_number") or p.get("id") for p in phones if p.get("phone_number") or p.get("id")]


async def _get_all_threads(client: httpx.AsyncClient, api_key: str, owner: str) -> list[str]:
    """Return ALL thread contacts for a phone (no bank-name pre-filter)."""
    contacts: list[str] = []
    skip, limit = 0, 100

    while True:
        resp = await client.get(
            f"{HTTPSMS_API}/v1/message-threads",
            headers={"x-api-key": api_key},
            params={"owner": owner, "skip": skip, "limit": limit},
        )
        _raise_httpsms_error(resp, "GET /v1/message-threads")
        threads = resp.json().get("data", [])
        if not threads:
            break
        for t in threads:
            c = t.get("contact") or t.get("id") or ""
            if c:
                contacts.append(c)
        if len(threads) < limit:
            break
        skip += limit

    return contacts


async def _fetch_recent_messages(
    client: httpx.AsyncClient,
    api_key: str,
    owner: str,
    contact: str,
    last_sync: Optional[datetime],
    per_contact_limit: int = 20,
) -> list[dict]:
    """Fetch received messages from one thread, newest first, stopping at last_sync."""
    results: list[dict] = []
    resp = await client.get(
        f"{HTTPSMS_API}/v1/messages",
        headers={"x-api-key": api_key},
        params={"owner": owner, "contact": contact, "skip": 0, "limit": per_contact_limit},
    )
    _raise_httpsms_error(resp, f"GET /v1/messages (contact={contact})")

    for msg in resp.json().get("data", []):
        # Skip outgoing messages sent from the phone
        if "mobile-originating" in (msg.get("type") or ""):
            continue

        ts_str = msg.get("created_at") or msg.get("received_at") or ""
        msg_ts: Optional[datetime] = None
        if ts_str:
            try:
                msg_ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError:
                pass

        if last_sync and msg_ts and msg_ts <= last_sync:
            break   # messages are newest-first; once we hit last_sync we can stop

        results.append(msg)

    return results


@router.post("/sync-httpsms")
async def sync_httpsms(db: Session = Depends(get_db)):
    """
    Pull incoming SMS from ALL threads, run the parser on every message,
    and save the ones that look like bank transactions.
    No pre-filtering by sender name — the parser is the only filter.
    """
    key_row = db.get(Setting, HTTPSMS_KEY_SETTING)
    if not key_row or not key_row.value:
        raise HTTPException(
            status_code=400,
            detail="HTTP SMS API key not configured. Save it in Settings → SMS Import.",
        )

    api_key = key_row.value.strip()
    last_row = db.get(Setting, HTTPSMS_LAST_SETTING)
    last_sync: Optional[datetime] = None
    if last_row and last_row.value:
        try:
            last_sync = datetime.fromisoformat(last_row.value)
        except ValueError:
            pass

    # Load encryption key (may be None if user hasn't enabled E2E encryption)
    enc_key_row = db.get(Setting, HTTPSMS_ENC_KEY_SETTING)
    enc_passphrase: Optional[str] = enc_key_row.value.strip() if (enc_key_row and enc_key_row.value) else None

    ingested = 0
    checked = 0
    bank_threads_seen = 0

    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Get phone number(s)
        phones = await _get_phones(client, api_key)
        if not phones:
            raise HTTPException(status_code=400, detail="No phones found on this HTTP SMS account.")

        for owner in phones:
            # 2. Get all threads, then keep only those whose contact looks like a bank sender
            all_contacts = await _get_all_threads(client, api_key, owner)
            bank_contacts = [c for c in all_contacts if BANK_SENDER_PATTERN.search(c)]
            bank_threads_seen += len(bank_contacts)

            # 3. Fetch recent messages only from bank-sender threads in parallel
            tasks = [
                _fetch_recent_messages(client, api_key, owner, contact, last_sync)
                for contact in bank_contacts
            ]
            all_results = await asyncio.gather(*tasks, return_exceptions=True)

            for contact, result in zip(bank_contacts, all_results):
                if isinstance(result, Exception):
                    continue   # skip threads that error (e.g. empty/deleted)
                for msg in result:
                    checked += 1
                    content = msg.get("content") or msg.get("body") or ""
                    sender  = msg.get("contact") or contact
                    ts_str  = msg.get("created_at") or ""
                    msg_ts: Optional[datetime] = None
                    if ts_str:
                        try:
                            msg_ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00")).replace(tzinfo=None)
                        except ValueError:
                            pass

                    # Decrypt if the message is marked encrypted and we have a key
                    if msg.get("encrypted") and enc_passphrase:
                        try:
                            content = _httpsms_decrypt(enc_passphrase, content)
                        except Exception:
                            pass  # fall through with raw content; parser will skip it

                    # _ingest calls parse_sms internally; only saves if parsed_ok=True
                    row = _ingest(db, content, sender, "android", msg_ts)
                    if row and row.parsed_ok:
                        ingested += 1

    # Save last sync watermark
    now_str = datetime.utcnow().isoformat()
    if last_row:
        last_row.value = now_str
    else:
        db.add(Setting(key=HTTPSMS_LAST_SETTING, value=now_str))
    db.commit()

    return {
        "synced": True,
        "bank_threads": bank_threads_seen,
        "messages_checked": checked,
        "new_transactions": ingested,
        "synced_at": now_str,
    }
