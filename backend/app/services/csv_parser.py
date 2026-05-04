"""Bank statement CSV parser.

Auto-detects format for 8 major Indian banks.  Falls back to a generic
column-mapping mode when headers don't match any known bank.

Returned rows are normalised to:
    {date: str (ISO), description: str, amount: float, tx_type: "income"|"expense"}
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import pandas as pd

# ---------------------------------------------------------------------------
# Known bank formats
# ---------------------------------------------------------------------------
@dataclass
class BankFormat:
    name: str           # display name
    date_col: str
    description_col: str
    debit_col: str | None       # separate debit column
    credit_col: str | None      # separate credit column
    amount_col: str | None      # single amount column (+/-)
    balance_col: str | None
    date_formats: list[str]
    # Unique strings that appear in headers for detection
    signature: list[str]
    # How many header rows to skip (some banks put metadata above)
    skip_rows: int = 0


BANK_FORMATS: dict[str, BankFormat] = {
    "hdfc": BankFormat(
        name="HDFC Bank",
        date_col="Date",
        description_col="Narration",
        debit_col="Debit Amount",
        credit_col="Credit Amount",
        amount_col=None,
        balance_col="Closing Balance",
        date_formats=["%d/%m/%y", "%d/%m/%Y", "%d-%m-%Y"],
        signature=["Narration", "Debit Amount", "Credit Amount", "Closing Balance"],
    ),
    "icici": BankFormat(
        name="ICICI Bank",
        date_col="Transaction Date",
        description_col="Details",
        debit_col="Withdrawal Amount (INR )",
        credit_col="Deposit Amount (INR )",
        amount_col=None,
        balance_col="Balance (INR )",
        date_formats=["%d-%m-%Y", "%d/%m/%Y"],
        signature=["Transaction Date", "Withdrawal Amount (INR )"],
    ),
    "icici_alt": BankFormat(
        name="ICICI Bank",
        date_col="Transaction Date",
        description_col="Description",
        debit_col="Debit",
        credit_col="Credit",
        amount_col=None,
        balance_col="Balance",
        date_formats=["%d-%m-%Y", "%d/%m/%Y"],
        signature=["Transaction Date", "Description", "Debit", "Credit", "Balance"],
    ),
    "sbi": BankFormat(
        name="SBI",
        date_col="Txn Date",
        description_col="Description",
        debit_col="Debit",
        credit_col="Credit",
        amount_col=None,
        balance_col="Balance",
        date_formats=["%d %b %Y", "%d/%m/%Y", "%d-%m-%Y"],
        signature=["Txn Date", "Description", "Debit", "Credit", "Balance"],
    ),
    "axis": BankFormat(
        name="Axis Bank",
        date_col="Tran Date",
        description_col="PARTICULARS",
        debit_col="DR",
        credit_col="CR",
        amount_col=None,
        balance_col="BAL",
        date_formats=["%d-%m-%Y", "%d/%m/%Y", "%d %b %Y"],
        signature=["Tran Date", "PARTICULARS", "DR", "CR", "BAL"],
    ),
    "kotak": BankFormat(
        name="Kotak Bank",
        date_col="Date",
        description_col="Description",
        debit_col="Withdrawal Amt (Dr)",
        credit_col="Deposit Amt (Cr)",
        amount_col=None,
        balance_col="Balance",
        date_formats=["%d-%m-%Y", "%d/%m/%Y"],
        signature=["Withdrawal Amt (Dr)", "Deposit Amt (Cr)"],
    ),
    "yes_bank": BankFormat(
        name="Yes Bank",
        date_col="Date",
        description_col="Transaction Details",
        debit_col="Withdrawal (Dr)",
        credit_col="Deposit (Cr)",
        amount_col=None,
        balance_col="Closing Balance (Cr)",
        date_formats=["%d-%m-%Y", "%d/%m/%Y"],
        signature=["Transaction Details", "Withdrawal (Dr)", "Deposit (Cr)"],
    ),
    "idfc": BankFormat(
        name="IDFC First Bank",
        date_col="Transaction Date",
        description_col="Narration",
        debit_col="Debit",
        credit_col="Credit",
        amount_col=None,
        balance_col="Balance",
        date_formats=["%d-%m-%Y", "%d/%m/%Y"],
        signature=["Transaction Date", "Narration", "Debit", "Credit"],
    ),
    "generic_signed": BankFormat(
        name="Generic (signed amount)",
        date_col="Date",
        description_col="Description",
        debit_col=None,
        credit_col=None,
        amount_col="Amount",
        balance_col=None,
        date_formats=["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"],
        signature=["Date", "Description", "Amount"],
    ),
}


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------
def detect_bank(columns: list[str]) -> str | None:
    """Return the bank key whose signature best matches the CSV columns."""
    cols_set = {c.strip() for c in columns}
    best_key: str | None = None
    best_score = 0
    for key, fmt in BANK_FORMATS.items():
        score = sum(1 for s in fmt.signature if s in cols_set)
        if score > best_score and score >= max(2, len(fmt.signature) - 1):
            best_score = score
            best_key = key
    return best_key


# ---------------------------------------------------------------------------
# Amount parsing helpers
# ---------------------------------------------------------------------------
def _clean_amount(val: Any) -> float:
    """Parse amount strings like '1,23,456.78' or '(500.00)' → float."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return 0.0
    s = str(val).strip().replace(",", "").replace(" ", "")
    # Handle parenthesis as negative: (500) → -500
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    try:
        return float(s)
    except ValueError:
        return 0.0


