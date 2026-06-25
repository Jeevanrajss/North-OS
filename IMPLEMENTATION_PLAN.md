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

---

## Phase 8 — Multi-User Cloud Backend

**Status:** 🔲 Not started  
**Goal:** Convert North OS from a single-user local app into a multi-user cloud-ready backend. One Railway instance hosts everything. Each user has their own isolated data. The Electron desktop app and the Flutter mobile app (Phase 9) both connect to this backend.

**Architecture decision (locked):**
- SQLite stays — WAL mode is already enabled in `db.py`. Railway volume at `/data` persists the file across deploys. No PostgreSQL needed for the expected user count.
- Auth model: invite-only registration. `INVITE_CODE` env var controls who can sign up. No public self-service registration.
- AI default: Gemini 1.5 Flash via `GEMINI_API_KEY` env var. User's BYOAI key in Settings overrides it. If neither is set, AI features degrade gracefully (same as before).
- The existing `User` model in `backend/app/models/user.py` is a week-1 placeholder. It needs extending — do not replace it, extend it.

**New env vars for Railway:**

| Var | Example | Notes |
|---|---|---|
| `JWT_SECRET` | `openssl rand -hex 32` | Long random string. Never commit. |
| `JWT_ALGORITHM` | `HS256` | Don't change. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | 1-hour access tokens |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` | 30-day refresh tokens |
| `INVITE_CODE` | `northos-2024` | Share this with people you want to let in |
| `GEMINI_API_KEY` | `AIza...` | Get from Google AI Studio (free) |
| `DB_PATH` | `/data/northos.db` | Points to the Railway volume |

**Build order within Phase 8:**
1. Railway deploy + Dockerfile (8.1)
2. User model extension + auth service + auth router (8.2)
3. Add `user_id` to all models + dev migrations (8.3)
4. Update all routers to filter by user (8.4)
5. Multi-user scheduler (8.5)
6. Gemini Flash default (8.6)
7. Electron cloud-mode update (8.7)
8. Testing checklist (8.8)

---

### 8.1 Railway Deployment Setup

**Goal:** Get the FastAPI backend running on Railway with the SQLite volume, before any auth changes. Verify it starts cleanly first.

#### `Dockerfile` (repo root)

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# System deps for SQLCipher and sqlite-vec
RUN apt-get update && apt-get install -y \
    build-essential \
    libssl-dev \
    libsqlcipher-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

# Data dir for SQLite volume
RUN mkdir -p /data

ENV DB_PATH=/data/northos.db
ENV DB_ENCRYPTION=false
ENV APP_ENV=prod

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### `railway.toml` (repo root)

```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "uvicorn app.main:app --host 0.0.0.0 --port 8000"
healthcheckPath = "/api/v1/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3

[[volumes]]
mountPath = "/data"
```

On Railway: add this repo, Railway auto-detects the `Dockerfile`. Add a volume mounted at `/data`. Set all env vars from the table above. The existing Node.js admin portal is a separate service — do not touch it.

**Verify:** `GET /api/v1/health` returns `{"status":"ok"}` on the Railway URL before proceeding.

---

### 8.2 User Model Extension + Auth Layer

**Goal:** Extend the existing `User` placeholder into a real auth-capable model. Add JWT auth service and routes.

#### Extend `backend/app/models/user.py`

The placeholder has `id`, `name`, `email`, `created_at`, `updated_at`. Add:

```python
"""User model — extended for multi-user auth (Phase 8)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _uuid_str() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)

    # bcrypt hash of the user's password
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # Invite code used at registration — for auditing who let who in
    invite_code_used: Mapped[str | None] = mapped_column(String(100), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

Add `_dev_migrate_users` to `db.py` to add the new columns to existing `users` tables (follow the same ALTER TABLE pattern as `_dev_migrate_habits`). Call it inside `init_db()`.

```python
def _dev_migrate_users(conn) -> None:
    """Add Phase 8 columns to users table if missing."""
    try:
        rows = conn.execute(text("PRAGMA table_info(users)")).all()
    except Exception as e:
        log.debug("users PRAGMA failed: %s", e)
        return
    existing_cols = {r[1] for r in rows}
    new_cols = [
        ("password_hash",   "VARCHAR(255) NOT NULL DEFAULT ''"),
        ("invite_code_used","VARCHAR(100)"),
        ("is_active",       "BOOLEAN NOT NULL DEFAULT 1"),
        ("last_login_at",   "DATETIME"),
    ]
    for col, col_type in new_cols:
        if col not in existing_cols:
            try:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {col_type}"))
                log.info("Dev migration: added users.%s column", col)
            except Exception as e:
                log.warning("Could not add users.%s: %s", col, e)
