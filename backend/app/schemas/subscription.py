"""Pydantic schemas for the Subscriptions API."""
from __future__ import annotations

from datetime import date as date_cls
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator


BillingCycle = Literal["monthly", "yearly", "quarterly", "weekly"]
PaymentType = Literal["credit_card", "debit_card", "upi", "net_banking", "wallet", "other"]

# Monthly-equivalent multipliers for cost normalisation.
MONTHLY_MULT: dict[str, float] = {
    "weekly": 52 / 12,
    "monthly": 1.0,
    "quarterly": 1 / 3,
    "yearly": 1 / 12,
}


class SubscriptionIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    emoji: str = Field(default="💳", max_length=8)
    amount: float = Field(..., ge=0)           # 0 = currently free
    currency: str = Field(default="USD", max_length=8)
    billing_cycle: BillingCycle = "monthly"
    next_billing_date: date_cls
    trial_end_date: date_cls | None = None
    post_trial_amount: float | None = Field(default=None, ge=0)  # price after free period
    payment_type: PaymentType | None = None
    account_name: str | None = Field(default=None, max_length=60)
    category: str | None = Field(default=None, max_length=40)
    notes: str | None = None
    url: str | None = Field(default=None, max_length=255)
    is_autopay: bool = False

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        return v.strip()

    @field_validator("category")
    @classmethod
    def _strip_category(cls, v: str | None) -> str | None:
        return (v.strip() or None) if v is not None else None


class SubscriptionPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    emoji: str | None = Field(default=None, max_length=8)
    amount: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=8)
    billing_cycle: BillingCycle | None = None
    next_billing_date: date_cls | None = None
    trial_end_date: date_cls | None = None
    post_trial_amount: float | None = Field(default=None, ge=0)
    payment_type: PaymentType | None = None
    account_name: str | None = Field(default=None, max_length=60)
    category: str | None = None
    notes: str | None = None
    url: str | None = Field(default=None, max_length=255)
    is_autopay: bool | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str | None) -> str | None:
        return v.strip() if v is not None else None


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    emoji: str
    amount: float
    currency: str
    billing_cycle: str
    next_billing_date: date_cls
    trial_end_date: date_cls | None
    post_trial_amount: float | None
    payment_type: str | None
    account_name: str | None
    category: str | None
    notes: str | None
    url: str | None
    is_autopay: bool
    last_renewed_at: date_cls | None
    paused_at: datetime | None
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def monthly_equivalent(self) -> float:
        return round(self.amount * MONTHLY_MULT.get(self.billing_cycle, 1.0), 2)


class UpcomingRenewal(BaseModel):
    subscription: SubscriptionOut
    days_until: int


class SubscriptionStatsResponse(BaseModel):
    active_count: int
    monthly_total: float
    yearly_total: float
    upcoming_30d: list[UpcomingRenewal]


# Monthly billing forecast — one bucket per month for the next 12 months.
class ForecastMonth(BaseModel):
    year_month: str      # "YYYY-MM"
    total: float         # sum of all bills due in this month (original currencies, no conversion)
    currency: str        # primary currency (most common among bills that month)
    bill_count: int      # number of billing events


class ForecastResponse(BaseModel):
    months: list[ForecastMonth]
