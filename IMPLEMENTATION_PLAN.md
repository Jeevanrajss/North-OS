# North OS — Intelligence Layer Implementation Plan

**Vision:** Track Everything → Understand Patterns → Generate Insights → Improve Life  
**Current state:** v1.0.20. Data collection (pillar ①) is solid. Pillars ②③④ are the gap.  
**This plan:** 5 phases that close the gap — written as a Claude Code handoff spec. Each phase is self-contained and shippable independently.

---

## How to read this document

- File paths are relative to the repo root unless stated otherwise.
- "Existing pattern" callouts tell you which existing file to mirror for consistency.
- Edge cases, error handling, and notification copy are specified inline — don't invent them.
- Build phases in order: each phase unlocks the next.

---

## Phase 1 — Cross-Module Analytics Engine

**Goal:** A backend service that reads all modules daily, computes cross-module correlations, and stores structured insight snapshots. This is the foundation everything else in this plan builds on.

**Why it matters:** Right now `ai.py/_build_data_context` feeds a raw text snapshot to the AI. There is zero computed correlation between modules — the AI has to infer everything from text each time. This phase pre-computes the math so the AI (and the UI) can query structured results.

---

### 1.1 New database model — `AnalyticsSnapshot`

**File:** `backend/app/models/analytics.py`

```python
from __future__ import annotations
import json, uuid
from datetime import date, datetime
from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base

def _uuid() -> str:
    return str(uuid.uuid4())

class AnalyticsSnapshot(Base):
    """One row per computed_date. Stores pre-computed cross-module stats as JSON blobs."""
    __tablename__ = "analytics_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    computed_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)

    # Daily habit completion rate (0.0–1.0) for that day
    habit_completion_rate: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Journal mood score for that day (average of mood_codes mapped to 1-5 scale; None if no entry)
    mood_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Total daily expense amount (INR or user's default currency)
    daily_expense: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Total daily income amount
    daily_income: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Number of habits done that day
    habits_done_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Number of habits scheduled for that day
    habits_scheduled_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Whether a journal entry was written that day
    journal_written: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Word count of journal entries for that day
    journal_word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # JSON blob: {"happy": true, "sad": false, ...} mood booleans
    mood_codes_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # JSON blob: top expense categories {"Food": 420.0, "Transport": 150.0}
    expense_categories_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # JSON blob: per-habit completion {"habit_id": true/false, ...}
    habit_detail_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Helper decoders
    def mood_codes(self) -> dict:
        return json.loads(self.mood_codes_json) if self.mood_codes_json else {}

    def expense_categories(self) -> dict:
        return json.loads(self.expense_categories_json) if self.expense_categories_json else {}

    def habit_detail(self) -> dict:
        return json.loads(self.habit_detail_json) if self.habit_detail_json else {}
```

**Register it:** Add `from app.models.analytics import AnalyticsSnapshot` to `backend/app/db.py` in the models import block (where the other models are imported for auto-migration). The existing auto-migration on startup will create the table.

---

### 1.2 New service — `analytics_engine.py`

**File:** `backend/app/services/analytics_engine.py`

This service has two responsibilities:
1. `backfill_snapshots(db, days=90)` — compute snapshots for the last N days (run once on first boot)
2. `compute_snapshot_for_date(db, target_date)` — compute and upsert a single day's snapshot (run nightly by scheduler)

