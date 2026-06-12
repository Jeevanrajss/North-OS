# North OS — Implementation Plan

> **Reading order:** `APP_REPORT.md` first (what exists, key decisions, architecture) → this file (how to build next). Never start writing code without reading both.

**Vision:** Track Everything → Understand Patterns → Generate Insights → Improve Life  
**Current version:** v1.1.1  
**Active work:** None — all 7 phases shipped. Phase 7 spec below is the reference for any future Finance module extensions.

---

## Completed phases — summary

Phases 1–6 are committed to `main`. Do not re-implement them. This table exists for orientation only.

| Phase | What was built | Status |
|---|---|---|
| **1 — Analytics Engine** | `AnalyticsSnapshot` model (one row/day). `analytics_engine.py` computes 7 cross-module correlations (mood vs habits, expense vs mood, journal vs habits, best/worst weekday). `/api/v1/analytics/` router. Nightly scheduler job at 00:05. AI chat context upgraded with correlation data. | ✅ Done |
| **2 — Goals** | `Goal` model with 5 types: habit_streak, habit_rate, finance_save, finance_spend, custom. `/goals` route. Live progress computed from linked habit checkins or transactions. Dashboard card. Goals in AI context. | ✅ Done |
| **3 — Weekly Review** | Sunday 19:00 scheduler job generates AI cross-module digest, pushes as notification. De-duplicated per week. Opt-out toggle in Settings (`notif.weekly_review_enabled`). | ✅ Done |
| **4 — Morning Briefing upgrade** | Pattern-aware nudge added to briefing prompt. Uses Phase 1 correlation data. "Today is historically your worst habit day" style insight. Refresh button in DashAIBriefing. | ✅ Done |
| **5 — Health module** | ⚠️ **Diverged from plan.** Original spec said "Metric Habits" (extend Habits with numeric tracking_type). What was actually built: standalone `HealthLog` model, `/app/health` route, debounced quick-log for sleep/energy/exercise. HealthLog feeds into analytics snapshots. If Metric Habits is ever needed, the Health module must be reconciled first. | ✅ Done (diverged) |
| **6 — Settings wiring** | Patterns, Goals, Health wired as toggleable modules. Finance advisor schedule setting placeholder added. | ✅ Done |

---

## Phase 7 — Finance Intelligence Layer

**Status:** ✅ Done (shipped in v1.1.0/v1.1.1). Kept below as the reference spec for any future Finance module extensions.  
**Goal:** Turn the Finance module from a cash-flow tracker into a full personal finance advisor. The user sees their complete financial picture — what they owe, what they're building, where they're going — and gets AI guidance on how to get there faster.

**Hard rules for this phase:**
- No stock/investment/buy/sell recommendations anywhere in the AI advisor output
- No tax advice
- No NAV/market-value tracking — only actual invested amounts
- Confirm-first on all EMI settlements before reducing loan balance

**Design decisions (locked — do not change without discussion):**

| Decision | What to do |
|---|---|
| EMI settlement flow | Confirm-first in import review, then auto-reduce `Debt.outstanding` |
| SIP/investment type | `"investment"` is a new 4th transaction type (not an expense subcategory) |
| Savings value shown | Actual invested amount only. Show banner: "This is what you've put in, not current market value." |
| Financial goals | Dedicated `FinancialGoal` model (richer than Phase 2 Goals — has timeline, monthly_needed, is_on_track) |
| Debt payoff strategy | Show Avalanche as recommended + explain why. Show Snowball comparison. User chooses. |
| CC payment rows on import | Pre-checked skip with explanation: "This appears to be a CC bill payment already captured in your bank statement — importing it here would double-count it." |
| Unlinked EMI on import | Show amber warning "No matching loan found — add this loan in the Debt & EMI tab first, then re-import." Do not block import. |
| Tax lines on import | Auto-categorise as "Taxes & Fees". No separate tax stat anywhere. |

**Build order within Phase 7:**
1. New models + Transaction extensions (7.1, 7.2)
2. Import detector service (7.3)
3. Import schema + router wiring (7.4, 7.5)
4. Debt / Investments / Goals routers (7.6)
5. Finance Advisor AI (7.7)
6. Frontend tabs (7.8, 7.9)
7. Settings + Dashboard card (7.10, 7.11)

---

### 7.1 New database models

Register all five new models in `backend/app/db.py` — auto-migration creates the tables on startup:
```python
from app.models.debt import Debt
from app.models.debt_payment import DebtPayment
from app.models.investment import Investment
from app.models.investment_entry import InvestmentEntry
from app.models.financial_goal import FinancialGoal
```

#### `backend/app/models/debt.py`

```python
from __future__ import annotations
import uuid
from datetime import date, datetime
from sqlalchemy import Date, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base

def _uuid() -> str:
    return str(uuid.uuid4())

class Debt(Base):
    """A loan, EMI obligation, or credit card balance."""
    __tablename__ = "debts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    emoji: Mapped[str] = mapped_column(String(10), nullable=False, default="💳")

    # "home_loan" | "personal_loan" | "car_loan" | "two_wheeler_loan"
    # | "education_loan" | "credit_card" | "no_cost_emi" | "other"
    debt_type: Mapped[str] = mapped_column(String(40), nullable=False, default="personal_loan")

    lender: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Last 4 digits of account/loan number — used to auto-match EMI rows in SMS and CC import
    account_last4: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Original sanctioned amount (user-entered when adding)
    principal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Current outstanding balance. Reduced on each confirmed EMI payment.
    outstanding: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Annual interest rate %. Enter 0.0 for no-cost EMI.
    interest_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Fixed monthly EMI amount
    emi_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Day of month EMI is auto-debited (1–31)
    emi_due_day: Mapped[int | None] = mapped_column(Integer, nullable=True)

    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")

    # "active" | "closed" | "paused"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

#### `backend/app/models/debt_payment.py`

```python
from __future__ import annotations
import uuid
from datetime import date, datetime
from sqlalchemy import Date, DateTime, Float, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base

