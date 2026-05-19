"""Bank statement CSV parser.

Auto-detects format for 8 major Indian banks.  Falls back to a generic
column-mapping mode when headers don't match any known bank.

Returned rows are normalised to:
    {date: str (ISO), description: str, amount: float, tx_type: "income"|"expense"}
"""
from __future__ import annotations

import csv as _csv
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
    # Credit-card mode: single amount column where "Cr" suffix = income (payment)
    cc_format: bool = False
    # Separate column whose value indicates CR/DR (e.g. IDFC mini-statement)
    txtype_col: str | None = None


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
    # HDFC NetBanking export uses "Withdrawal Amt." / "Deposit Amt." instead of
    # "Debit Amount" / "Credit Amount" — same bank, different download path.
    "hdfc_alt": BankFormat(
        name="HDFC Bank",
        date_col="Date",
        description_col="Narration",
        debit_col="Withdrawal Amt.",
        credit_col="Deposit Amt.",
        amount_col=None,
        balance_col="Closing Balance",
        date_formats=["%d/%m/%y", "%d/%m/%Y", "%d-%m-%Y"],
        signature=["Narration", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"],
    ),
    # ICICI Bank netbanking CSV — "Transaction Remarks" is the correct 2025 column name.
    # Columns: S No. | Value Date | Transaction Date | Cheque Number |
    #          Transaction Remarks | Withdrawal Amount (INR ) | Deposit Amount (INR ) | Balance (INR )
    # Note: ICICI exports a literal space before the closing paren → "INR )" not "INR)".
    "icici": BankFormat(
        name="ICICI Bank",
        date_col="Transaction Date",
        description_col="Transaction Remarks",
        debit_col="Withdrawal Amount (INR )",
        credit_col="Deposit Amount (INR )",
        amount_col=None,
        balance_col="Balance (INR )",
        date_formats=["%d-%m-%Y", "%d/%m/%Y"],
        signature=["Transaction Date", "Transaction Remarks", "Withdrawal Amount (INR )"],
    ),
    # ICICI Bank newer netbanking format (2024+): simpler header row using
    # "Date" / "Narration" / "Cheque No." / "Debit" / "Credit" / "Balance"
    "icici_narration": BankFormat(
        name="ICICI Bank",
        date_col="Date",
        description_col="Narration",
        debit_col="Debit",
        credit_col="Credit",
        amount_col=None,
        balance_col="Balance",
        date_formats=["%d/%m/%Y", "%d-%m-%Y"],
        # "Date" (not "Transaction Date") + "Cheque No." prevents collision with
        # IDFC format which also has Narration/Debit/Credit but uses "Transaction Date".
        # 6-item signature → threshold = 5, so an IDFC file missing "Date"/"Cheque No."
        # cannot reach the threshold and won't be misdetected.
        signature=["Date", "Narration", "Cheque No.", "Debit", "Credit", "Balance"],
    ),
    # ICICI Bank legacy / corporate format with "Description", "Debit", "Credit"
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
    # Axis Bank newer internet-banking export — uses "Transaction Date" / "Description"
    # instead of the older "Tran Date" / "PARTICULARS". The "Cheque No" column
    # differentiates this from ICICI Bank's similar layout.
    "axis_alt": BankFormat(
        name="Axis Bank",
        date_col="Transaction Date",
        description_col="Description",
        debit_col="Debit",
        credit_col="Credit",
        amount_col=None,
        balance_col="Balance",
        date_formats=["%d-%m-%Y", "%d/%m/%Y", "%d %b %Y"],
        signature=["Transaction Date", "Cheque No", "Description", "Debit", "Credit", "Balance"],
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
        # 5-item signature (threshold=4) beats icici_alt (4/5) when IDFC file
        # has "Narration" instead of "Description".
        signature=["Transaction Date", "Narration", "Debit", "Credit", "Balance"],
    ),
    # IDFC PDF statement — uses "Particulars" instead of "Narration" and
    # "dd-Mon-YYYY" date format (e.g. 01-Feb-2026).
    "idfc_pdf": BankFormat(
        name="IDFC First Bank",
        date_col="Transaction Date",
        description_col="Particulars",
        debit_col="Debit",
        credit_col="Credit",
        amount_col=None,
        balance_col="Balance",
        date_formats=["%d-%b-%Y", "%d-%m-%Y", "%d/%m/%Y"],
        signature=["Transaction Date", "Particulars", "Debit", "Credit", "Balance"],
    ),
    # IDFC mini-statement XLS — single Amount(INR) column + separate CR/DR column.
    "idfc_mini": BankFormat(
        name="IDFC First Bank (Mini Statement)",
        date_col="Transaction Date",
        description_col="Transaction Remark",
        debit_col=None,
        credit_col=None,
        amount_col="Amount(INR)",
        txtype_col="CR/DR",
        balance_col=None,
        date_formats=["%d/%m/%Y", "%d-%m-%Y"],
        signature=["Transaction Remark", "CR/DR", "Amount(INR)"],
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

    # ── Credit Card formats ──────────────────────────────────────────────────
    # In CC statements a single "Amount" column is used.
    # Rows with a "Cr" suffix are payments (income); everything else is expense.

    "hdfc_cc": BankFormat(
        name="HDFC Credit Card",
        date_col="Date",
        description_col="Narration",
        debit_col=None,
        credit_col=None,
        amount_col="Amount",
        balance_col=None,
        date_formats=["%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y"],
        signature=["Date", "Narration", "Amount"],
        cc_format=True,
    ),
    "icici_cc": BankFormat(
        name="ICICI Credit Card",
        date_col="Transaction Date",
        description_col="Transaction Description",
        debit_col=None,
        credit_col=None,
        amount_col="Amount (INR)",
        balance_col=None,
        date_formats=["%d/%m/%Y", "%d-%m-%Y"],
        signature=["Transaction Date", "Transaction Description", "Amount (INR)"],
        cc_format=True,
    ),
    "axis_cc": BankFormat(
        name="Axis Credit Card",
        date_col="Tran Date",
        description_col="Transaction Details",
        debit_col=None,
        credit_col=None,
        amount_col="Amount (INR)",
        balance_col=None,
        date_formats=["%d-%m-%Y", "%d/%m/%Y", "%d %b %Y"],
        signature=["Tran Date", "Transaction Details", "Amount (INR)"],
        cc_format=True,
    ),
    "sbi_cc": BankFormat(
        name="SBI Credit Card",
        date_col="Txn Date",
        description_col="Transaction",
        debit_col=None,
        credit_col=None,
        amount_col="Amount",
        balance_col=None,
        date_formats=["%d/%m/%Y", "%d-%m-%Y", "%d %b %Y"],
        signature=["Txn Date", "Transaction", "Amount"],
        cc_format=True,
    ),
    "kotak_cc": BankFormat(
        name="Kotak Credit Card",
        date_col="Transaction Date",
        description_col="Description",
        debit_col=None,
        credit_col=None,
        amount_col="Amount (INR)",
        balance_col=None,
        date_formats=["%d-%m-%Y", "%d/%m/%Y"],
        signature=["Transaction Date", "Description", "Amount (INR)"],
        cc_format=True,
    ),
    "amex_cc": BankFormat(
        name="American Express",
        date_col="Date",
        description_col="Description",
        debit_col=None,
        credit_col=None,
        amount_col="Amount",
        balance_col=None,
        date_formats=["%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"],
        signature=["Date", "Description", "Amount", "Reference"],
        cc_format=True,
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
    """Parse amount strings like '1,23,456.78', '(500.00)', '450 Cr', 'INR 2,000.00' → float."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return 0.0
    s = str(val).strip()
    # Strip trailing Cr / Dr / CR / DR labels (credit-card statement notation)
    s = re.sub(r"\s*(Cr|Dr|CR|DR)\.?\s*$", "", s, flags=re.IGNORECASE)
    # Strip leading currency prefix: "INR ", "₹", "$", "€", "USD " etc.
    s = re.sub(r"^[A-Z]{1,3}\s+", "", s, flags=re.IGNORECASE)   # e.g. "INR "
    s = re.sub(r"^[^\d\(\-]+", "", s)                            # any remaining symbol
    s = s.replace(",", "").replace(" ", "")
    # Handle parenthesis as negative: (500) → -500
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    try:
        return float(s)
    except ValueError:
        return 0.0


def _cc_tx_type(val: Any) -> str:
    """For credit-card statements: 'Cr' suffix = income (payment to card), else expense."""
    s = str(val).strip()
    return "income" if re.search(r"\bCr\b", s, re.IGNORECASE) else "expense"


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
# Header-row finder
# ---------------------------------------------------------------------------
def _find_header_row(content: bytes, max_scan: int = 30) -> int:
    """Scan the first max_scan rows to find the row that contains actual column headers.

    Strategy:
      1. For each candidate row, parse it as CSV and collect cell values.
      2. First pass — check against every known bank signature; return immediately on match.
      3. Second pass — fall back to the row with the most header-like cells (non-empty,
         contains at least one letter, short enough to be a label, not "Unnamed:…").

    Returns the 0-based row index to pass as ``header=`` to pandas.
    """
    try:
        text = content.decode("utf-8-sig", errors="replace")
    except Exception:
        text = content.decode("latin-1", errors="replace")

    lines = text.splitlines()

    def _row_cells(line: str) -> list[str]:
        try:
            return [c.strip().strip('"').strip("'") for c in next(_csv.reader([line]))]
        except Exception:
            return [c.strip() for c in line.split(",")]

    # --- Pass 1: known bank signature match ---
    for i, line in enumerate(lines[:max_scan]):
        if not line.strip():
            continue
        cols_set = set(_row_cells(line))
        for fmt in BANK_FORMATS.values():
            score = sum(1 for s in fmt.signature if s in cols_set)
            if score >= max(2, len(fmt.signature) - 1):
                return i

    # --- Pass 2: best header-like row (helps unknown / future banks) ---
    # A header cell: non-empty, has at least one letter (excludes "****" separators),
    # short enough to be a label (< 40 chars), no "Unnamed:" pandas artefacts.
    best_row, best_score = 0, 0
    for i, line in enumerate(lines[:max_scan]):
        if not line.strip():
            continue
        cells = _row_cells(line)
        score = sum(
            1 for c in cells
            if c
            and any(ch.isalpha() for ch in c)   # must contain a letter
            and not c.startswith("Unnamed")
            and len(c) < 40                      # short label, not a prose sentence
        )
        if score > best_score:
            best_score = score
            best_row = i

    return best_row


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
    # Find the actual header row — many banks export metadata rows above the real headers.
    # e.g. HDFC CSV starts with "HDFC BANK Ltd. Page No.: 1 Statement of accounts"
    header_row = _find_header_row(content)

    # Read the CSV starting from the detected header row
    try:
        df = pd.read_csv(io.BytesIO(content), dtype=str, encoding="utf-8-sig", header=header_row)
    except Exception:
        df = pd.read_csv(io.BytesIO(content), dtype=str, encoding="latin-1", header=header_row)

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
            raw_val = row.get(amount_col)
            raw = _clean_amount(raw_val)
            if raw == 0:
                continue
            amount = abs(raw)
            if fmt and fmt.txtype_col:
                # Separate CR/DR indicator column (e.g. IDFC mini-statement)
                txtype_val = str(row.get(fmt.txtype_col, "")).strip()
                tx_type = "income" if re.search(r"\bCr\.?\b", txtype_val, re.IGNORECASE) else "expense"
            elif fmt and fmt.cc_format:
                # Credit-card: use Cr/Dr suffix to determine type; negative = expense
                tx_type = _cc_tx_type(raw_val) if raw >= 0 else "expense"
            else:
                tx_type = "income" if raw > 0 else "expense"
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