```python
"""
Cross-module analytics engine.

Computes per-day structured snapshots that correlate data across Journal,
Habits, and Finance. Results stored in AnalyticsSnapshot.

Mood score mapping (from mood_codes used in journal.py):
  happy, excited, grateful, calm, proud  → positive → 4.0
  okay, meh, tired, focused              → neutral  → 3.0
  sad, anxious, angry, stressed, low     → negative → 2.0
  Default for unknown codes              → 3.0

Habit completion rate: habits_done / habits_scheduled for that day.
  - Daily habits are always scheduled.
  - Weekly habits: only scheduled on their configured weekdays.
  - Archived habits are excluded.
"""
from __future__ import annotations

import json
import logging
from datetime import date, timedelta

from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

# Map mood codes → numeric score
MOOD_SCORE_MAP: dict[str, float] = {
    # Positive
    "happy": 4.0, "excited": 4.5, "grateful": 4.0, "calm": 3.5,
    "proud": 4.0, "loved": 4.5, "hopeful": 4.0, "joyful": 4.5,
    # Neutral
    "okay": 3.0, "meh": 2.5, "tired": 2.5, "focused": 3.5,
    "confused": 2.5, "bored": 2.0,
    # Negative
    "sad": 1.5, "anxious": 1.5, "angry": 1.0, "stressed": 1.5,
    "low": 1.5, "overwhelmed": 1.5, "frustrated": 1.5, "lonely": 1.5,
}


def _mood_score_from_codes(codes: list[str]) -> float | None:
    """Average mood score for a list of mood codes. Returns None if no codes."""
    if not codes:
        return None
    scores = [MOOD_SCORE_MAP.get(c.lower(), 3.0) for c in codes]
    return round(sum(scores) / len(scores), 2)


def _habits_for_date(db: Session, target: date) -> tuple[int, int, dict[str, bool]]:
    """
    Returns (scheduled_count, done_count, {habit_id: completed}).
    Excludes archived habits. Respects weekly schedule.
    """
    from app.models.habit import Habit, HabitCheckin

    habits = db.query(Habit).filter(Habit.archived_at.is_(None)).all()
    checkin_ids: set[str] = {
        c.habit_id
        for c in db.query(HabitCheckin).filter(HabitCheckin.day_date == target).all()
    }

    scheduled = 0
    done = 0
    detail: dict[str, bool] = {}
    weekday = target.weekday()  # 0=Mon … 6=Sun

    for h in habits:
        if h.frequency_kind == "weekly":
            weekdays = [int(x) for x in (h.weekdays or "").split(",") if x.strip()]
            if weekday not in weekdays:
                continue  # Not scheduled today — skip
        scheduled += 1
        completed = h.id in checkin_ids
        detail[h.id] = completed
        if completed:
            done += 1

    return scheduled, done, detail


def compute_snapshot_for_date(db: Session, target: date) -> None:
    """
    Compute and upsert the analytics snapshot for `target` date.
    Safe to call multiple times (upsert by computed_date).
    """
    from app.models.analytics import AnalyticsSnapshot
    from app.models.journal import JournalDay
    from app.models.finance import Transaction as TxnModel

    # ── Habits ───────────────────────────────────────────────────────────────
    scheduled, done, habit_detail = _habits_for_date(db, target)
    completion_rate = round(done / scheduled, 4) if scheduled > 0 else None

    # ── Journal ──────────────────────────────────────────────────────────────
    jday = db.query(JournalDay).filter(JournalDay.date == target).first()
    mood_score: float | None = None
    mood_codes_raw: list[str] = []
    journal_written = False
    journal_word_count = 0

    if jday:
        journal_written = bool(jday.entries)
        mood_codes_raw = list(jday.mood_codes or [])
        mood_score = _mood_score_from_codes(mood_codes_raw)
        # Sum word count across all entries for that day
        for entry in (jday.entries or []):
            text = entry.content_text or ""
            journal_word_count += len(text.split())

    # ── Finance ──────────────────────────────────────────────────────────────
    txns = db.query(TxnModel).filter(TxnModel.date == target).all()
    daily_expense = sum(t.amount for t in txns if t.type == "expense") or None
    daily_income = sum(t.amount for t in txns if t.type == "income") or None
    cat_totals: dict[str, float] = {}
    for t in txns:
        if t.type == "expense":
            c = t.category or "Other"
            cat_totals[c] = cat_totals.get(c, 0) + t.amount

    # ── Upsert ───────────────────────────────────────────────────────────────
    existing = db.query(AnalyticsSnapshot).filter(
        AnalyticsSnapshot.computed_date == target
    ).first()

    if existing:
        snap = existing
    else:
        snap = AnalyticsSnapshot(computed_date=target)
        db.add(snap)

    snap.habit_completion_rate = completion_rate
    snap.mood_score = mood_score
    snap.daily_expense = daily_expense
    snap.daily_income = daily_income
    snap.habits_done_count = done if scheduled > 0 else None
    snap.habits_scheduled_count = scheduled if scheduled > 0 else None
    snap.journal_written = journal_written
    snap.journal_word_count = journal_word_count if journal_written else None
    snap.mood_codes_json = json.dumps(mood_codes_raw) if mood_codes_raw else None
    snap.expense_categories_json = json.dumps(cat_totals) if cat_totals else None
    snap.habit_detail_json = json.dumps(habit_detail) if habit_detail else None

    db.commit()
    log.debug("Analytics snapshot upserted for %s", target)


def backfill_snapshots(db: Session, days: int = 90) -> int:
    """
    Backfill snapshots for the last `days` days.
    Skips dates that already have a snapshot.
    Returns number of snapshots created/updated.
    """
    from app.models.analytics import AnalyticsSnapshot

    today = date.today()
    existing_dates: set[date] = {
        row.computed_date
        for row in db.query(AnalyticsSnapshot.computed_date).all()
    }

    count = 0
    for i in range(days, -1, -1):  # oldest to newest
        target = today - timedelta(days=i)
        compute_snapshot_for_date(db, target)
        count += 1

    log.info("Analytics backfill complete: %d days processed", count)
    return count


def get_correlations(db: Session, days: int = 30) -> dict:
    """
    Compute cross-module correlations over the last `days` days.
    Returns a dict consumed by the analytics API and AI context builder.

    Correlations computed:
    - mood_vs_habit_completion: Pearson-like average mood on high-completion days vs low
    - expense_vs_mood: Average expense on low-mood days vs high-mood days
    - journal_habit_correlation: Habit completion rate on days journal was written vs not
    - streak_mood_effect: Average mood during active streaks vs broken streaks
    - best_day_of_week: Weekday with highest average habit completion
    - worst_day_of_week: Weekday with lowest average habit completion
    """
    from app.models.analytics import AnalyticsSnapshot
    from datetime import date, timedelta
    from collections import defaultdict

    today = date.today()
    cutoff = today - timedelta(days=days)
    snaps = (
        db.query(AnalyticsSnapshot)
        .filter(AnalyticsSnapshot.computed_date >= cutoff)
        .order_by(AnalyticsSnapshot.computed_date.asc())
        .all()
    )

    result: dict = {
        "days_analysed": len(snaps),
        "mood_vs_habit_completion": None,
        "expense_vs_mood": None,
        "journal_habit_correlation": None,
        "best_day_of_week": None,
        "worst_day_of_week": None,
        "avg_mood_score": None,
        "avg_habit_completion": None,
        "avg_daily_expense": None,
        "low_mood_days": 0,
        "high_mood_days": 0,
        "zero_habit_days": 0,
        "perfect_habit_days": 0,
    }

    if not snaps:
        return result

    DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    # Filter to snaps that have both mood and habit data for correlation
    paired = [s for s in snaps if s.mood_score is not None and s.habit_completion_rate is not None]
    all_mood = [s for s in snaps if s.mood_score is not None]
    all_habit = [s for s in snaps if s.habit_completion_rate is not None]
    all_expense = [s for s in snaps if s.daily_expense is not None and s.mood_score is not None]

    # Average mood and habit completion
    if all_mood:
        result["avg_mood_score"] = round(sum(s.mood_score for s in all_mood) / len(all_mood), 2)
        result["low_mood_days"] = sum(1 for s in all_mood if s.mood_score < 2.5)
        result["high_mood_days"] = sum(1 for s in all_mood if s.mood_score >= 3.5)

    if all_habit:
        result["avg_habit_completion"] = round(
            sum(s.habit_completion_rate for s in all_habit) / len(all_habit), 2
        )
        result["zero_habit_days"] = sum(1 for s in all_habit if s.habit_completion_rate == 0)
        result["perfect_habit_days"] = sum(1 for s in all_habit if s.habit_completion_rate == 1.0)

    if all_expense:
        result["avg_daily_expense"] = round(
            sum(s.daily_expense for s in all_expense) / len(all_expense), 2
        )

    # Mood vs habit completion — mood on high vs low completion days
    if paired:
        high_comp = [s.mood_score for s in paired if s.habit_completion_rate >= 0.75]
        low_comp = [s.mood_score for s in paired if s.habit_completion_rate < 0.5]
        if high_comp and low_comp:
            result["mood_vs_habit_completion"] = {
                "mood_on_high_completion_days": round(sum(high_comp) / len(high_comp), 2),
                "mood_on_low_completion_days": round(sum(low_comp) / len(low_comp), 2),
                "delta": round(
                    sum(high_comp) / len(high_comp) - sum(low_comp) / len(low_comp), 2
                ),
                "sample_high": len(high_comp),
                "sample_low": len(low_comp),
            }

    # Expense vs mood — spending on low-mood vs high-mood days
    if all_expense:
        high_mood_expense = [s.daily_expense for s in all_expense if s.mood_score >= 3.5]
        low_mood_expense = [s.daily_expense for s in all_expense if s.mood_score < 2.5]
        if high_mood_expense and low_mood_expense:
            result["expense_vs_mood"] = {
                "avg_spend_high_mood": round(sum(high_mood_expense) / len(high_mood_expense), 2),
                "avg_spend_low_mood": round(sum(low_mood_expense) / len(low_mood_expense), 2),
                "delta": round(
                    sum(low_mood_expense) / len(low_mood_expense)
                    - sum(high_mood_expense) / len(high_mood_expense), 2
                ),
            }

    # Journal vs habits
    with_journal = [s.habit_completion_rate for s in snaps
                    if s.journal_written and s.habit_completion_rate is not None]
    without_journal = [s.habit_completion_rate for s in snaps
                       if not s.journal_written and s.habit_completion_rate is not None]
    if with_journal and without_journal:
        result["journal_habit_correlation"] = {
            "habit_rate_with_journal": round(sum(with_journal) / len(with_journal), 2),
            "habit_rate_without_journal": round(sum(without_journal) / len(without_journal), 2),
            "delta": round(
                sum(with_journal) / len(with_journal)
                - sum(without_journal) / len(without_journal), 2
            ),
        }

    # Best/worst day of week by habit completion
    dow_completion: dict[int, list[float]] = defaultdict(list)
    for s in all_habit:
        dow_completion[s.computed_date.weekday()].append(s.habit_completion_rate)

    if dow_completion:
        dow_avg = {d: sum(v) / len(v) for d, v in dow_completion.items()}
        best_dow = max(dow_avg, key=lambda d: dow_avg[d])
        worst_dow = min(dow_avg, key=lambda d: dow_avg[d])
        result["best_day_of_week"] = {
            "day": DAY_NAMES[best_dow],
            "avg_completion": round(dow_avg[best_dow], 2),
        }
        result["worst_day_of_week"] = {
            "day": DAY_NAMES[worst_dow],
            "avg_completion": round(dow_avg[worst_dow], 2),
        }

    return result
```