def _parse_date(val: Any, formats: list[str]) -> str | None:
    """Try to parse a date value with multiple formats. Returns ISO string."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip()
    if not s:
        return None
    # pandas may have already parsed it
    if isinstance(val, pd.Timestamp):
        return val.date().isoformat()
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    # Try pandas as fallback
    try:
        return pd.to_datetime(s, dayfirst=True).date().isoformat()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Normalised row
# ---------------------------------------------------------------------------
@dataclass
class ParsedRow:
    date: str           # ISO
    description: str
    amount: float       # always positive
    tx_type: str        # "income" | "expense"
    raw_index: int      # row index in original CSV (for dedup reference)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def parse_csv(
    content: bytes,
    bank_key: str | None = None,
    column_mapping: dict[str, str] | None = None,
) -> tuple[list[ParsedRow], str | None, list[str]]:
    """Parse a CSV bank statement.

    Args:
        content:         Raw CSV bytes.
        bank_key:        Override bank detection (use BANK_FORMATS key).
        column_mapping:  Manual mapping when bank not auto-detected.
                         Keys: "date", "description", "debit", "credit", "amount"
                         Values: actual CSV column names.

    Returns:
        (rows, detected_bank_key, all_columns)
        rows: list of ParsedRow
        detected_bank_key: the bank key used (None if manual mapping)
        all_columns: original column names (for frontend mapper)
    """
    # Try to read CSV, handling common encoding issues
    try:
        df = pd.read_csv(io.BytesIO(content), dtype=str, encoding="utf-8-sig")
    except Exception:
        df = pd.read_csv(io.BytesIO(content), dtype=str, encoding="latin-1")

    # Strip whitespace from column names
    df.columns = [str(c).strip() for c in df.columns]
    all_columns = list(df.columns)

    # Auto-detect if not provided
    if bank_key is None and column_mapping is None:
        bank_key = detect_bank(all_columns)

    fmt: BankFormat | None = BANK_FORMATS.get(bank_key) if bank_key else None

    # Build mapping from BankFormat or manual override
    if fmt:
        date_col = fmt.date_col
        desc_col = fmt.description_col
        debit_col = fmt.debit_col
        credit_col = fmt.credit_col
        amount_col = fmt.amount_col
        date_formats = fmt.date_formats
    elif column_mapping:
        date_col = column_mapping.get("date", "Date")
        desc_col = column_mapping.get("description", "Description")
        debit_col = column_mapping.get("debit")
        credit_col = column_mapping.get("credit")
        amount_col = column_mapping.get("amount")
        date_formats = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d %b %Y"]
        bank_key = None
    else:
        # No format known — return empty rows so frontend can show mapper
        return [], None, all_columns

    rows: list[ParsedRow] = []
    for idx, row in df.iterrows():
        date_str = _parse_date(row.get(date_col), date_formats)
        if not date_str:
            continue  # skip rows with no date (headers, footers, blank lines)

        desc = str(row.get(desc_col, "")).strip()
        if not desc or desc.lower() in ("nan", "none"):
            continue

        if debit_col and credit_col:
            debit = _clean_amount(row.get(debit_col))
            credit = _clean_amount(row.get(credit_col))
            if debit > 0:
                amount, tx_type = debit, "expense"
            elif credit > 0:
                amount, tx_type = credit, "income"
            else:
                continue  # skip zero-value rows
        elif amount_col:
            raw = _clean_amount(row.get(amount_col))
            if raw < 0:
                amount, tx_type = abs(raw), "expense"
            elif raw > 0:
                amount, tx_type = raw, "income"
            else:
                continue
        else:
            continue

        rows.append(ParsedRow(
            date=date_str,
            description=desc,
            amount=round(amount, 2),
            tx_type=tx_type,
            raw_index=int(str(idx)),
        ))

    return rows, bank_key, all_columns


def get_bank_display_name(bank_key: str | None) -> str | None:
    if bank_key and bank_key in BANK_FORMATS:
        return BANK_FORMATS[bank_key].name
    return None


BANK_KEYS = {k: v.name for k, v in BANK_FORMATS.items()}