def _uuid() -> str:
    return str(uuid.uuid4())

class DebtPayment(Base):
    """Records each EMI payment against a Debt. Immutable after creation."""
    __tablename__ = "debt_payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    debt_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    transaction_id: Mapped[str | None] = mapped_column(String(36), nullable=True)  # nullable for manual payments

    amount: Mapped[float] = mapped_column(Float, nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Snapshot of Debt.outstanding AFTER this payment was applied
    outstanding_after: Mapped[float] = mapped_column(Float, nullable=False)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

#### `backend/app/models/investment.py`

```python
from __future__ import annotations
import uuid
from datetime import date, datetime
from sqlalchemy import Date, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base

def _uuid() -> str:
    return str(uuid.uuid4())

class Investment(Base):
    """A savings or investment instrument (MF, FD, PPF, NPS, gold, RD, etc.)."""
    __tablename__ = "investments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    emoji: Mapped[str] = mapped_column(String(10), nullable=False, default="📈")

    # "mutual_fund" | "fd" | "ppf" | "nps" | "gold" | "rd" | "savings_account" | "stocks" | "other"
    investment_type: Mapped[str] = mapped_column(String(40), nullable=False, default="mutual_fund")

    # Denormalised running total — recomputed on every entry add/delete
    total_invested: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    sip_amount: Mapped[float | None] = mapped_column(Float, nullable=True)   # monthly SIP
    sip_date: Mapped[int | None] = mapped_column(Integer, nullable=True)     # day of month

    target_amount: Mapped[float | None] = mapped_column(Float, nullable=True)  # optional corpus target
    goal_id: Mapped[str | None] = mapped_column(String(36), nullable=True)     # linked FinancialGoal

    # For SMS/import auto-matching
    account_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    folio_number: Mapped[str | None] = mapped_column(String(50), nullable=True)

    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")

    # "active" | "paused" | "redeemed"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

#### `backend/app/models/investment_entry.py`

```python
from __future__ import annotations
import uuid
from datetime import date, datetime
from sqlalchemy import Date, DateTime, Float, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base

def _uuid() -> str:
    return str(uuid.uuid4())

class InvestmentEntry(Base):
    """Individual investment transaction (SIP instalment, lumpsum, or manual entry)."""
    __tablename__ = "investment_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    investment_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    transaction_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    amount: Mapped[float] = mapped_column(Float, nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # "sip" | "lumpsum" | "manual"
    entry_type: Mapped[str] = mapped_column(String(20), nullable=False, default="sip")

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

#### `backend/app/models/financial_goal.py`

```python
from __future__ import annotations
import json, uuid
from datetime import date, datetime
from sqlalchemy import Date, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base

def _uuid() -> str:
    return str(uuid.uuid4())

class FinancialGoal(Base):
    """A personal financial target with timeline and linked investments."""
    __tablename__ = "financial_goals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    emoji: Mapped[str] = mapped_column(String(10), nullable=False, default="🎯")

    # "emergency_fund" | "purchase" | "education" | "retirement" | "travel" | "wedding" | "other"
    goal_type: Mapped[str] = mapped_column(String(40), nullable=False, default="purchase")

    # "short" = <1yr | "medium" = 1–5yr | "long" = >5yr
    timeline: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")

    target_amount: Mapped[float] = mapped_column(Float, nullable=False)

    # Manually updated OR auto-computed from linked investments' total_invested
    current_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # 1=high | 2=medium | 3=low
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")

    # JSON array of Investment IDs e.g. '["uuid1", "uuid2"]'
    linked_investment_ids: Mapped[str | None] = mapped_column(Text, nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # "active" | "achieved" | "paused"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def linked_ids(self) -> list[str]:
        if self.linked_investment_ids:
            try:
                return json.loads(self.linked_investment_ids)
            except Exception:
                pass
        return []
```

---

### 7.2 Extend existing `Transaction` model

**File:** `backend/app/models/finance.py` — add three columns after the existing `notes` field:

```python
# GST/tax component from CC statement — stored separately so spending analytics exclude taxes
tax_amount: Mapped[float | None] = mapped_column(Float, nullable=True)

# Set when this transaction is an EMI payment. On confirm: DebtPayment created + outstanding reduced.
debt_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

# Set when this transaction is a SIP/investment. On confirm: InvestmentEntry created + total_invested updated.
investment_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
```

`type` field now accepts four values: `"income" | "expense" | "transfer" | "investment"`. Update everywhere type is validated — schemas (`TransactionIn`, `TransactionOut`), frontend dropdowns, and the `_build_data_context` function in `ai.py`.

---

### 7.3 Import detection service

**File:** `backend/app/services/import_detector.py` (new file)

Runs after CSV parsing, before AI categorisation. Classifies each row into: `normal | emi | tax_fee | cc_payment`.

```python
"""
Import detection layer — runs on every row after CSV parsing.
Classifies rows so import_router.py can handle them correctly.
"""
from __future__ import annotations
import re
from dataclasses import dataclass

EMI_PATTERNS = [
    r'\bEMI\b', r'\bE\.M\.I\b',
    r'EMI\s*NO[\.\s]*\d+',
    r'INST(?:ALMENT|ALLMENT)\s*NO[\.\s]*\d+',
    r'INSTALMENT\s*\d+\s*OF\s*\d+',
    r'EMI\s*\d+\s*(?:OF|/)\s*\d+',
    r'LOAN.*EMI|EMI.*LOAN',
    r'HOME\s*LOAN\s*EMI', r'CAR\s*LOAN\s*EMI',
    r'AUTO\s*DEBIT.*(?:EMI|LOAN)',
    r'(?:BAJAJ|HDFC|ICICI|AXIS|SBI|IDFC)\s*(?:BANK\s*)?EMI',
    r'NO\s*COST\s*EMI', r'ZERO\s*COST\s*EMI',
]

TAX_FEE_PATTERNS = [
    r'\bIGST\b', r'\bSGST\b', r'\bCGST\b',
    r'GST\s*ON\b', r'GST\s*CHARGES', r'SERVICE\s*TAX',
    r'LATE\s*(?:PAYMENT\s*)?FEE',
    r'ANNUAL\s*(?:MEMBERSHIP\s*)?FEE', r'RENEWAL\s*FEE',
    r'FINANCE\s*CHARGES', r'INTEREST\s*CHARGES',
    r'OVERLIMIT\s*(?:FEE)?',
    r'RETURNED\s*(?:CHEQUE|PAYMENT)\s*(?:CHARGES|FEE)',
    r'CASH\s*ADVANCE\s*(?:CHARGES|FEE)',
    r'REWARD\s*REDEMPTION\s*FEE',
]

CC_PAYMENT_PATTERNS = [
    r'PAYMENT\s*RECEIVED', r'PAYMENT.*THANK\s*YOU',
    r'THANK\s*YOU.*PAYMENT',
    r'NEFT\s*(?:CR|CREDIT)', r'IMPS\s*(?:CR|CREDIT)', r'UPI\s*(?:CR|CREDIT)',
    r'PAYMENT\s*BY\s*(?:NET|NETBANKING|MOBILE|CUSTOMER)',
    r'CREDIT\s*ADJUSTMENT', r'PAYMENT\s*CREDITED',
    r'BILL\s*PAYMENT\s*CREDITED',
]


@dataclass
class DetectionResult:
    row_type: str                  # "normal" | "emi" | "tax_fee" | "cc_payment"
    is_emi: bool
    is_tax_fee: bool
    is_cc_payment: bool
    suggested_debt_id: str | None
    suggested_debt_name: str | None
    installment_info: str | None   # e.g. "3 of 12"
    skip_by_default: bool
    skip_reason: str | None        # shown to user when skip_by_default=True


def detect_row(
    description: str,
    amount: float,
    tx_type: str,           # "income" | "expense" from parser
    active_debts: list,     # list of Debt ORM objects
) -> DetectionResult:
    """
    Rules applied in order (first match wins):
    1. CC payment: tx_type=income AND matches CC_PAYMENT_PATTERNS → skip by default
    2. Tax/fee: tx_type=expense AND matches TAX_FEE_PATTERNS → auto-categorise
    3. EMI: tx_type=expense AND matches EMI_PATTERNS → flag, try to match Debt
    4. Normal: everything else
    """
    desc_upper = description.upper().strip()

    # 1. CC payment
    if tx_type == "income" and any(re.search(p, desc_upper) for p in CC_PAYMENT_PATTERNS):
        return DetectionResult(
            row_type="cc_payment", is_emi=False, is_tax_fee=False, is_cc_payment=True,
            suggested_debt_id=None, suggested_debt_name=None, installment_info=None,
            skip_by_default=True,
            skip_reason=(
                "This appears to be a CC bill payment already captured "
                "in your bank statement — importing it here would double-count it."
            ),
        )

    # 2. Tax / fee
    if tx_type == "expense" and any(re.search(p, desc_upper) for p in TAX_FEE_PATTERNS):
        return DetectionResult(
            row_type="tax_fee", is_emi=False, is_tax_fee=True, is_cc_payment=False,
            suggested_debt_id=None, suggested_debt_name=None, installment_info=None,
            skip_by_default=False, skip_reason=None,
        )

    # 3. EMI
    if tx_type == "expense" and any(re.search(p, desc_upper) for p in EMI_PATTERNS):
        installment_info = None
        m = re.search(r'(\d+)\s*(?:OF|/)\s*(\d+)', desc_upper)
        if m:
            installment_info = f"{m.group(1)} of {m.group(2)}"

        suggested_debt_id = None
        suggested_debt_name = None

        # Match priority: 1) account_last4, 2) EMI amount ±5%, 3) lender first word
        for debt in active_debts:
            if debt.account_last4 and debt.account_last4 in desc_upper:
                suggested_debt_id, suggested_debt_name = debt.id, debt.name
                break
        if not suggested_debt_id:
            for debt in active_debts:
                if debt.emi_amount and debt.emi_amount > 0:
                    if abs(debt.emi_amount - amount) / debt.emi_amount <= 0.05:
                        suggested_debt_id, suggested_debt_name = debt.id, debt.name
                        break
        if not suggested_debt_id:
            for debt in active_debts:
                if debt.lender:
                    first_word = debt.lender.upper().split()[0]
                    if len(first_word) >= 4 and first_word in desc_upper:
                        suggested_debt_id, suggested_debt_name = debt.id, debt.name
                        break

        return DetectionResult(
            row_type="emi", is_emi=True, is_tax_fee=False, is_cc_payment=False,
            suggested_debt_id=suggested_debt_id, suggested_debt_name=suggested_debt_name,
            installment_info=installment_info, skip_by_default=False, skip_reason=None,
        )

    # 4. Normal
    return DetectionResult(
        row_type="normal", is_emi=False, is_tax_fee=False, is_cc_payment=False,
        suggested_debt_id=None, suggested_debt_name=None, installment_info=None,
        skip_by_default=False, skip_reason=None,
    )
```

---

### 7.4 Extend import schema

**File:** `backend/app/schemas/import_schema.py` — add fields to existing classes (keep all existing fields):

```python
class ImportPreviewRow(BaseModel):
    # existing fields unchanged ...
    # NEW:
    is_emi: bool = False
    is_tax_fee: bool = False
    is_cc_payment: bool = False
    suggested_debt_id: str | None = None
    suggested_debt_name: str | None = None   # label for loan dropdown
    installment_info: str | None = None      # "3 of 12"
    skip_by_default: bool = False
    skip_reason: str | None = None           # shown to user when True


class ConfirmRow(BaseModel):
    # existing fields unchanged ...
    # NEW:
    debt_id: str | None = None        # user's selected loan for EMI rows
    tax_amount: float | None = None   # tax portion for tax_fee rows
```

---

### 7.5 Wire detection into import router

**File:** `backend/app/routers/import_router.py`

**In the preview endpoint** — after parsing rows, before AI categorisation:

```python
from app.models.debt import Debt as DebtModel
from app.services.import_detector import detect_row

active_debts = db.query(DebtModel).filter(DebtModel.status == "active").all()

for row in parsed_rows:
    d = detect_row(row["description"], row["amount"], row["tx_type"], active_debts)
    row.update({
        "is_emi": d.is_emi, "is_tax_fee": d.is_tax_fee, "is_cc_payment": d.is_cc_payment,
        "suggested_debt_id": d.suggested_debt_id, "suggested_debt_name": d.suggested_debt_name,
        "installment_info": d.installment_info,
        "skip_by_default": d.skip_by_default, "skip_reason": d.skip_reason,
    })
    if d.is_tax_fee:
        row["suggested_category"] = "Taxes & Fees"
        row["skip_ai"] = True
    if d.is_cc_payment:
        row["suggested_category"] = "CC Payment"
        row["include"] = False
        row["skip_ai"] = True
```

**In the confirm endpoint** — after creating the Transaction, handle debt-linked rows:

```python
from app.models.debt import Debt as DebtModel
from app.models.debt_payment import DebtPayment

# Build Transaction as usual (add tax_amount, debt_id to constructor)
t = Transaction(
    type=confirm_row.tx_type, amount=confirm_row.amount, date=confirm_row.date,
    category=confirm_row.category, account=req.account_name, notes=confirm_row.notes,
    tax_amount=confirm_row.tax_amount, debt_id=confirm_row.debt_id,
)
db.add(t)
db.flush()  # need t.id before commit

if confirm_row.debt_id:
    debt = db.get(DebtModel, confirm_row.debt_id)
    if debt and debt.status == "active":
        outstanding_after = max(0.0, debt.outstanding - confirm_row.amount)
        db.add(DebtPayment(
            debt_id=debt.id, transaction_id=t.id,
            amount=confirm_row.amount, payment_date=confirm_row.date,
            outstanding_after=outstanding_after,
        ))
        debt.outstanding = outstanding_after
        if outstanding_after == 0.0:
            debt.status = "closed"
    else:
        log.warning("confirm: debt_id %s not found or not active — skipping DebtPayment", confirm_row.debt_id)
```

**Edge cases:**
- `debt_id` set but Debt deleted between preview and confirm → log warning, still create Transaction
- `outstanding` would go below 0 → clamp to 0.0, set `status = "closed"`
- Payment amount >20% larger than `emi_amount` → process normally (pre-payment is fine)

---

### 7.6 Routers

Register all three in `backend/app/main.py`:
```python
from app.routers.debt import router as debt_router
from app.routers.investments import router as investments_router
from app.routers.financial_goals import router as financial_goals_router

app.include_router(debt_router)
app.include_router(investments_router)
app.include_router(financial_goals_router)
```

#### `backend/app/routers/debt.py`

```
GET    /api/v1/finance/debt                  list active debts
POST   /api/v1/finance/debt                  create debt
GET    /api/v1/finance/debt/{id}             get one + payment history
PATCH  /api/v1/finance/debt/{id}             partial update
DELETE /api/v1/finance/debt/{id}             soft-close (status=closed)

POST   /api/v1/finance/debt/{id}/payment     manual EMI payment
GET    /api/v1/finance/debt/{id}/payments    list payment history

GET    /api/v1/finance/debt/summary          totals
GET    /api/v1/finance/debt/payoff-strategy  avalanche + snowball comparison
```

**`POST /debt/{id}/payment` body:** `{ amount: float, payment_date: date, notes: str | None }`

Logic:
1. Validate debt exists and `status == "active"`
2. Create `Transaction(type="expense", category="EMI/Loan", account=debt.lender, debt_id=debt.id)`
3. Create `DebtPayment` (same outstanding_after logic as import confirm)
4. Reduce `Debt.outstanding`; auto-close if 0

**Payoff strategy computation** — put in `debt.py` as a helper:

```python
import math

def _months_to_payoff(outstanding: float, emi: float, annual_rate: float) -> int:
    if outstanding <= 0:
        return 0
    if annual_rate == 0.0:
        return math.ceil(outstanding / emi) if emi > 0 else 999
    r = annual_rate / 12 / 100
    if emi <= outstanding * r:
        return 999  # EMI doesn't cover interest
    try:
        return math.ceil(-math.log(1 - (outstanding * r) / emi) / math.log(1 + r))
    except (ValueError, ZeroDivisionError):
        return 999

def _total_interest(outstanding: float, emi: float, months: int) -> float:
    return max(0.0, round(emi * months - outstanding, 2))
```

**`GET /payoff-strategy` response:**
```json
{
  "avalanche": [
    {
      "priority": 1, "debt_id": "...", "name": "HDFC Personal Loan",
      "outstanding": 85000, "interest_rate": 18.5, "emi_amount": 3200,
      "months_to_payoff": 34, "total_interest_remaining": 23800,
      "why_first": "Highest interest rate — paying this first saves the most money."
    }
  ],
  "snowball": [
    {
      "priority": 1, "debt_id": "...", "name": "Amazon No-Cost EMI",
      "outstanding": 12000, "interest_rate": 0.0, "emi_amount": 2000,
      "months_to_payoff": 6,
      "why_first": "Smallest balance — eliminates one obligation fastest."
    }
  ],
  "summary": {
    "total_outstanding": 182000, "total_emi_monthly": 12400,
    "avalanche_total_interest": 31200, "snowball_total_interest": 34800,
    "interest_saved_by_avalanche": 3600,
    "recommendation": "avalanche",
    "recommendation_reason": "Following avalanche order saves you ₹3,600 in interest over the life of your loans."
  }
}
```

#### `backend/app/routers/investments.py`

```
GET    /api/v1/finance/investments                list all
POST   /api/v1/finance/investments                create
PATCH  /api/v1/finance/investments/{id}           update
DELETE /api/v1/finance/investments/{id}           soft-delete (status=redeemed)

POST   /api/v1/finance/investments/{id}/entry     add SIP / lumpsum / manual entry
GET    /api/v1/finance/investments/{id}/entries   list entries

GET    /api/v1/finance/investments/summary        total invested, by type, SIP this month
```

**`POST /investments/{id}/entry` logic:**
1. Create `InvestmentEntry`
2. Create `Transaction(type="investment", category=investment.investment_type, investment_id=investment.id)`
3. `Investment.total_invested += entry.amount`
4. If `Investment.goal_id` set → recompute `FinancialGoal.current_amount` = sum of all linked investments' `total_invested`

**Summary response:**
```json
{
  "total_invested": 420000,
  "by_type": { "mutual_fund": 300000, "fd": 100000, "ppf": 20000 },
  "sip_this_month": 30000,
  "investments": [...]
}
```

#### `backend/app/routers/financial_goals.py`

```
GET    /api/v1/finance/goals              list all + computed progress
POST   /api/v1/finance/goals              create
PATCH  /api/v1/finance/goals/{id}         update (inc. manually updating current_amount)
DELETE /api/v1/finance/goals/{id}         soft-archive (status=paused)
POST   /api/v1/finance/goals/{id}/achieve mark achieved
```

**Progress computation** — in list endpoint, for each goal:
- If `linked_investment_ids` non-empty: `current_amount = sum(Investment.total_invested for linked ids)`
- Else: use stored `goal.current_amount` (manual)

**Computed fields added to every response:**
```json
{
  "progress_pct": 21.0,
  "days_remaining": 576,
  "monthly_needed": 59700,
  "is_on_track": false
}
```

- `monthly_needed = (target_amount - current_amount) / months_remaining`. Returns 0 if already achieved.
- `is_on_track = investments_this_month >= monthly_needed`

---

### 7.7 Finance Advisor AI

**File:** `backend/app/routers/finance_advisor.py`

```
POST   /api/v1/finance/advisor     generate full AI advice (on-demand)
```

**Context builder:**

```python
async def _build_finance_context(db: Session) -> str:
    from datetime import date, timedelta
    from app.models.finance import Transaction
    from app.models.debt import Debt
    from app.models.investment import Investment
    from app.models.financial_goal import FinancialGoal

    today = date.today()
    # First day 3 months ago
    three_months_ago = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
    three_months_ago = (three_months_ago - timedelta(days=1)).replace(day=1)

    txns = db.query(Transaction).filter(Transaction.date >= three_months_ago).all()
    income_txns   = [t for t in txns if t.type == "income"]
    expense_txns  = [t for t in txns if t.type == "expense"]
    invest_txns   = [t for t in txns if t.type == "investment"]

    avg_income  = sum(t.amount for t in income_txns)  / 3
    avg_expense = sum(t.amount for t in expense_txns) / 3
    avg_invest  = sum(t.amount for t in invest_txns)  / 3

    lines = [f"Finance analysis as of {today.isoformat()}"]
    lines.append(f"\n## Cash flow (3-month average)")
    lines.append(f"Monthly income: {avg_income:.0f}")
    lines.append(f"Monthly expenses: {avg_expense:.0f}")
    lines.append(f"Monthly investments/SIPs: {avg_invest:.0f}")
    lines.append(f"Real disposable (income - expenses - investments): {avg_income - avg_expense - avg_invest:.0f}")

    cat_totals: dict[str, float] = {}
    for t in expense_txns:
        c = t.category or "Other"
        cat_totals[c] = cat_totals.get(c, 0) + t.amount / 3
    top = sorted(cat_totals.items(), key=lambda x: -x[1])[:8]
    lines.append("Top expense categories (monthly avg): " + ", ".join(f"{c}: {v:.0f}" for c, v in top))

    debts = db.query(Debt).filter(Debt.status == "active").all()
    if debts:
        lines.append(f"\n## Active debts ({len(debts)} loans)")
        lines.append(f"Total outstanding: {sum(d.outstanding for d in debts):.0f}")
        lines.append(f"Total monthly EMI: {sum(d.emi_amount for d in debts):.0f}")
        for d in sorted(debts, key=lambda x: -x.interest_rate):
            lines.append(f"- {d.name}: outstanding={d.outstanding:.0f}, EMI={d.emi_amount:.0f}/mo, rate={d.interest_rate}% p.a.")

    investments = db.query(Investment).filter(Investment.status == "active").all()
    if investments:
        lines.append(f"\n## Investments ({len(investments)})")
        lines.append(f"Total invested: {sum(i.total_invested for i in investments):.0f}")
        lines.append(f"Monthly SIP: {sum((i.sip_amount or 0) for i in investments):.0f}")
        for inv in investments:
            lines.append(f"- {inv.name} ({inv.investment_type}): invested={inv.total_invested:.0f}")

    goals = db.query(FinancialGoal).filter(FinancialGoal.status == "active").all()
    if goals:
        lines.append(f"\n## Financial goals ({len(goals)} active)")
        for g in sorted(goals, key=lambda x: x.priority):
            pct = g.current_amount / g.target_amount * 100 if g.target_amount > 0 else 0
            dl = f", deadline: {g.target_date}" if g.target_date else ""
            lines.append(f"- {g.title} ({g.timeline} term{dl}): target={g.target_amount:.0f}, saved={g.current_amount:.0f} ({pct:.0f}%)")

    return "\n".join(lines)
```

**System prompt — do not change the STRICT RULES section:**

```python
ADVISOR_SYSTEM = """
You are a personal finance advisor analysing someone's real financial data.

STRICT RULES — never break these:
- Do NOT recommend buying or selling any investment, stock, mutual fund, or asset.
- Do NOT give tax advice or suggest tax-saving instruments.
- Do NOT comment on whether their investments are "good" or "bad" choices.
- You may only analyse what they OWE, what they SPEND, and what they SAVE — and help them manage these better.

OUTPUT FORMAT — respond in exactly this structure:

💰 Real disposable income:
[Income minus expenses minus EMIs minus SIPs = actual free cash. 1 sentence with the number. Flag if negative.]

📊 Spending to watch:
[Top 2-3 expense categories that are high relative to income. Name the category, the amount, and what reducing by ₹X would achieve. Max 4 sentences.]

💳 Debt priority (avalanche recommended):
[Rank debts by interest rate, highest first. Say why each costs the most. Explain avalanche vs snowball in 1 sentence. Let them choose — don't be prescriptive.]

🎯 Goal check:
[For each active goal, say whether current savings pace will hit it on time. If not, say the monthly gap in ₹. Max 3 sentences total.]

⚡ One action this week:
[Single most impactful specific action. Not an investment recommendation.]

Keep the entire response under 250 words. Use actual numbers. Do not fabricate. Skip sections where data is missing.
"""
```

**Endpoint:**
```python
@router.post("/advisor")
async def finance_advisor(db: Session = Depends(get_db)):
    from app.services.llm_client import generate as llm_generate, LLMError
    context = await _build_finance_context(db)
    try:
        response = await llm_generate(context, purpose="insights", system=ADVISOR_SYSTEM,
                                       temperature=0.4, max_tokens=600)
    except LLMError as e:
        raise HTTPException(status_code=503, detail=f"AI unavailable: {e}")
    return {"advice": response, "generated_at": date.today().isoformat()}
```

**Scheduler** — add to `backend/app/scheduler.py`:

```python
def _run_finance_advisor() -> None:
    """Weekly (Sunday) or monthly (1st) — reads finance.advisor_schedule setting."""
    import asyncio
    from app.db import SessionLocal
    from app.models.setting import Setting

    with SessionLocal() as db:
        s = db.query(Setting).filter(Setting.key == "finance.advisor_schedule").first()
        if not s or s.value == "manual":
            return

    async def _inner():
        from app.routers.finance_advisor import _build_finance_context, ADVISOR_SYSTEM
        from app.services.llm_client import generate as llm_generate, LLMError
        from app.services.notification_service import create_notification
        with SessionLocal() as db:
            context = await _build_finance_context(db)
            try:
                response = await llm_generate(context, purpose="insights",
                                               system=ADVISOR_SYSTEM, temperature=0.4, max_tokens=600)
            except LLMError:
                return
            if response:
                create_notification(db=db, type="finance_advisor",
                                    title="Your finance check-in", body=response.strip(), skip_quiet=True)
    try:
        asyncio.run(_inner())
    except Exception as e:
        log.warning("Finance advisor job failed: %s", e)
```

Add both jobs to `start_scheduler()`:
```python
_scheduler.add_job(_run_finance_advisor, CronTrigger(day_of_week="sun", hour=10, minute=0),
                   id="finance_advisor_weekly", replace_existing=True)
_scheduler.add_job(_run_finance_advisor, CronTrigger(day=1, hour=10, minute=0),
                   id="finance_advisor_monthly", replace_existing=True)
```

Both jobs read the setting on every run — if `"manual"`, they return immediately. Add trigger endpoint to `notifications.py`:
```python
@router.post("/trigger/finance-advisor")
async def trigger_finance_advisor(db: Session = Depends(get_db)) -> dict:
    from app.routers.finance_advisor import _build_finance_context, ADVISOR_SYSTEM
    from app.services.llm_client import generate, LLMError
    context = await _build_finance_context(db)
    try:
        response = await generate(context, purpose="insights", system=ADVISOR_SYSTEM,
                                   temperature=0.4, max_tokens=600)
        return {"created": True, "advice": response}
    except LLMError as e:
        return {"created": False, "reason": str(e)}
```

---

### 7.8 Frontend — Finance tab restructure

**File:** `frontend/src/routes/Finance.tsx`

Restructure from single view into 5 tabs: **Overview | Budget | Debt & EMI | My Wealth | Advisor**

Tabs 1 (Overview) and 2 (Budget) keep existing components unchanged.

**Tab 3 — Debt & EMI** — new components in `frontend/src/components/finance/debt/`:

- `DebtSummaryBar.tsx` — top of tab: Total outstanding | Total EMI/month | Active debt count
- `DebtCard.tsx` — per loan: emoji + name + lender, outstanding (large), interest rate badge (red >15%, amber 5-15%, green 0%), progress bar `(principal - outstanding) / principal`, EMI + next due chip (red ≤3 days, amber ≤7), overflow: Edit / Record Payment / Mark Closed
- `PayoffStrategyCard.tsx` — avalanche list ranked by interest rate, "Saving ₹X vs snowball" summary, toggle to show snowball comparison, explanation of both methods
- `RecordPaymentDrawer.tsx` — via RightDrawer: debt selector, amount (pre-filled with emi_amount), date (today), notes → `POST /api/v1/finance/debt/{id}/payment`

**Tab 4 — My Wealth** — new components in `frontend/src/components/finance/wealth/`:

- `WealthSummaryBar.tsx` — In-hand this month (`income - expenses - EMIs - SIPs`, current month) | Total invested (lifetime) | Active SIP/month
- `InvestmentNote.tsx` — persistent banner: *"Amounts shown are what you've put in, not current market value. Check your brokerage app for NAV-based returns."*
- `InvestmentCard.tsx` — per investment: emoji + name + type badge, total invested (large), progress bar toward target, SIP chip if applicable, overflow: Edit / Add Entry / Mark Redeemed
- `FinancialGoalCard.tsx` — per goal: emoji + title + timeline badge (short=blue, medium=amber, long=green), progress bar, `₹X of ₹Y saved`, days remaining, `on track` / `behind` badge
- `AddInvestmentEntryDrawer.tsx` — via RightDrawer: select investment, amount, date, type (SIP/Lumpsum/Manual) → `POST /api/v1/finance/investments/{id}/entry`

**Tab 5 — Advisor** — replaces `FinanceInsightsCard.tsx` with a full tab:
- "Generate analysis" button → `POST /api/v1/finance/advisor`
- Response rendered with `whitespace-pre-wrap`
- `generated_at` date shown below
- Schedule toggle inline: Off / Weekly / Monthly → saves `finance.advisor_schedule`

**Notification rendering** — in `NotificationPanel.tsx`, add case for `type === "finance_advisor"`:
```tsx
<pre className="whitespace-pre-wrap text-xs text-ink-300 font-sans mt-1">{notif.body}</pre>
```

---

### 7.9 Import review UI changes

**File:** `frontend/src/components/finance/ImportModal.tsx`

For each row in the review table, add conditional rendering:

**EMI rows** (`is_emi=true`):
- Orange "EMI" badge on row
- Instalment chip if available ("Instalment 3 of 12")
- Loan dropdown: fetches `GET /api/v1/finance/debt`, pre-selected to `suggested_debt_name`
- If no debt matched: amber warning — *"⚠️ No matching loan found — add this loan in Debt & EMI tab first, then re-import"*

**CC payment rows** (`is_cc_payment=true`):
- Skip checkbox pre-checked
- Info badge showing `skip_reason` from backend (the exact string: *"This appears to be a CC bill payment already captured in your bank statement — importing it here would double-count it."*)
- User can un-check to override

**Tax/fee rows** (`is_tax_fee=true`):
- "Taxes & Fees" in category column, non-editable (or editable with a note)
- No debt dropdown

---

### 7.10 Settings additions

**File:** `frontend/src/routes/Settings.tsx` — in the Finance / Notifications section:

```
Finance Advisor schedule
  [ Off ]  [ Weekly — Sunday ]  [ Monthly — 1st ]
```

Setting key: `finance.advisor_schedule` | Values: `"manual"` | `"weekly"` | `"monthly"` | Default: `"manual"`

**Add to `frontend/src/lib/api.ts`:**
```typescript
// Add under the existing finance object:
debt: {
  list: () => fetch('/api/v1/finance/debt').then(r => r.json()),
  create: (body: any) => fetch('/api/v1/finance/debt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  update: (id: string, body: any) => fetch(`/api/v1/finance/debt/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  delete: (id: string) => fetch(`/api/v1/finance/debt/${id}`, { method: 'DELETE' }).then(r => r.json()),
  payment: (id: string, body: any) => fetch(`/api/v1/finance/debt/${id}/payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  summary: () => fetch('/api/v1/finance/debt/summary').then(r => r.json()),
  payoffStrategy: () => fetch('/api/v1/finance/debt/payoff-strategy').then(r => r.json()),
},
investments: {
  list: () => fetch('/api/v1/finance/investments').then(r => r.json()),
  create: (body: any) => fetch('/api/v1/finance/investments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  update: (id: string, body: any) => fetch(`/api/v1/finance/investments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  addEntry: (id: string, body: any) => fetch(`/api/v1/finance/investments/${id}/entry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  summary: () => fetch('/api/v1/finance/investments/summary').then(r => r.json()),
},
financialGoals: {
  list: () => fetch('/api/v1/finance/goals').then(r => r.json()),
  create: (body: any) => fetch('/api/v1/finance/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  update: (id: string, body: any) => fetch(`/api/v1/finance/goals/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  achieve: (id: string) => fetch(`/api/v1/finance/goals/${id}/achieve`, { method: 'POST' }).then(r => r.json()),
},
advisor: {
  generate: () => fetch('/api/v1/finance/advisor', { method: 'POST' }).then(r => r.json()),
},
```

---

### 7.11 Dashboard Finance card

**File:** `frontend/src/components/dashboard/DashFinanceCard.tsx`

Below existing income/expense summary, add (only when data exists):
- Total outstanding debt → amber
- Next EMI due (soonest debt by emi_due_day, days remaining) → red if ≤3 days, amber if ≤7
- Total SIP this month → blue
- Link: "View debts →" → Finance tab Debt & EMI

---

### 7.12 Testing checklist

**Models and DB:**
- [ ] All 5 new tables created on clean DB startup with no errors
- [ ] `Transaction.tax_amount`, `debt_id`, `investment_id` columns present
- [ ] `Transaction.type = "investment"` accepted by API (no validation error)

**Import detection:**
- [ ] Row "EMI NO 3 OF 12 - LAPTOP PURCHASE" → `is_emi=true`, `installment_info="3 of 12"`
- [ ] Row "PAYMENT RECEIVED - THANK YOU ₹50,000" (tx_type=income) → `is_cc_payment=true`, `skip_by_default=true`, `skip_reason` contains the explanation string
- [ ] Row "IGST ON FINANCE CHARGES" → `is_tax_fee=true`, `suggested_category="Taxes & Fees"`
- [ ] Row "SWIGGY ORDER" → all flags false, normal AI categorisation runs
- [ ] EMI row with matching `account_last4` → `suggested_debt_id` set correctly
- [ ] EMI row with amount within ±5% of `emi_amount` → `suggested_debt_id` set
- [ ] EMI row with no matching debt → `suggested_debt_id=null`, amber warning shown in UI

**Debt:**
- [ ] `POST /finance/debt` creates record, appears in list
- [ ] `POST /finance/debt/{id}/payment` reduces `outstanding` by payment amount
- [ ] `outstanding` reaching 0 → `status` becomes `"closed"` automatically
- [ ] `GET /payoff-strategy` returns avalanche sorted by `interest_rate DESC`
- [ ] No-cost EMI (`interest_rate=0.0`) → `months_to_payoff = ceil(outstanding / emi_amount)`
- [ ] `months_to_payoff=999` when EMI < monthly interest (loan would never be paid off)
- [ ] CC import confirm with `debt_id` set → `DebtPayment` row created + `Debt.outstanding` reduced
- [ ] `debt_id` set but Debt deleted → Transaction created, `DebtPayment` skipped, warning logged

**Investments:**
- [ ] `POST /investments/{id}/entry` → `Investment.total_invested` incremented correctly
- [ ] Investment with `goal_id` → linked `FinancialGoal.current_amount` auto-updated
- [ ] Investment note banner *"Amounts shown are what you've put in..."* visible in My Wealth tab

**Financial goals:**
- [ ] `monthly_needed` correct: `(target - current) / months_remaining`
- [ ] `is_on_track` correctly reflects whether investments this month ≥ `monthly_needed`
- [ ] `progress_pct` correct, never exceeds 100
- [ ] `days_remaining` is null when no `target_date` set

**Advisor:**
- [ ] `POST /finance/advisor` returns response with all 5 emoji sections
- [ ] Response contains no words: "buy", "sell", "stock", "recommend investing" (manual spot check)
- [ ] `POST /notifications/trigger/finance-advisor` creates a `finance_advisor` notification
- [ ] Notification body renders with `whitespace-pre-wrap` in NotificationPanel
- [ ] `finance.advisor_schedule = "weekly"` → Sunday job runs; Mon–Sat jobs skip silently
- [ ] `finance.advisor_schedule = "manual"` → no scheduled job runs

---

_Updated: 2026-06-06. All 7 phases shipped. Phase 7 spec above is the reference for Finance module extensions. Read APP_REPORT.md first._