---

### 1.3 New router — `analytics.py`

**File:** `backend/app/routers/analytics.py`

```python
"""Analytics router — cross-module pattern endpoints."""
from __future__ import annotations

from datetime import date
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.analytics_engine import (
    backfill_snapshots,
    compute_snapshot_for_date,
    get_correlations,
)

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


class CorrelationsResponse(BaseModel):
    days_analysed: int
    avg_mood_score: float | None
    avg_habit_completion: float | None
    avg_daily_expense: float | None
    low_mood_days: int
    high_mood_days: int
    zero_habit_days: int
    perfect_habit_days: int
    mood_vs_habit_completion: dict | None
    expense_vs_mood: dict | None
    journal_habit_correlation: dict | None
    best_day_of_week: dict | None
    worst_day_of_week: dict | None


@router.get("/correlations", response_model=CorrelationsResponse)
def correlations(
    days: int = Query(default=30, ge=7, le=365),
    db: Session = Depends(get_db),
):
    """Return cross-module correlation data for the last N days."""
    return get_correlations(db, days=days)


@router.get("/snapshots")
def snapshots(
    from_date: date = Query(default=None),
    to_date: date = Query(default=None),
    db: Session = Depends(get_db),
):
    """Return raw daily snapshots for charting on the frontend."""
    from app.models.analytics import AnalyticsSnapshot
    from datetime import timedelta

    if not from_date:
        from_date = date.today() - timedelta(days=30)
    if not to_date:
        to_date = date.today()

    rows = (
        db.query(AnalyticsSnapshot)
        .filter(
            AnalyticsSnapshot.computed_date >= from_date,
            AnalyticsSnapshot.computed_date <= to_date,
        )
        .order_by(AnalyticsSnapshot.computed_date.asc())
        .all()
    )

    return [
        {
            "date": r.computed_date.isoformat(),
            "mood_score": r.mood_score,
            "habit_completion_rate": r.habit_completion_rate,
            "daily_expense": r.daily_expense,
            "daily_income": r.daily_income,
            "journal_written": r.journal_written,
            "habits_done": r.habits_done_count,
            "habits_scheduled": r.habits_scheduled_count,
        }
        for r in rows
    ]


@router.post("/backfill")
def trigger_backfill(
    days: int = Query(default=90, ge=1, le=365),
    db: Session = Depends(get_db),
):
    """Manually trigger a backfill. Exposed for Settings UI / testing."""
    count = backfill_snapshots(db, days=days)
    return {"processed": count}


@router.post("/compute-today")
def compute_today(db: Session = Depends(get_db)):
    """Recompute today's snapshot on demand."""
    compute_snapshot_for_date(db, date.today())
    return {"ok": True, "date": date.today().isoformat()}
```

**Register in `backend/app/main.py`:**
```python
from app.routers.analytics import router as analytics_router
app.include_router(analytics_router)
```

---

### 1.4 Scheduler jobs — nightly analytics update

**File:** `backend/app/scheduler.py` — add these to the existing file:

Add new job runner functions alongside the existing ones:

```python
def _run_analytics_snapshot() -> None:
    """Compute today's analytics snapshot at midnight."""
    from datetime import date
    from app.db import SessionLocal
    from app.services.analytics_engine import compute_snapshot_for_date
    with SessionLocal() as db:
        compute_snapshot_for_date(db, date.today())
        # Also compute yesterday (catches late-night journal entries / transactions)
        from datetime import timedelta
        compute_snapshot_for_date(db, date.today() - timedelta(days=1))
    log.info("Analytics snapshot computed")
```

In `start_scheduler()`, add after the existing jobs:
```python
_scheduler.add_job(
    _run_analytics_snapshot,
    CronTrigger(hour=0, minute=5),  # 00:05 daily — after midnight
    id="analytics_snapshot", replace_existing=True,
)
```