```

#### New packages — add to `backend/requirements.txt`

```
python-jose[cryptography]>=3.3.0
bcrypt>=4.0.0
passlib[bcrypt]>=1.7.4
google-generativeai>=0.7.0
```

#### New `backend/app/services/auth_service.py`

```python
"""JWT auth helpers for Phase 8 multi-user."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_EXPIRE = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_EXPIRE = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _make_token(data: dict, expires_delta: timedelta) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + expires_delta
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_access_token(user_id: str) -> str:
    return _make_token({"sub": user_id, "type": "access"}, timedelta(minutes=ACCESS_EXPIRE))


def create_refresh_token(user_id: str) -> str:
    return _make_token({"sub": user_id, "type": "refresh"}, timedelta(days=REFRESH_EXPIRE))


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency — inject into any route that needs auth."""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise JWTError("Wrong token type")
        user_id: str = payload["sub"]
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
```

#### New `backend/app/routers/auth.py`

```python
"""Auth routes — register (invite-only), login, refresh, me."""
from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.services.auth_service import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    verify_password,
    JWT_SECRET,
    JWT_ALGORITHM,
)
from jose import JWTError, jwt

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

INVITE_CODE = os.getenv("INVITE_CODE", "")


class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    invite_code: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if INVITE_CODE and body.invite_code != INVITE_CODE:
        raise HTTPException(status_code=403, detail="Invalid invite code")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
        invite_code_used=body.invite_code or None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email, User.is_active == True).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return TokenOut(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(body.refresh_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise JWTError()
        user_id: str = payload["sub"]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return TokenOut(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
```

Register the router in `backend/app/main.py`:
```python
from app.routers import auth
app.include_router(auth.router)
```

The `/auth/register` and `/auth/login` routes are the only routes that do NOT require a Bearer token. All other routes require it via `Depends(get_current_user)`.

---

### 8.3 Add `user_id` to All Models

**Goal:** Every data table gets a `user_id` column. This is the biggest step — touches 16 models. Follow the dev-migration pattern already established in `db.py`.

#### Models to update

Add this column to each model class:

```python
user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True, default="")
```

Use `default=""` temporarily so existing rows don't break. After migration the column will be populated.

**Full list of models:**

| Model file | Table name |
|---|---|
| `models/finance.py` | `transactions` |
| `models/budget.py` | `budgets` |
| `models/habit.py` | `habits`, `habit_checkins` |
| `models/journal.py` | `journal_entries` |
| `models/subscription.py` | `subscriptions` |
| `models/goal.py` | `goals` |
| `models/health_log.py` | `health_logs` |
| `models/notification.py` | `notifications` |
| `models/analytics.py` | `analytics_snapshots` |
| `models/debt.py` | `debts` |
| `models/debt_payment.py` | `debt_payments` |
| `models/investment.py` | `investments` |
| `models/investment_entry.py` | `investment_entries` |
| `models/financial_goal.py` | `financial_goals` |
| `models/setting.py` | `settings` |
| `models/sms_transaction.py` | `sms_transactions` |
| `models/account.py` | `accounts` |

#### Add dev migrations to `db.py`

Add one migration function per table, all following the same pattern as `_dev_migrate_transactions`. Add all calls inside `init_db()`:

```python
def _dev_migrate_add_user_id(conn, table_name: str) -> None:
    """Generic helper — add user_id VARCHAR(36) to any table if missing."""
    try:
        rows = conn.execute(text(f"PRAGMA table_info({table_name})")).all()
    except Exception as e:
        log.debug("PRAGMA failed for %s: %s", table_name, e)
        return
    existing_cols = {r[1] for r in rows}
    if "user_id" not in existing_cols:
        try:
            conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN user_id VARCHAR(36) NOT NULL DEFAULT ''"))
            log.info("Dev migration: added %s.user_id column", table_name)
        except Exception as e:
            log.warning("Could not add %s.user_id: %s", table_name, e)
```

In `init_db()`, after existing migrations:

```python
_tables_needing_user_id = [
    "transactions", "budgets", "habits", "habit_checkins",
    "journal_entries", "subscriptions", "goals", "health_logs",
    "notifications", "analytics_snapshots", "debts", "debt_payments",
    "investments", "investment_entries", "financial_goals",
    "settings", "sms_transactions", "accounts",
]
for t in _tables_needing_user_id:
    _dev_migrate_add_user_id(conn, t)
```

---

### 8.4 Update All Routers to Filter by User

**Goal:** Every router that reads or writes data must scope to `current_user.id`. This prevents any user from seeing another user's data.

**The pattern — apply to every router:**

```python
# BEFORE (single-user):
@router.get("/")
def list_habits(db: Session = Depends(get_db)):
    return db.query(Habit).filter(Habit.archived_at.is_(None)).all()

# AFTER (multi-user):
from app.services.auth_service import get_current_user
from app.models.user import User

@router.get("/")
def list_habits(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Habit).filter(
        Habit.user_id == current_user.id,
        Habit.archived_at.is_(None),
    ).all()

# On CREATE — inject user_id:
@router.post("/")
def create_habit(body: HabitIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    habit = Habit(**body.model_dump(), user_id=current_user.id)
    ...
```

**Routers to update (all of them):**

| Router file | What to scope |
|---|---|
| `routers/finance.py` | All transaction queries + budget queries |
| `routers/habit.py` | Habits + HabitCheckins |
| `routers/journal.py` | JournalEntry queries |
| `routers/subscription.py` | Subscription queries |
| `routers/goals.py` | Goal queries (including `_compute_progress` — pass `user_id` to habit/transaction sub-queries) |
| `routers/health_tracking.py` | HealthLog queries |
| `routers/notifications.py` | Notification queries |
| `routers/analytics.py` | AnalyticsSnapshot queries |
| `routers/debt.py` | Debt + DebtPayment queries |
| `routers/investments.py` | Investment + InvestmentEntry queries |
| `routers/financial_goals.py` | FinancialGoal queries |
| `routers/finance_advisor.py` | AI context queries (pass `user_id` filter to every sub-query that builds context) |
| `routers/ai.py` | All data-context queries (journal, habits, finance) inside prompt builders |
| `routers/settings.py` | Setting queries (each user has their own settings) |
| `routers/accounts.py` | Account queries |
| `routers/sms.py` | SmsTransaction queries |
| `routers/import_router.py` | Transaction inserts on confirm; preview is stateless |
| `routers/data.py` | Wipe-all-data — scope to `current_user.id` only (never wipe other users' data) |

**Special cases:**

`routers/goals.py` — `_compute_progress()` makes sub-queries to `Habit`, `HabitCheckin`, and `Transaction`. These sub-queries must also filter by `user_id`. Add `user_id: str` parameter to `_compute_progress()` and pass it through.

`routers/ai.py` — The morning briefing and chat context builders query multiple tables. Each sub-query needs `.filter(Model.user_id == user_id)`. Pass `current_user.id` into the context builder functions.

`routers/settings.py` — Currently settings are global key-value. After Phase 8, each user has their own settings. On first lookup for a key, if the user has no row for that key, fall back to the global default. On write, always write with `user_id = current_user.id`.

---

### 8.5 Multi-User Scheduler

**Goal:** Background jobs (morning briefing, weekly review, analytics snapshot, finance advisor) currently run for all data globally. With multi-user they must run per user.

In `backend/app/scheduler.py`, update each `_run_*` function:

```python
# Pattern for every scheduled job:
def _run_morning_briefing():
    from app.db import SessionLocal
    from app.models.user import User
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.is_active == True).all()
        for user in users:
            try:
                _run_morning_briefing_for_user(db, user.id)
            except Exception as e:
                log.error("Morning briefing failed for user %s: %s", user.id, e)
    finally:
        db.close()

def _run_morning_briefing_for_user(db, user_id: str):
    # All existing logic, but every query filtered by user_id
    ...
```

Apply the same per-user iteration pattern to:
- `_run_morning_briefing`
- `_run_weekly_review`
- `_run_analytics_snapshot`
- `_run_finance_advisor`

The `reschedule_jobs()` function needs no changes — timing logic is per-user settings. Read the `finance.advisor_schedule` setting with `user_id` filter.

---

### 8.6 Gemini Flash as Default LLM

**Goal:** When no user-configured AI provider is set, default to Gemini 1.5 Flash. Zero setup for new users.

In `backend/app/services/llm_client.py`, add Gemini Flash support:

```python
import os

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

def _call_gemini(prompt: str, system: str = "", model: str = "gemini-1.5-flash") -> str:
    """Call Google Gemini Flash. Falls back gracefully if key not set."""
    if not GEMINI_API_KEY:
        return ""
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        m = genai.GenerativeModel(
            model_name=model,
            system_instruction=system or None,
        )
        response = m.generate_content(prompt)
        return response.text or ""
    except Exception as e:
        log.warning("Gemini call failed: %s", e)
        return ""
```

In the main `call_llm()` function, add Gemini as the fallback when no provider is configured:

```python
# At the end of call_llm(), before returning empty string:
if GEMINI_API_KEY:
    return _call_gemini(prompt, system=system)
return ""
```

The Gemini provider also becomes selectable from Settings (`provider = "gemini"` with a `GEMINI_API_KEY` field). Add it to `settings.py` alongside existing providers.

---

### 8.7 Electron Cloud-Mode Update

**Goal:** Electron users can switch between local (localhost:8000) and cloud (their Railway URL). Add a login screen.

**Changes to `frontend/src/routes/Settings.tsx`:**

Add a new "Connection" section (above the AI Provider section):

```
Server URL: [text input, default: http://localhost:8000]
Mode: ● Local  ○ Cloud
[Test Connection] button → GET /api/v1/health → shows ✓ or ✗
```

When Cloud mode is selected and Server URL is changed, show a Login form:
```
Email: [input]
Password: [input]
[Sign in] button → POST /auth/login → stores JWT in localStorage
```

**Changes to `frontend/src/lib/api.ts`:**

Add `Authorization: Bearer <token>` header to every API call:

```typescript
// In the axios/fetch base config:
const getAuthHeader = () => {
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};
```

Add auto-refresh: if any request returns 401, call `POST /auth/refresh` with the stored refresh token, store the new access token, retry the original request.

Add auth API functions:
```typescript
export const login = (email: string, password: string) =>
  api.post("/auth/login", { email, password });

export const register = (name: string, email: string, password: string, invite_code: string) =>
  api.post("/auth/register", { name, email, password, invite_code });

export const refreshToken = (refresh_token: string) =>
  api.post("/auth/refresh", { refresh_token });
```

When running locally (localhost), auth is optional — the dev experience stays the same. Auth is only required when the server URL is a cloud URL.

---

### 8.8 Phase 8 Testing Checklist

**Deploy & connectivity:**
- [ ] `GET <railway-url>/api/v1/health` returns `{"status":"ok"}`
- [ ] SQLite file persists at `/data/northos.db` across Railway redeploys (volume working)
- [ ] WAL mode confirmed: `PRAGMA journal_mode` returns `wal` on the deployed DB

**Auth:**
- [ ] `POST /auth/register` with wrong invite code → 403
- [ ] `POST /auth/register` with correct invite code → 201, returns `access_token` + `refresh_token`
- [ ] `POST /auth/register` same email twice → 409
- [ ] `POST /auth/login` correct credentials → 200, tokens returned
- [ ] `POST /auth/login` wrong password → 401
- [ ] `GET /auth/me` with valid token → returns user object
- [ ] `GET /auth/me` with no token → 401
- [ ] `POST /auth/refresh` with valid refresh token → new access token returned
- [ ] Expired access token + valid refresh token → Electron auto-refreshes silently

**Data isolation:**
- [ ] Register two users (User A, User B) with different invite codes or same code
- [ ] User A creates a habit → User B cannot see it (GET /habits returns empty for B)
- [ ] User A creates a transaction → User A's finance totals correct, User B sees zero
- [ ] User A's settings do not bleed into User B's AI provider config

**Scheduler:**
- [ ] Morning briefing job runs for all active users (check logs show per-user execution)
- [ ] Analytics snapshot computed per user (separate rows in `analytics_snapshots` with different `user_id`)

**Gemini fallback:**
- [ ] With `GEMINI_API_KEY` set and no user provider configured → morning briefing generates successfully
- [ ] With `GEMINI_API_KEY` unset and no user provider → AI features return empty/graceful degradation, app does not crash

**Electron cloud mode:**
- [ ] Change Server URL to Railway URL → connection test passes
- [ ] Login with registered credentials → all data loads from cloud
- [ ] Switch back to localhost → local dev data loads

---

## Phase 9 — Flutter Mobile App

**Status:** 🔲 Not started (requires Phase 8 complete)  
**Goal:** Build a native iOS + Android app that connects to the Phase 8 cloud backend. Must-have features: Finance (full) and Quick Logging. The backend is already built — Flutter is purely a client.

**Architecture decisions (locked):**
- Flutter is a thin client. Zero business logic lives in Flutter. All computation stays in FastAPI.
- Auth: JWT stored in `flutter_secure_storage`. Auto-refresh on 401.
- Offline: v1 is online-only. Offline queue is a Phase 10 concern.
- AI calls: Flutter never calls Gemini directly. All AI goes through the backend (`/api/v1/ai/*`).
- State management: Riverpod 2.x (ref-based, testable, no BuildContext dependency).
- Navigation: go_router with typed routes.
- Target: iOS 14+ and Android 7+ (API 24+).

**Flutter project location:** `mobile/` directory in the repo root (alongside `backend/`, `frontend/`, `electron/`).

---

### 9.1 Project Setup + Dependencies

#### Create the project

```bash
cd <repo-root>
flutter create --org com.northos --project-name north_os mobile
cd mobile
```

#### `mobile/pubspec.yaml` — key dependencies

```yaml
dependencies:
  flutter:
    sdk: flutter

  # HTTP + auth
  dio: ^5.4.0
  flutter_secure_storage: ^9.0.0

  # State management
  flutter_riverpod: ^2.5.0
  riverpod_annotation: ^2.3.0

  # Navigation
  go_router: ^14.0.0

  # UI
  lucide_icons: ^0.0.3
  cached_network_image: ^3.3.1
  shimmer: ^3.0.0
  fl_chart: ^0.68.0          # Charts for Finance overview
  intl: ^0.19.0              # Currency + date formatting

  # Storage
  shared_preferences: ^2.2.3  # Non-sensitive prefs (theme, server URL)

dev_dependencies:
  riverpod_generator: ^2.4.0
  build_runner: ^2.4.0
  flutter_lints: ^4.0.0
```

#### Project structure

```
mobile/lib/
  main.dart                    # App entry point
  app.dart                     # GoRouter setup, MaterialApp
  core/
    api/
      api_client.dart          # Dio instance with auth interceptor
      api_endpoints.dart       # All endpoint constants
    auth/
      auth_provider.dart       # Riverpod: token storage + refresh
      auth_state.dart          # AuthState sealed class
    models/                    # Dart data classes (mirror backend schemas)
      user.dart
      transaction.dart
      habit.dart
      debt.dart
      investment.dart
      financial_goal.dart
      journal_entry.dart
      notification.dart
    storage/
      secure_storage.dart      # flutter_secure_storage wrapper
      prefs.dart               # SharedPreferences wrapper
  features/
    auth/
      login_screen.dart
      setup_screen.dart        # First-launch: enter server URL
    dashboard/
      dashboard_screen.dart
      widgets/
        briefing_card.dart
        habit_ring.dart
        finance_summary_card.dart
        goal_cards.dart
    finance/
      finance_screen.dart      # Bottom tab: Finance
      tabs/
        overview_tab.dart
        transactions_tab.dart
        debt_tab.dart
        wealth_tab.dart
        goals_tab.dart
      widgets/
        transaction_tile.dart
        debt_card.dart
        investment_card.dart
        quick_add_transaction.dart
    quick_log/
      quick_log_fab.dart       # Floating action button
      habit_checkin_sheet.dart # Bottom sheet: check in today's habits
      quick_expense_sheet.dart # Bottom sheet: log expense fast
      quick_journal_sheet.dart # Bottom sheet: quick journal + mood
    settings/
      settings_screen.dart
      widgets/
        server_config_tile.dart
        account_tile.dart
```

---

### 9.2 Auth + Server Configuration

#### `core/api/api_client.dart`

```dart
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio();

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final storage = const FlutterSecureStorage();
        final token = await storage.read(key: 'access_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        // Auto-refresh on 401
        if (error.response?.statusCode == 401) {
          final storage = const FlutterSecureStorage();
          final refreshToken = await storage.read(key: 'refresh_token');
          if (refreshToken != null) {
            try {
              final serverUrl = await storage.read(key: 'server_url') ?? 'http://localhost:8000';
              final response = await Dio().post(
                '$serverUrl/api/v1/auth/refresh',
                data: {'refresh_token': refreshToken},
              );
              final newToken = response.data['access_token'];
              await storage.write(key: 'access_token', value: newToken);
              // Retry original request
              error.requestOptions.headers['Authorization'] = 'Bearer $newToken';
              final retryResponse = await Dio().fetch(error.requestOptions);
              handler.resolve(retryResponse);
              return;
            } catch (_) {
              // Refresh failed — user must log in again
              await storage.deleteAll();
            }
          }
        }
        handler.next(error);
      },
    ),
  );

  return dio;
});
```

The `server_url` is stored in secure storage. First-launch flow:

1. App opens → check if `server_url` + `access_token` exist in secure storage
2. If not → show `SetupScreen` (enter server URL → test connection → login/register)
3. If yes → go to Dashboard

#### `features/auth/setup_screen.dart`

Three steps on first launch:
1. **Server URL input** — text field with `https://your-app.railway.app` placeholder. "Test Connection" button → `GET /api/v1/health`. Shows ✓ Connected or ✗ error.
2. **Login / Register toggle** — two tabs. Login: email + password. Register: name + email + password + invite code.
3. On success → store tokens, navigate to Dashboard.

---

### 9.3 Finance Module (Full)

The Finance screen is a `DefaultTabController` with 5 tabs. All data from existing backend endpoints — no new backend code needed.

#### Tab 1 — Overview

Data: `GET /api/v1/finance/summary` (or compute from transactions if no summary endpoint exists).

Show:
- Month selector (← current month →)
- Income vs Expense donut or bar chart (use `fl_chart`)
- Savings rate: `(income - expenses) / income * 100`
- Top 5 spending categories (horizontal bar chart)
- Month-over-month comparison (this month vs last month spend)

#### Tab 2 — Transactions

Data: `GET /api/v1/finance/transactions?page=1&per_page=30`

UI:
- Search bar at top
- Filter chips: All / Income / Expense / Investment
- Infinite scroll list of `TransactionTile` (date, payee, amount coloured by type, category chip)
- FAB → `QuickAddTransaction` bottom sheet (amount, type toggle, category picker, date, notes)

`QuickAddTransaction` bottom sheet fields:
```
Amount (numeric keyboard, auto-focus)
Type: Income | Expense | Investment  (segmented control)
Category (dropdown of user's existing categories)
Date (defaults to today, datepicker available)
Notes (optional)
[Save]
```

#### Tab 3 — Debt & EMI

Data: `GET /api/v1/debt/` and `GET /api/v1/debt/summary`

UI:
- Total outstanding banner (sum of all active debts)
- Avalanche recommendation card: "Pay ₹X more on [highest interest debt] to save ₹Y in interest"
- List of `DebtCard` widgets:
  - Lender name + emoji
  - Outstanding / Principal progress bar
  - Interest rate + EMI amount
  - Next due day chip (red if ≤3 days, amber if ≤7)
  - Tap → DebtDetailSheet (payment history, manual payment entry)
- "Add Debt" button → form bottom sheet (mirrors desktop form fields)

#### Tab 4 — My Wealth

Data: `GET /api/v1/investments/` and `GET /api/v1/investments/summary`

UI:
- Total invested banner
- "⚠️ Amounts shown are what you've put in, not current market value" — persistent info chip
- List of `InvestmentCard`:
  - Fund/instrument name + emoji + type chip
  - Total invested amount
  - Monthly SIP amount (if set)
  - Last entry date
  - Tap → InvestmentDetailSheet (entry history, manual add entry)
- "Add Investment" → form bottom sheet

#### Tab 5 — Financial Goals

Data: `GET /api/v1/financial-goals/`

UI:
- List of `FinancialGoalCard`:
  - Goal name + emoji + target amount
  - Progress bar (`current_amount / target_amount`)
  - Days remaining chip
  - Monthly needed vs this month's investment
  - `is_on_track` badge (green "On track" / red "Behind")
- "Add Goal" → form bottom sheet

---

### 9.4 Quick Logging

The most important UX feature on mobile. Reachable from any screen via a persistent FAB.

#### `features/quick_log/quick_log_fab.dart`

A `SpeedDial` style FAB that expands into 3 options:
```
✅ Habits   → HabitCheckinSheet
💸 Expense  → QuickExpenseSheet
📓 Journal  → QuickJournalSheet
```

The FAB is part of the app shell (not per-screen) so it's always accessible.

#### `HabitCheckinSheet` — bottom sheet

Data: `GET /api/v1/habits/?today=true` (today's due habits only)

UI:
- Title: "Today's habits"
- List of due habits with name + emoji
- Each row: habit name + `[✓ Done]` toggle
- Already checked-in habits show green ✓
- On tap → `POST /api/v1/habits/{id}/checkin` with today's date
- Optimistic UI: mark green immediately, revert on error

This must work in under 3 taps from anywhere in the app.

#### `QuickExpenseSheet` — bottom sheet

```
₹ [amount input — numeric keyboard, auto-focus]
Category: [horizontal scroll of category chips]
[Save as Expense]  [Save as Income]
```

On submit → `POST /api/v1/finance/transactions` with `type="expense"` (or income), amount, category, today's date. Dismiss sheet on success + show snackbar "Saved ₹X".

Speed target: user can log an expense in under 10 seconds from anywhere in the app.

#### `QuickJournalSheet` — bottom sheet

```
[Multi-line text field — "What's on your mind?"]
Mood: 😢 😐 🙂 😊 😄  (5 emoji buttons)
[Save]
```

On submit → `POST /api/v1/journal/entries` with `content`, `mood_score` (1–5 from emoji selection), today's date.

---

### 9.5 Dashboard

Data: Multiple parallel calls on load (use `Future.wait`):
- `GET /api/v1/ai/briefing` — morning briefing text
- `GET /api/v1/habits/?today=true` — today's habits
- `GET /api/v1/finance/summary?month=current` — finance snapshot
- `GET /api/v1/goals/?status=active` — active goals

UI layout (scrollable column):
```
[Greeting] "Good morning, Jeevan" (time-aware)
[AI Briefing Card] — text from /ai/briefing, shimmer while loading
[Habits Ring] — circular progress of today's habits (done/total)
[Finance Summary] — income, expenses, savings rate for current month
[Goal Cards] — horizontal scroll of active goal cards with progress
```

Pull-to-refresh reloads all.

---

### 9.6 Settings Screen

```
Account
  Name: Jeevan
  Email: jeevan@...
  [Change Password]
  [Sign Out]

Connection
  Server URL: https://north-os.railway.app
  [Test Connection] → shows latency or error
  Status: ✓ Connected

AI
  Provider: Gemini Flash (default) / Custom
  [Your API Key — optional override]

Notifications (future Phase 10)
  Morning briefing: 08:00
  Weekly review: Sunday 19:00
```

---

### 9.7 Phase 9 Testing Checklist

**Auth + Setup:**
- [ ] Fresh install → setup screen appears
- [ ] Invalid server URL → test connection shows error, cannot proceed
- [ ] Valid server URL + correct credentials → login succeeds, navigates to dashboard
- [ ] Invalid credentials → 401 shown as user-friendly message
- [ ] Expired access token → silent refresh, user never sees an error
- [ ] Refresh token expired → user redirected to login screen

**Finance — Full:**
- [ ] Overview tab shows correct month totals matching desktop app
- [ ] Switching months (← →) loads correct data
- [ ] Transaction list loads and paginates
- [ ] Quick-add transaction → appears in list immediately (optimistic or after refresh)
- [ ] Debt cards show correct outstanding balance
- [ ] Adding a manual debt payment → outstanding reduces correctly
- [ ] Investment cards show total_invested (not market value)
- [ ] Financial goal progress bars match backend `progress_pct`

**Quick Logging:**
- [ ] FAB accessible from Finance, Dashboard, and Settings screens
- [ ] HabitCheckinSheet: today's due habits listed correctly
- [ ] Check in a habit → green ✓ immediately, confirmed on reload
- [ ] QuickExpense: amount entry → category selection → save → snackbar shown
- [ ] Expense appears in Finance → Transactions tab
- [ ] QuickJournal: text + mood → save → entry appears in desktop app journal
- [ ] All quick log actions complete in ≤3 taps

**Dashboard:**
- [ ] AI briefing loads (may be slow — show shimmer while loading)
- [ ] Habit ring shows correct done/total ratio
- [ ] Finance summary matches Overview tab
- [ ] Pull-to-refresh reloads all cards

**Cross-device sync:**
- [ ] Add expense on mobile → appears on desktop app (same backend)
- [ ] Check in habit on desktop → mobile habit ring updates on refresh
- [ ] Data never crosses between two different user accounts

---

_Updated: 2026-06-25. Phases 1–7 shipped. Phase 8 (multi-user cloud) and Phase 9 (Flutter mobile) are the active build queue. Read APP_REPORT.md first._
