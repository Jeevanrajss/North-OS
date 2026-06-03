"""Schemas for CSV import and monthly report."""
from __future__ import annotations

from pydantic import BaseModel


class ImportPreviewRow(BaseModel):
    row_index: int
    date: str                       # ISO date
    description: str
    amount: float
    tx_type: str                    # "income" | "expense"
    suggested_category: str
    is_duplicate: bool
    duplicate_txn_id: str | None    # ID of existing transaction if duplicate
    # Phase 7 detection fields
    is_emi: bool = False
    is_tax_fee: bool = False
    is_cc_payment: bool = False
    is_investment: bool = False                    # SIP / MF / PPF detected
    suggested_debt_id: str | None = None
    suggested_debt_name: str | None = None         # label for loan dropdown
    suggested_investment_id: str | None = None
    suggested_investment_name: str | None = None   # label for investment dropdown
    installment_info: str | None = None            # "3 of 12"
    skip_by_default: bool = False
    skip_reason: str | None = None                 # shown to user when skip_by_default=True


class ImportPreviewResponse(BaseModel):
    bank_detected: str | None       # e.g. "HDFC Bank" or None
    bank_key: str | None            # internal key for re-submit
    needs_column_mapping: bool
    available_columns: list[str]    # raw CSV columns (for mapper)
    rows: list[ImportPreviewRow]
    total_rows: int
    duplicate_count: int


class ColumnMapping(BaseModel):
    date: str
    description: str
    debit: str | None = None
    credit: str | None = None
    amount: str | None = None       # single signed-amount column


class ConfirmRow(BaseModel):
    row_index: int
    date: str
    description: str
    amount: float
    tx_type: str
    category: str
    notes: str | None = None
    include: bool = True            # False = user chose to skip
    # Phase 7 fields
    debt_id: str | None = None         # user's selected loan for EMI rows
    investment_id: str | None = None   # user's selected investment for SIP rows
    tax_amount: float | None = None    # tax portion for tax_fee rows


class ImportConfirmRequest(BaseModel):
    account_id: str                 # FK to accounts table
    account_name: str               # used as transaction.account text
    rows: list[ConfirmRow]


class ImportConfirmResponse(BaseModel):
    imported: int
    skipped: int


class ReportCategoryStat(BaseModel):
    category: str
    total: float
    count: int


class ReportBudgetRow(BaseModel):
    category: str | None
    budget: float
    spent: float
    pct: float


class MonthlyReportResponse(BaseModel):
    year: int
    month: int
    total_income: float
    total_expense: float
    net: float
    savings_rate: float
    transaction_count: int
    by_category: list[ReportCategoryStat]
    budget_overall: ReportBudgetRow | None
    budget_by_category: list[ReportBudgetRow]
    transactions: list[dict]        # raw transaction dicts for the table
