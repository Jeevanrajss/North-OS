"""
Indian bank SMS parser.

Supports: HDFC, ICICI, SBI, Axis, Kotak, Yes Bank, IndusInd, PNB,
          Canara, BOB, Union, IDFC, Federal, RBL, Standard Chartered,
          and generic UPI/GPay/PhonePe patterns.

Returns a dict with keys:
  ok, type, amount, currency, payee, account, balance, date
"""
from __future__ import annotations
import re
from datetime import datetime, date
from typing import Optional


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clean(text: str) -> str:
    return " ".join(text.split())


def _parse_amount(raw: str) -> Optional[float]:
    raw = raw.replace(",", "").strip()
    try:
        return float(raw)
    except ValueError:
        return None


def _today_str() -> str:
    return date.today().isoformat()


def _parse_date(raw: str) -> str:
    """Try to convert common Indian bank date formats to YYYY-MM-DD."""
    raw = raw.strip()
    formats = [
        # ISO / 4-digit year first — prevents "26-05-16" misparse of "2026-05-16"
        "%Y-%m-%d", "%Y/%m/%d",
        "%d-%m-%y", "%d/%m/%y", "%d-%m-%Y", "%d/%m/%Y",
        "%d-%b-%y", "%d-%b-%Y", "%d %b %Y", "%d %b %y",
        "%d%m%y", "%d%m%Y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return _today_str()


# ---------------------------------------------------------------------------
# Regex building blocks
# ---------------------------------------------------------------------------

AMT_RE   = r"(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)"
DATE_RE  = (
    r"(\d{4}[-/]\d{1,2}[-/]\d{1,2}"           # ISO: 2026-05-16 (must match FIRST)
    r"|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}"         # 12-05-25 / 12/05/2025
    r"|\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{2,4})"
)


# Debit patterns (expense)
DEBIT_PATTERNS = [
    # "debited by / debited for"
    re.compile(
        rf"(?:debited|debit(?:ed)?\s+(?:for|by|with|of))\s+{AMT_RE}",
        re.IGNORECASE,
    ),
    # "Rs. 500 debited"
    re.compile(
        rf"{AMT_RE}\s+(?:has\s+been\s+)?debited",
        re.IGNORECASE,
    ),
    # "spent Rs. / Spent of Rs."
    re.compile(
        rf"spent\s+(?:of\s+)?{AMT_RE}",
        re.IGNORECASE,
    ),
    # "withdrawal of Rs."
    re.compile(
        rf"withdrawal\s+(?:of\s+)?{AMT_RE}",
        re.IGNORECASE,
    ),
    # UPI/purchase: "Payment of Rs."
    re.compile(
        rf"payment\s+(?:of\s+)?{AMT_RE}",
        re.IGNORECASE,
    ),
    # UPI: "Rs.350 sent to"
    re.compile(
        rf"{AMT_RE}\s+sent\s+to",
        re.IGNORECASE,
    ),
    # HDFC UPI transfer: "Sent Rs.1.00 From HDFC Bank A/C ... To ..."
    re.compile(
        rf"\bSent\s+{AMT_RE}",
        re.IGNORECASE,
    ),
    # ATM: "Rs.1,200 withdrawn"
    re.compile(
        rf"{AMT_RE}\s+withdrawn",
        re.IGNORECASE,
    ),
    # "transferred Rs. / transfer of Rs."
    re.compile(
        rf"transfer(?:red)?\s+(?:of\s+)?{AMT_RE}",
        re.IGNORECASE,
    ),
]

# Credit patterns (income)
CREDIT_PATTERNS = [
    re.compile(
        rf"(?:credited|credit(?:ed)?\s+(?:for|by|with|of))\s+{AMT_RE}",
        re.IGNORECASE,
    ),
    re.compile(
        rf"{AMT_RE}\s+(?:has\s+been\s+)?credited",
        re.IGNORECASE,
    ),
    re.compile(
        rf"(?:received|deposited)\s+{AMT_RE}",
        re.IGNORECASE,
    ),
]

# Balance remaining
BAL_RE = re.compile(
    rf"(?:bal(?:ance)?|avl|available)\s*(?:is|:)?\s*{AMT_RE}",
    re.IGNORECASE,
)

# Account number (last 4 digits)
ACCT_RE = re.compile(
    r"(?:a/c|acct?|account|card|a\.c\.?)\s*[*xX]+(\d{4,6})",
    re.IGNORECASE,
)

# Payee / merchant
PAYEE_PATTERNS = [
    re.compile(r"(?:at|to|from|merchant[:\s]+)\s+([A-Za-z0-9 &'.\-]{3,40}?)(?:\s+on|\s+ref|\s+upi|\.|\Z)", re.IGNORECASE),
    re.compile(r"(?:tran(?:s(?:fer)?)?\s+to)\s+([A-Za-z0-9 &'.\-]{3,40}?)(?:\s+on|\s+ref|\s+upi|\.|\Z)", re.IGNORECASE),
    re.compile(r"\bfor\s+([A-Z][A-Za-z0-9 &'.\-]{2,35}?)(?:\.|$|\s+Avl|\s+on|\s+ref)", re.IGNORECASE),
    re.compile(r"sent\s+to\s+([A-Za-z0-9 &'.\-]{3,40}?)(?:\s+on|\s+ref|\s+upi|\.|\Z)", re.IGNORECASE),
]

# UPI ref
UPI_REF_RE = re.compile(r"UPI[:\s/]+(\d{6,12})", re.IGNORECASE)

# Date in message
DATE_IN_MSG_RE = re.compile(DATE_RE, re.IGNORECASE)


# ---------------------------------------------------------------------------
# Known bank SMS sender IDs
# ---------------------------------------------------------------------------

BANK_SENDERS = {
    "hdfcbk": "HDFC",
    "hdfcbank": "HDFC",
    "icici": "ICICI",
    "icicib": "ICICI",
    "sbiin": "SBI",
    "sbiinb": "SBI",
    "axisbk": "Axis",
    "axisbank": "Axis",
    "kotak": "Kotak",
    "kotakb": "Kotak",
    "yesbnk": "Yes Bank",
    "yesbankltd": "Yes Bank",
    "indbnk": "IndusInd",
    "indusind": "IndusInd",
    "pnbsms": "PNB",
    "cbssms": "Canara",
    "bobsms": "BOB",
    "unionb": "Union Bank",
    "idfcfb": "IDFC First",
    "federalbank": "Federal",
    "rblbank": "RBL",
    "scbank": "Standard Chartered",
    "paytmb": "Paytm",
}


def _sender_bank(sender: Optional[str]) -> Optional[str]:
    if not sender:
        return None
    key = sender.lower().strip("-").replace(" ", "")
    for k, v in BANK_SENDERS.items():
        if k in key:
            return v
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

# Mention an amount but aren't a completed transaction — an OTP precedes the
# real debit SMS, so counting it double-books the payment.
_NOT_A_TXN_RE = re.compile(
    r"\b(otp|one[\s-]?time password|verification code|will be debited|is due|due on|has requested|requested money|collect request)\b",
    re.IGNORECASE,
)


def parse_sms(body: str, sender: Optional[str] = None) -> dict:
    """
    Returns:
      { ok, type, amount, currency, payee, account, balance, date }
    ok=False means the SMS wasn't a recognisable transaction.
    """
    body_clean = _clean(body)

    result: dict = {
        "ok": False,
        "type": None,
        "amount": None,
        "currency": "INR",
        "payee": None,
        "account": None,
        "balance": None,
        "date": _today_str(),
    }

    if _NOT_A_TXN_RE.search(body_clean):
        return result

    # ── Detect direction ──────────────────────────────────────────────────
    txn_type: Optional[str] = None
    amount: Optional[float] = None

    for pat in DEBIT_PATTERNS:
        m = pat.search(body_clean)
        if m:
            amount = _parse_amount(m.group(1))
            if amount:
                txn_type = "expense"
                break

    if txn_type is None:
        for pat in CREDIT_PATTERNS:
            m = pat.search(body_clean)
            if m:
                amount = _parse_amount(m.group(1))
                if amount:
                    txn_type = "income"
                    break

    if txn_type is None or amount is None:
        return result  # not a transaction SMS

    result["ok"] = True
    result["type"] = txn_type
    result["amount"] = amount

    # ── Currency ──────────────────────────────────────────────────────────
    if re.search(r"\bUSD\b|\$", body_clean):
        result["currency"] = "USD"
    elif re.search(r"\bEUR\b|€", body_clean):
        result["currency"] = "EUR"

    # ── Account number ────────────────────────────────────────────────────
    am = ACCT_RE.search(body_clean)
    if am:
        bank = _sender_bank(sender) or "Bank"
        result["account"] = f"{bank} ···{am.group(1)}"

    # ── Balance ───────────────────────────────────────────────────────────
    bm = BAL_RE.search(body_clean)
    if bm:
        result["balance"] = _parse_amount(bm.group(1))

    # ── Payee / merchant ─────────────────────────────────────────────────
    for pat in PAYEE_PATTERNS:
        pm = pat.search(body_clean)
        if pm:
            payee = pm.group(1).strip().rstrip(".")
            if len(payee) >= 2:
                result["payee"] = payee
                break

    # ── Date ─────────────────────────────────────────────────────────────
    dm = DATE_IN_MSG_RE.search(body_clean)
    if dm:
        result["date"] = _parse_date(dm.group(0))

    return result