Also add in `reschedule_jobs()` (it doesn't need rescheduling but must not be dropped):
```python
# analytics job: fixed at 00:05, no user-configurable time
```

---

### 1.5 Backfill on first boot

**File:** `backend/app/main.py` — in the `lifespan` or `startup_event` handler, after the DB migrations:

```python
# Run analytics backfill on first boot (idempotent — skips existing snapshots)
from app.services.analytics_engine import backfill_snapshots
from app.db import SessionLocal
with SessionLocal() as db:
    try:
        backfill_snapshots(db, days=90)
    except Exception as e:
        log.warning("Analytics backfill failed on startup: %s", e)
        # Non-fatal — don't block app startup
```

---

### 1.6 Upgrade `_build_data_context` in `ai.py`

Append correlation data to the existing context builder so the AI chat has structured pattern data, not just raw module snapshots:

```python
# At the end of _build_data_context(), before `return "\n".join(lines)`:

from app.services.analytics_engine import get_correlations
try:
    correlations = get_correlations(db, days=30)
    lines.append("\n## Cross-Module Patterns (last 30 days, pre-computed)")
    if correlations["avg_mood_score"] is not None:
        lines.append(f"Average mood score: {correlations['avg_mood_score']:.1f}/5.0")
    if correlations["avg_habit_completion"] is not None:
        lines.append(f"Average habit completion: {correlations['avg_habit_completion']*100:.0f}%")
    mhc = correlations.get("mood_vs_habit_completion")
    if mhc:
        lines.append(
            f"Mood on high-completion days ({mhc['sample_high']} days): {mhc['mood_on_high_completion_days']:.1f}/5.0"
        )
        lines.append(
            f"Mood on low-completion days ({mhc['sample_low']} days): {mhc['mood_on_low_completion_days']:.1f}/5.0"
        )
    evm = correlations.get("expense_vs_mood")
    if evm:
        lines.append(
            f"Avg spend on high-mood days: {evm['avg_spend_high_mood']:.0f} | "
            f"on low-mood days: {evm['avg_spend_low_mood']:.0f}"
        )
    jhc = correlations.get("journal_habit_correlation")
    if jhc:
        lines.append(
            f"Habit completion with journal written: {jhc['habit_rate_with_journal']*100:.0f}% | "
            f"without journal: {jhc['habit_rate_without_journal']*100:.0f}%"
        )
    if correlations.get("best_day_of_week"):
        lines.append(f"Best habit day: {correlations['best_day_of_week']['day']}")
    if correlations.get("worst_day_of_week"):
        lines.append(f"Worst habit day: {correlations['worst_day_of_week']['day']}")
except Exception:
    pass  # Non-fatal — correlation data is an enhancement, not required
```

---

### 1.7 Frontend — Patterns page

**File:** `frontend/src/routes/Patterns.tsx` (new file)

This is a new route at `/patterns`. It displays the cross-module correlation data as charts.

**Components to create** (all in `frontend/src/components/patterns/`):

- `CorrelationCards.tsx` — summary cards showing the key correlations (mood delta, expense delta, journal vs habits)
- `MoodHabitChart.tsx` — dual-axis line chart: mood score + habit completion rate over time (use recharts `ComposedChart` with `Line` for both)
- `ExpensePatternChart.tsx` — bar chart: daily expense coloured by mood level (green/amber/red)
- `WeekdayHeatmap.tsx` — 7-column grid showing average habit completion per weekday

**Route registration** — `frontend/src/App.tsx`:
```tsx
import { Patterns } from './routes/Patterns';
// ...
<Route path="/patterns" element={<Patterns />} />
```

**Sidebar item** — add to sidebar navigation list alongside existing items:
```tsx
{ path: '/patterns', label: 'Patterns', icon: TrendingUp }
```
Import `TrendingUp` from lucide-react.

**Data fetching** in `Patterns.tsx`:
```tsx
// Correlations summary
const { data: correlations } = useQuery({
  queryKey: ['analytics-correlations', 30],
  queryFn: () => api.analytics.correlations(30),
  staleTime: 1000 * 60 * 10, // 10 min cache
});

// Daily snapshots for charts
const { data: snapshots } = useQuery({
  queryKey: ['analytics-snapshots', from, to],
  queryFn: () => api.analytics.snapshots({ from_date, to_date }),
  staleTime: 1000 * 60 * 10,
});
```

**Add to `frontend/src/lib/api.ts`:**
```typescript
analytics: {
  correlations: (days = 30) =>
    fetch(`/api/v1/analytics/correlations?days=${days}`).then(r => r.json()),
  snapshots: (params: { from_date?: string; to_date?: string }) => {
    const q = new URLSearchParams();
    if (params.from_date) q.set('from_date', params.from_date);
    if (params.to_date) q.set('to_date', params.to_date);
    return fetch(`/api/v1/analytics/snapshots?${q}`).then(r => r.json());
  },
  backfill: (days = 90) =>
    fetch(`/api/v1/analytics/backfill?days=${days}`, { method: 'POST' }).then(r => r.json()),
  computeToday: () =>
    fetch('/api/v1/analytics/compute-today', { method: 'POST' }).then(r => r.json()),
},
```

**Empty state:** When `days_analysed < 7`, show: *"Not enough data yet — check back after a week of tracking habits and journaling."*

**Error handling:** Wrap chart data in try/catch. If `correlations` is null/undefined, show skeleton cards, not a crash. All `null` correlation fields should show "Not enough data" chips, not zeros.

---

## Phase 2 — Goals / OKRs Module

**Goal:** A Goals module where Jeevan can define what he's trying to achieve, link goals to existing habits or finance metrics, and track progress. This anchors the "Improve Life" pillar — without goals, patterns and insights float in a vacuum.

---

### 2.1 Database model — `Goal`

**File:** `backend/app/models/goal.py`

```python
from __future__ import annotations
import json, uuid
from datetime import date, datetime
from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base

def _uuid() -> str:
    return str(uuid.uuid4())

class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    emoji: Mapped[str] = mapped_column(String(10), nullable=False, default="🎯")

    # Goal type:
    # "habit_streak"    → target streak on a specific habit
    # "habit_rate"      → target completion % on a habit over period
    # "finance_save"    → save a target amount by a date
    # "finance_spend"   → spend less than a target amount in a category
    # "custom"          → freeform, user updates progress manually
    goal_type: Mapped[str] = mapped_column(String(50), nullable=False, default="custom")

    # For linked goals — the ID of the linked habit or finance category
    linked_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    linked_label: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Target value (streak count, %, savings amount, spend limit)
    target_value: Mapped[float | None] = mapped_column(Float, nullable=True)

    # For habit_rate: the window in days to measure rate over
    target_period_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # For finance goals: the currency
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")

    # Current value for custom goals (user sets manually)
    current_value: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Deadline
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Status: "active", "completed", "paused", "abandoned"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)

    # Soft delete
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Sort order (drag-to-reorder like habits)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

**Register:** Add `from app.models.goal import Goal` to `backend/app/db.py` imports.

---

### 2.2 Schemas

**File:** `backend/app/schemas/goal.py`

```python
from __future__ import annotations
from datetime import date, datetime
from pydantic import BaseModel, Field

GOAL_TYPES = ["habit_streak", "habit_rate", "finance_save", "finance_spend", "custom"]
GOAL_STATUSES = ["active", "completed", "paused", "abandoned"]


class GoalIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    emoji: str = "🎯"
    goal_type: str = "custom"
    linked_id: str | None = None
    linked_label: str | None = None
    target_value: float | None = None
    target_period_days: int | None = None
    currency: str = "INR"
    current_value: float | None = None
    target_date: date | None = None
    sort_order: int = 0


class GoalPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    emoji: str | None = None
    target_value: float | None = None
    target_period_days: int | None = None
    current_value: float | None = None
    target_date: date | None = None
    status: str | None = None
    sort_order: int | None = None


class GoalOut(BaseModel):
    id: str
    title: str
    description: str | None
    emoji: str
    goal_type: str
    linked_id: str | None
    linked_label: str | None
    target_value: float | None
    target_period_days: int | None
    currency: str
    current_value: float | None
    target_date: date | None
    status: str
    sort_order: int
    created_at: datetime
    updated_at: datetime
    # Computed fields (filled by router)
    progress_pct: float | None = None   # 0.0–100.0
    computed_current: float | None = None  # live-computed value (for linked goals)
    days_remaining: int | None = None

    model_config = {"from_attributes": True}
```

---

### 2.3 Router

**File:** `backend/app/routers/goals.py`

Endpoints:
```
GET    /api/v1/goals/              list active goals with computed progress
POST   /api/v1/goals/              create a goal
GET    /api/v1/goals/{id}          get one goal + computed progress
PATCH  /api/v1/goals/{id}          partial update
DELETE /api/v1/goals/{id}          soft archive
POST   /api/v1/goals/{id}/complete mark as completed
POST   /api/v1/goals/{id}/abandon  mark as abandoned
```

**Progress computation logic** (in router, helper function `_compute_progress`):

- `habit_streak` — query `HabitCheckin` for the linked habit, compute current schedule-aware streak using same logic as `habit.py/_streak_for()`. Progress = `current_streak / target_value * 100`, capped at 100.
- `habit_rate` — query last `target_period_days` days of checkins for linked habit, compute completion %. Progress = `actual_rate / (target_value/100) * 100`, capped at 100.
- `finance_save` — query `Transaction` where `type=income` and `date >= goal.created_at`, sum. Progress = `sum / target_value * 100`.
- `finance_spend` — query `Transaction` where `type=expense` AND `category=linked_id` for current month, sum. Progress = `(1 - sum/target_value) * 100` (inverse — less spent = better). If spend exceeds target, progress = 0.
- `custom` — use `current_value / target_value * 100` if both set, else None.

**Edge cases:**
- If `linked_id` is set but the referenced habit doesn't exist (deleted), return `progress_pct=None` and include `"warning": "Linked habit no longer exists"` in the response.
- If `target_value` is None, return `progress_pct=None` (goal is freeform).
- If `target_date` is in the past and status is still "active", include `"overdue": true` in response.
- `days_remaining` = `(target_date - date.today()).days` if `target_date` is set and not past, else None.

**Register in `main.py`:**
```python
from app.routers.goals import router as goals_router
app.include_router(goals_router)
```

---

### 2.4 Frontend

**File:** `frontend/src/routes/Goals.tsx` (new)

**Route:** `/goals`  
**Sidebar:** Add `{ path: '/goals', label: 'Goals', icon: Target }` — import `Target` from lucide-react.

**Components** (in `frontend/src/components/goals/`):

**`GoalCard.tsx`** — displays one goal with:
- Emoji + title + status badge
- Progress bar (use same style as existing FinanceBudgetBar if one exists, otherwise build inline)
- `computed_current / target_value` label (e.g. "23 / 30 day streak" or "₹4,200 / ₹10,000 saved")
- Days remaining chip (green if >14 days, amber if 7–14, red if <7)
- Overflow menu: Edit, Complete, Abandon, Delete

**`GoalForm.tsx`** — opened in the existing `RightDrawer` pattern (not a modal):
- Title input
- Emoji picker (same pattern as Habits emoji picker)
- Goal type selector: Custom / Habit Streak / Habit Rate / Save Money / Limit Spending
- Conditional fields based on type:
  - Habit Streak/Rate: habit selector dropdown (fetches `/api/v1/habits/`)
  - Finance Save/Spend: category input + currency selector
  - All: Target value input, Target date picker, Description textarea
- Validation: title required; target_value required for non-custom types

**`GoalProgressRing.tsx`** — SVG ring showing % progress (optional, nice-to-have)

**Empty state copy:** *"No goals yet. Set your first goal to give your habits and tracking a north star."*

**Add to `api.ts`:**
```typescript
goals: {
  list: () => fetch('/api/v1/goals/').then(r => r.json()),
  get: (id: string) => fetch(`/api/v1/goals/${id}`).then(r => r.json()),
  create: (body: GoalIn) =>
    fetch('/api/v1/goals/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  update: (id: string, body: Partial<GoalIn>) =>
    fetch(`/api/v1/goals/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  delete: (id: string) => fetch(`/api/v1/goals/${id}`, { method: 'DELETE' }).then(r => r.json()),
  complete: (id: string) => fetch(`/api/v1/goals/${id}/complete`, { method: 'POST' }).then(r => r.json()),
  abandon: (id: string) => fetch(`/api/v1/goals/${id}/abandon`, { method: 'POST' }).then(r => r.json()),
},
```

---

### 2.5 Goals card on Dashboard

Add a `DashGoalsCard.tsx` to `frontend/src/components/dashboard/`:
- Shows top 3 active goals by proximity to deadline
- Each: emoji, title, mini progress bar, days remaining
- "View all" link to `/goals`
- Only renders if there is at least 1 active goal (don't show an empty card)
- Respect `isEnabled('goals')` from `ModulesContext` — add `goals` to the module list

---

### 2.6 Goals in AI context

**In `ai.py/_build_data_context`**, add after the Finance section:
```python
from app.models.goal import Goal

active_goals = db.query(Goal).filter(
    Goal.status == "active", Goal.archived_at.is_(None)
).all()
if active_goals:
    lines.append("\n## Active Goals")
    for g in active_goals:
        deadline = f" (due {g.target_date})" if g.target_date else ""
        lines.append(f"- {g.emoji} {g.title}{deadline}: target={g.target_value}, type={g.goal_type}")
```

---

## Phase 3 — Weekly AI Review Digest

**Goal:** Every Sunday evening, automatically generate a cross-module weekly review and deliver it as a notification. This turns North OS from passive tracker → active coach.

---

### 3.1 New service function

**File:** `backend/app/services/notification_service.py` — add new function:

```python
async def generate_weekly_review(db: Session) -> Notification | None:
    """
    Generate a weekly AI review digest and persist it as a notification.
    Runs Sunday evenings. Covers the last 7 days across all modules.
    Returns None if AI is unavailable or quiet hours are active.

    De-duplication: skip if a 'weekly_review' notification was already created
    this week (Monday–Sunday window).
    """
    from datetime import date, timedelta
    from app.models.notification import Notification as NotifModel
    from app.services.llm_client import generate as llm_generate, LLMError
    from app.services.analytics_engine import get_correlations

    # De-dup: check if we've already sent a weekly review in the last 6 days
    six_days_ago = date.today() - timedelta(days=6)
    existing = (
        db.query(NotifModel)
        .filter(
            NotifModel.type == "weekly_review",
            NotifModel.created_at >= six_days_ago,
        )
        .first()
    )
    if existing:
        log.info("Weekly review already sent this week — skipping")
        return None

    # Build context
    from app.routers.ai import _build_data_context
    context = _build_data_context(db)

    correlations = get_correlations(db, days=7)

    prompt = f"""
Here is a user's personal data for the last 7 days:

{context}

Cross-module correlations this week:
- Avg mood: {correlations.get('avg_mood_score')}
- Avg habit completion: {correlations.get('avg_habit_completion')}
- Mood on high-habit days vs low-habit days: {correlations.get('mood_vs_habit_completion')}
- Spending on low-mood days vs high-mood days: {correlations.get('expense_vs_mood')}

Write a brief weekly review in exactly this format:

🌟 Week in review:
[1–2 sentences on what went well this week, with specific data]

📊 Pattern noticed:
[1 cross-module insight — connect at least 2 modules, e.g. habits + mood or journal + spending]

🎯 One focus for next week:
[One specific, actionable recommendation]

Keep it warm, personal, and under 100 words total. No bullet points inside sections. Use the actual data.
"""

    system = (
        "You are a personal coach reviewing someone's week. Be warm, specific, and brief. "
        "Always reference real numbers from the data. Never fabricate. "
        "If data is sparse (fewer than 3 days), acknowledge it and focus on what is available."
    )

    try:
        response = await llm_generate(
            prompt,
            purpose="insights",
            system=system,
            temperature=0.6,
            max_tokens=300,
        )
    except LLMError as e:
        log.warning("Weekly review LLM failed: %s", e)
        return None

    if not response or len(response.strip()) < 20:
        log.warning("Weekly review: empty/short LLM response, skipping")
        return None

    return create_notification(
        db=db,
        type="weekly_review",
        title="Your week in review 📊",
        body=response.strip(),
        data={"week_ending": date.today().isoformat()},
        skip_quiet=True,  # Weekly review is important enough to bypass quiet hours
    )
```

**Note:** This function is `async` because it calls `llm_generate`. The scheduler must handle this — see 3.2.

---

### 3.2 Scheduler job for weekly review

**File:** `backend/app/scheduler.py`

```python
def _run_weekly_review() -> None:
    """Run Sunday 19:00. Uses asyncio.run() to call async review generator."""
    import asyncio
    from app.db import SessionLocal
    from app.models.setting import Setting
    from app.services.notification_service import generate_weekly_review

    with SessionLocal() as db:
        s = db.query(Setting).filter(Setting.key == "notif.weekly_review_enabled").first()
        if s and s.value == "false":
            return

    async def _inner():
        with SessionLocal() as db:
            await generate_weekly_review(db)

    try:
        asyncio.run(_inner())
    except Exception as e:
        log.warning("Weekly review job failed: %s", e)
```

In `start_scheduler()`:
```python
_scheduler.add_job(
    _run_weekly_review,
    CronTrigger(day_of_week="sun", hour=19, minute=0),
    id="weekly_review", replace_existing=True,
)
```

---

### 3.3 Manual trigger endpoint

**File:** `backend/app/routers/notifications.py` — add:

```python
@router.post("/trigger/weekly-review")
async def trigger_weekly_review(db: Session = Depends(get_db)) -> dict:
    """Manual trigger for testing. Returns the notification body if successful."""
    from app.services.notification_service import generate_weekly_review
    notif = await generate_weekly_review(db)
    if notif:
        return {"created": True, "body": notif.body}
    return {"created": False, "reason": "AI unavailable or already sent this week"}
```

---

### 3.4 Settings toggle

**File:** `frontend/src/routes/Settings.tsx`

In the Notifications section, add a toggle:

```
Weekly Review (Sunday evenings)  [toggle — default ON]
```

Key: `notif.weekly_review_enabled`, default value: `"true"`

Match the pattern of the existing `notif.budget_warning_enabled` toggle exactly (it's opt-in but weekly review should be opt-out, i.e., default enabled).

---

### 3.5 Frontend — weekly review notification rendering

**File:** `frontend/src/components/NotificationPanel.tsx`

For notifications where `type === "weekly_review"`, render the `body` field as pre-formatted text (preserve newlines). The existing renderer likely renders `body` as a single string — add a conditional:

```tsx
{notif.type === 'weekly_review' ? (
  <pre className="whitespace-pre-wrap text-xs text-ink-300 font-sans mt-1">
    {notif.body}
  </pre>
) : (
  <p className="text-xs text-ink-400 mt-0.5">{notif.body}</p>
)}
```

---

## Phase 4 — Proactive Morning Briefing Upgrade

**Goal:** Upgrade the existing morning briefing from a summary card into a pattern-aware daily nudge. Instead of just "here's what you have today", it should say "based on your patterns, here's what to focus on."

---

### 4.1 Upgrade `check_morning_briefing` in `notification_service.py`

Find the existing `check_morning_briefing` function and replace its prompt with:

```python
async def check_morning_briefing(db: Session) -> int:
    """
    Generate an AI morning briefing with pattern-aware nudge.
    Returns count of notifications created (0 or 1).

    De-dup: skip if a morning_briefing notification was created today already.
    """
    from datetime import date, timedelta
    from app.models.notification import Notification as NotifModel
    from app.services.llm_client import generate as llm_generate, LLMError
    from app.services.analytics_engine import get_correlations
    from app.routers.ai import _build_data_context

    today = date.today()

    # De-dup check
    existing = (
        db.query(NotifModel)
        .filter(
            NotifModel.type == "morning_briefing",
            NotifModel.created_at >= today,
        )
        .first()
    )
    if existing:
        return 0

    context = _build_data_context(db)
    correlations = get_correlations(db, days=30)

    # Build pattern context
    pattern_lines = []
    mhc = correlations.get("mood_vs_habit_completion")
    if mhc and abs(mhc.get("delta", 0)) > 0.3:
        direction = "higher" if mhc["delta"] > 0 else "lower"
        pattern_lines.append(
            f"Your mood is {direction} on days you complete habits "
            f"(delta: {abs(mhc['delta']):.1f} pts over {correlations['days_analysed']} days)."
        )

    worst_dow = correlations.get("worst_day_of_week")
    today_name = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][today.weekday()]
    if worst_dow and worst_dow["day"] == today_name:
        pattern_lines.append(
            f"Historically, {today_name} is your weakest habit day "
            f"({worst_dow['avg_completion']*100:.0f}% avg). "
            "Worth being intentional today."
        )

    evm = correlations.get("expense_vs_mood")
    if evm and evm.get("delta", 0) > 200:
        pattern_lines.append(
            f"You spend ~{evm['delta']:.0f} more on low-mood days. "
            "If today feels heavy, watch discretionary spending."
        )

    pattern_text = "\n".join(pattern_lines) if pattern_lines else "Not enough pattern data yet."

    prompt = f"""
Today's data context:
{context}

Patterns from last 30 days:
{pattern_text}

Write a brief, warm morning briefing in this format:

Good morning! [1 sentence greeting referencing today's date or day of week]

Today: [2–3 specific things — habits to do, journal status, any upcoming subscription renewals — pull real data]

Pattern nudge: [1 sentence personalised insight or recommendation based on the patterns above. Skip this section if pattern data is insufficient.]

Under 80 words total. Direct and warm. No filler phrases.
"""

    system = (
        "You are writing a morning briefing for a personal productivity app. "
        "Be warm but concise. Reference real data — names of habits, amounts, dates. "
        "The pattern nudge should feel like a coach noticing something, not a generic tip. "
        "If there is no useful pattern data, omit the Pattern nudge section entirely."
    )

    try:
        response = await llm_generate(
            prompt, purpose="insights", system=system,
            temperature=0.5, max_tokens=200,
        )
    except LLMError as e:
        log.warning("Morning briefing LLM failed: %s", e)
        return 0

    if not response:
        return 0

    notif = create_notification(
        db=db,
        type="morning_briefing",
        title=f"Morning briefing · {today.strftime('%A, %d %b')}",
        body=response.strip(),
        data={"date": today.isoformat()},
        skip_quiet=False,
    )
    return 1 if notif else 0
```

**Note:** If the existing `check_morning_briefing` is synchronous, convert it to async (it calls `llm_generate` which is async). Update `_run_morning_briefing()` in `scheduler.py` to use `asyncio.run()` the same way as the weekly review runner above.

---

### 4.2 Upgrade the `DashAIBriefing` card

**File:** `frontend/src/components/dashboard/DashAIBriefing.tsx`

The existing card renders the morning briefing notification body. Upgrade it to:
1. Render the body with preserved newlines (use `whitespace-pre-wrap`)
2. Add a "Refresh" button that calls `POST /api/v1/notifications/trigger/morning-briefing` — useful when user opens the app after the scheduled time without a fresh briefing
3. Show a subtle "Pattern-aware" chip/badge when the body contains "Pattern nudge:" — indicates the AI used cross-module data

---

## Phase 5 — Health Tracking Module

**Goal:** Add lightweight health logging (sleep, energy, exercise) so pattern correlations include physical wellbeing data. This enriches the analytics engine with a dimension that dramatically improves insight quality.

**Note:** Keep this simple. This is not a full health app — it's a daily log of 3–4 metrics. The power comes from correlating health with mood, habits, and spending.

---

### 5.1 Database model — `HealthLog`

**File:** `backend/app/models/health_log.py`

```python
from __future__ import annotations
import uuid
from datetime import date, datetime
from sqlalchemy import Date, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base

def _uuid() -> str:
    return str(uuid.uuid4())

class HealthLog(Base):
    """One row per day. User logs sleep, energy, and exercise."""
    __tablename__ = "health_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    log_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)

    # Sleep hours (e.g. 7.5)
    sleep_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Energy level 1–5 (1=exhausted, 5=great)
    energy_level: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Exercise minutes
    exercise_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Exercise type (freeform, e.g. "walk", "gym", "yoga")
    exercise_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Water intake glasses (optional)
    water_glasses: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Freeform notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

**Register:** Add `from app.models.health_log import HealthLog` to `backend/app/db.py`.

---

### 5.2 Router

**File:** `backend/app/routers/health_tracking.py`

```
GET    /api/v1/health-log/                  list logs (last 30 days default)
GET    /api/v1/health-log/{date}            get log for a specific date
PUT    /api/v1/health-log/{date}            upsert log for date (idempotent)
DELETE /api/v1/health-log/{date}            delete log for date
GET    /api/v1/health-log/stats             avg sleep, energy, exercise over a window
```

**Schema fields for PUT body:**
- `sleep_hours: float | None` — validate: 0 ≤ value ≤ 24
- `energy_level: int | None` — validate: 1 ≤ value ≤ 5
- `exercise_minutes: int | None` — validate: 0 ≤ value ≤ 480
- `exercise_type: str | None` — max 100 chars
- `water_glasses: int | None` — validate: 0 ≤ value ≤ 30
- `notes: str | None` — max 500 chars

**Edge cases:**
- If `date` is in the future (more than 1 day ahead), return 422 with message: `"Cannot log health data for a future date."`
- If `date` is more than 1 year in the past, return 422: `"Date is too far in the past."`
- All fields optional — the PUT endpoint is additive; you can update just sleep without wiping exercise.

**Register in `main.py`:**
```python
from app.routers.health_tracking import router as health_tracking_router
app.include_router(health_tracking_router)
```

---

### 5.3 Frontend

**File:** `frontend/src/routes/Health.tsx` (new)

**Route:** `/health`  
**Sidebar:** `{ path: '/health', label: 'Health', icon: Heart }` — import `Heart` from lucide-react.

**Layout:**
- Top: Today's log card with inline inputs (sleep hours slider 0–12 in 0.5 steps, energy 1–5 star/button selector, exercise minutes input + type text, water glasses stepper, notes textarea)
- Middle: 30-day trend charts — sleep hours line, energy level line, exercise bar
- Bottom: Average stats chips (avg sleep, avg energy, exercise days this month)

**Quick-log pattern:** The today card auto-loads today's log on mount. User edits any field → debounced PUT to `/api/v1/health-log/{today}` after 1 second. Show a "Saved" indicator. No submit button needed.

**Empty state (no logs yet):** *"Start logging today. Even tracking sleep and energy for a week reveals patterns you wouldn't notice otherwise."*

---

### 5.4 Integrate health into analytics engine

**File:** `backend/app/services/analytics_engine.py`

In `compute_snapshot_for_date()`, add health data to the snapshot. Add these columns to `AnalyticsSnapshot` model:

```python
# Health fields (add to analytics model in Phase 5)
sleep_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
energy_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
exercise_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

In the compute function, add:
```python
# ── Health ───────────────────────────────────────────────────────────────────
from app.models.health_log import HealthLog
hlog = db.query(HealthLog).filter(HealthLog.log_date == target).first()
snap.sleep_hours = hlog.sleep_hours if hlog else None
snap.energy_level = hlog.energy_level if hlog else None
snap.exercise_minutes = hlog.exercise_minutes if hlog else None
```

In `get_correlations()`, add new correlation:
```python
# Sleep vs mood
sleep_mood = [(s.sleep_hours, s.mood_score) for s in snaps
              if s.sleep_hours is not None and s.mood_score is not None]
if len(sleep_mood) >= 5:
    good_sleep = [mood for sleep, mood in sleep_mood if sleep >= 7]
    poor_sleep = [mood for sleep, mood in sleep_mood if sleep < 6]
    if good_sleep and poor_sleep:
        result["sleep_vs_mood"] = {
            "mood_good_sleep": round(sum(good_sleep) / len(good_sleep), 2),
            "mood_poor_sleep": round(sum(poor_sleep) / len(poor_sleep), 2),
            "delta": round(sum(good_sleep)/len(good_sleep) - sum(poor_sleep)/len(poor_sleep), 2),
        }
```

---

## Phase 6 — Settings wiring + Module toggles

**Goal:** Every new module added in phases 1–5 should be toggleable from Settings, just like the existing modules. This keeps the UI clean for users who don't want certain modules.

**File:** `frontend/src/contexts/ModulesContext.tsx` (existing)

Add to the modules list: `"patterns"`, `"goals"`, `"health"`.

**File:** `frontend/src/routes/Settings.tsx`

In the Modules section, add toggles for:
- **Patterns** — "Cross-module pattern analysis and correlation charts"
- **Goals** — "Set and track personal goals linked to your habits and finances"
- **Health** — "Log sleep, energy, and exercise for health-pattern correlations"

All three default to `enabled: true`.

---

## Implementation order

Build strictly in this sequence — each phase's data feeds the next:

1. **Phase 1** — Analytics Engine (backend + Patterns page)
2. **Phase 2** — Goals Module (backend + frontend)
3. **Phase 3** — Weekly Review (scheduler + notifications)
4. **Phase 4** — Morning Briefing Upgrade (depends on Phase 1 correlations)
5. **Phase 5** — Health Module (adds data; analytics engine already has slots for it)
6. **Phase 6** — Settings wiring (can be done alongside any phase)

Each phase is independently shippable. Ship Phase 1 first, dog-food it for a week, then move to Phase 2.

---

## Common patterns to follow

Refer to these existing files for exact code style:

| Pattern | Reference file |
|---|---|
| SQLAlchemy model | `backend/app/models/habit.py` |
| Pydantic schema | `backend/app/schemas/habit.py` |
| FastAPI router | `backend/app/routers/habit.py` |
| Notification creation | `backend/app/services/notification_service.py` |
| Scheduler job | `backend/app/scheduler.py` |
| React Query fetch | `frontend/src/routes/Habits.tsx` |
| Right-side drawer form | Any component using `RightDrawer` in `frontend/src/components/ui/` |
| Dashboard card | `frontend/src/components/dashboard/DashHabitsCard.tsx` |
| API client function | `frontend/src/lib/api.ts` |
| Design tokens | `frontend/src/index.css` (`ink-*`, `accent` tokens) |

---

## Testing checklist per phase

**Phase 1:**
- [ ] `GET /api/v1/analytics/correlations?days=30` returns valid JSON with all fields
- [ ] `GET /api/v1/analytics/snapshots` returns array of daily rows
- [ ] `POST /api/v1/analytics/backfill` completes without error on cold DB
- [ ] Patterns page loads without crash when no data exists (shows empty states)
- [ ] Patterns page renders charts when 7+ days of data exist
- [ ] `_build_data_context` includes correlation section in AI chat context

**Phase 2:**
- [ ] Goal with `goal_type=habit_streak` shows correct progress % from live checkins
- [ ] Goal with `goal_type=finance_save` updates progress as transactions are added
- [ ] Overdue goal (past target_date, still active) shows `overdue: true`
- [ ] Deleting a linked habit doesn't crash the goals list (graceful degradation)
- [ ] Goals card on Dashboard appears only when ≥1 active goal exists
- [ ] RightDrawer opens for goal creation (not a modal)

**Phase 3:**
- [ ] `POST /api/v1/notifications/trigger/weekly-review` creates a notification
- [ ] Running trigger twice in same week returns `{"created": false, "reason": "..."}`
- [ ] Notification body renders with preserved newlines in NotificationPanel
- [ ] Setting `notif.weekly_review_enabled=false` suppresses the job

**Phase 4:**
- [ ] Morning briefing notification body includes "Pattern nudge:" section when correlation data is available
- [ ] "Pattern nudge:" is absent when fewer than 7 days of correlation data exist
- [ ] Refresh button in DashAIBriefing triggers new briefing correctly

**Phase 5:**
- [ ] `PUT /api/v1/health-log/2026-06-01` creates/updates without wiping unset fields
- [ ] Future date returns 422 with correct error message
- [ ] Quick-log auto-saves after 1 second of inactivity (debounced)
- [ ] Sleep vs mood correlation appears in `/api/v1/analytics/correlations` after 5+ health+journal days

---

_Generated: 2026-06-01. Supersedes the gap analysis in APP_REPORT.md for implementation purposes._
