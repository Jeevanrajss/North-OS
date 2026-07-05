"""Pydantic schemas for the Finance API."""
from __future__ import annotations

from datetime import date as date_cls
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.budget import BudgetProgress  # noqa: E402

TransactionType = Literal["income", "expense", "transfer"]

# Pre-seeded category lists shown in the add form.
EXPENSE_CATEGORIES = [
    "Food & Dining",
    "Transport",
    "Shopping",
    "Healthcare",
    "Entertainment",
    "Housing",
    "Utilities",
    "Education",
    "Fitness",
    "Travel",
    "Subscriptions",
    "Splits",      # money you fronted for the group — will be reimbursed
    "Other",
]

INCOME_CATEGORIES = [
    "Salary",
    "Freelance",
    "Investment",
    "Gift",
    "Splits",      # friends paying you back
    "Other Income",
]

ACCOUNT_SUGGESTIONS = [
    "Cash",
    "HDFC Savings",
    "ICICI Savings",
    "SBI Savings",
    "Axis Savings",
    "IDFC First Bank",
    "PhonePe",
    "Google Pay",
    "Amazon Pay",
    "Paytm",
    "Credit Card",
]

CREDIT_CARD_OPTIONS = [
    "HDFC Credit Card",
    "ICICI Credit Card",
    "SBI Credit Card",
    "IDFC First Credit Card",
    "Axis Credit Card",
    "Kotak Credit Card",
    "Yes Bank Credit Card",
    "AmEx Credit Card",
    "IndusInd Credit Card",
]

# Emoji mapping for categories (used by frontend fallback).
CATEGORY_EMOJI: dict[str, str] = {
    "Food & Dining": "🍽️",
    "Transport": "🚗",
    "Shopping": "🛒",
    "Healthcare": "🏥",
    "Entertainment": "🎬",
    "Housing": "🏠",
    "Utilities": "💡",
    "Education": "📚",
    "Fitness": "💪",
    "Travel": "✈️",
    "Subscriptions": "💳",
    "Other": "💸",
    "Salary": "💼",
    "Freelance": "💰",
    "Investment": "📈",
    "Gift": "🎁",
    "Splits": "🤝",
    "Other Income": "💵",
}


def _strip_opt(v: str | None) -> str | None:
    if v is None:
        return None
    return v.strip() or None


class TransactionIn(BaseModel):
    type: TransactionType = "expense"
    amount: float = Field(..., gt=0)
    currency: str = Field(default="INR", max_length=8)
    date: date_cls
    category: str | None = Field(default=None, max_length=60)
    account: str | None = Field(default=None, max_length=60)
    payee: str | None = Field(default=None, max_length=80)
    notes: str | None = None

    @field_validator("category", "account", "payee", mode="before")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return _strip_opt(v)


class TransactionPatch(BaseModel):
    type: TransactionType | None = None
    amount: float | None = Field(default=None, gt=0)
    currency: str | None = None
    date: date_cls | None = None
    category: str | None = None
    account: str | None = None
    payee: str | None = None
    notes: str | None = None

    @field_validator("category", "account", "payee", mode="before")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return _strip_opt(v)


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    amount: float
    currency: str
    date: date_cls
    category: str | None
    account: str | None
    payee: str | None
    notes: str | None
    # Phase 10 — SMS auto-import provenance
    source: str = "manual"
    sms_id: str | None = None
    account_last4: str | None = None
    created_at: datetime
    updated_at: datetime


class CategoryStat(BaseModel):
    category: str
    total: float
    count: int


class MonthlySummary(BaseModel):
    year: int
    month: int
    total_income: float
    total_expense: float
    net: float
    by_category: list[CategoryStat]
    transaction_count: int
    # Budget progress (None when no budget is set)
    budget_overall: BudgetProgress | None = None
    budget_by_category: list[BudgetProgress] = []


class FinanceMeta(BaseModel):
    expense_categories: list[str]
    income_categories: list[str]
    account_suggestions: list[str]
    credit_card_options: list[str]
    category_emoji: dict[str, str]
