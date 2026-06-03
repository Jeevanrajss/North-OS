# North OS — Intelligence Layer Implementation Plan

> **📖 Reading order:** Read `APP_REPORT.md` first (orientation, decisions, current state) — then this file. Starting here without reading APP_REPORT.md first will miss critical architectural decisions and the list of what is already built.

**Vision:** Track Everything → Understand Patterns → Generate Insights → Improve Life  
**Status:** Phases 1–6 ✅ complete (committed to `main`). Phase 7 (Finance Intelligence Layer) is next.  
**This plan:** Phase-by-phase implementation spec — written as a Claude Code handoff. Each phase is self-contained and shippable independently.

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

## Phase 7 — Finance Intelligence Layer (Debt, Investments, Goals, Advisor)

**Vision:** Turn the Finance module from a cash-flow tracker into a full personal finance advisor. The user sees their complete financial picture — what they owe, what they're building, where they're going — and gets AI guidance on how to get there faster. No stock/investment recommendations. No buy/sell advice. Pure analysis of their own data.

**Design decisions locked:**
- EMI settlement: confirm-first, then auto-reduce outstanding balance
- SIP/investment: new `"investment"` transaction type, not an expense subcategory
- Savings: track actual amount invested only (not NAV/market value). Show note: "This is the amount you've put in, not current market value."
- Financial goals: dedicated `FinancialGoal` model, richer than Phase 2 Goals
- Debt payoff: recommend Avalanche + explain why, but let user reorder manually
- CC payment entries in import: pre-checked skip with explanation shown
- Unlinked EMI in import: flag it, tell user to add Debt record first (Option B inline creation is Phase 7.1 follow-up)
- Tax lines: auto-categorise as "Taxes & Fees" — no separate tax stat

**Build order within Phase 7:** Models → Transaction extensions → Import detector → Routers → Frontend tabs → Advisor → Settings

---

### 7.1 New database models

#### `Debt` model

**File:** `backend/app/models/debt.py`

```python
from __future__ import annotations
import json, uuid
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

    # Types: "home_loan" | "personal_loan" | "car_loan" | "two_wheeler_loan"
    #        | "education_loan" | "credit_card" | "no_cost_emi" | "other"
    debt_type: Mapped[str] = mapped_column(String(40), nullable=False, default="personal_loan")

    lender: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Last 4 digits of account/loan number — used to auto-match EMI rows in SMS and CC import
    account_last4: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Original sanctioned amount. User enters this when adding the loan.
    principal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Current outstanding balance. User enters the current value when adding.
    # Reduced automatically when an EMI payment is confirmed.
    outstanding: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Annual interest rate in %. Enter 0.0 for no-cost EMI.
    interest_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Fixed monthly EMI amount.
    emi_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Day of month when EMI is auto-debited (1–31). Used for EMI calendar.
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

#### `DebtPayment` model

**File:** `backend/app/models/debt_payment.py`

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
    """Records each EMI payment made against a Debt. Immutable after creation."""
    __tablename__ = "debt_payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    debt_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # FK to Transaction (nullable — manual payments may not have a transaction row)
    transaction_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    amount: Mapped[float] = mapped_column(Float, nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Snapshot of Debt.outstanding AFTER this payment was applied.
    outstanding_after: Mapped[float] = mapped_column(Float, nullable=False)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

#### `Investment` model

**File:** `backend/app/models/investment.py`

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

    # Types: "mutual_fund" | "fd" | "ppf" | "nps" | "gold" | "rd"
    #        | "savings_account" | "stocks" | "other"
    investment_type: Mapped[str] = mapped_column(String(40), nullable=False, default="mutual_fund")

    # Running total of all entries (denormalised for speed — recomputed on entry add/delete)
    total_invested: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # SIP configuration (nullable if lumpsum-only)
    sip_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    sip_date: Mapped[int | None] = mapped_column(Integer, nullable=True)  # day of month

    # Target corpus (user-set goal, optional)
    target_amount: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Linked financial goal (optional)
    goal_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Used for SMS/import auto-matching
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

#### `InvestmentEntry` model

**File:** `backend/app/models/investment_entry.py`

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

    # FK to Transaction (nullable — manual entries may not have a transaction row)
    transaction_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    amount: Mapped[float] = mapped_column(Float, nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # "sip" | "lumpsum" | "manual"
    entry_type: Mapped[str] = mapped_column(String(20), nullable=False, default="sip")

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

#### `FinancialGoal` model

**File:** `backend/app/models/financial_goal.py`

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
    """A personal financial target with a timeline and linked investments."""
    __tablename__ = "financial_goals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    emoji: Mapped[str] = mapped_column(String(10), nullable=False, default="🎯")

    # Types: "emergency_fund" | "purchase" | "education" | "retirement"
    #        | "travel" | "wedding" | "other"
    goal_type: Mapped[str] = mapped_column(String(40), nullable=False, default="purchase")

    # "short" = <1 year | "medium" = 1–5 years | "long" = >5 years
    timeline: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")

    target_amount: Mapped[float] = mapped_column(Float, nullable=False)

    # Manually updated OR auto-computed from linked investments (sum of their total_invested)
    current_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # 1=high | 2=medium | 3=low
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=2)

    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")

    # JSON array of Investment IDs linked to this goal e.g. '["uuid1", "uuid2"]'
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

**Register all five new models** in `backend/app/db.py` imports:
```python
from app.models.debt import Debt
from app.models.debt_payment import DebtPayment
from app.models.investment import Investment
from app.models.investment_entry import InvestmentEntry
from app.models.financial_goal import FinancialGoal
```

Auto-migration on startup will create all five tables.

---

### 7.2 Extend existing `Transaction` model

**File:** `backend/app/models/finance.py` — add three columns to `Transaction`:

```python
# Add after the existing `notes` field:

# GST / tax component extracted from CC statement import.
# Stored separately from amount so spending analytics exclude taxes.
tax_amount: Mapped[float | None] = mapped_column(Float, nullable=True)

# Set when this transaction is an EMI payment linked to a Debt record.
# On confirm: DebtPayment is created and Debt.outstanding is reduced.
debt_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

# Set when this transaction is a SIP/investment linked to an Investment record.
# On confirm: InvestmentEntry is created and Investment.total_invested is updated.
investment_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
```

**`type` field validation** — `"investment"` is now a valid 4th type. Update validation everywhere `type` is validated (schemas, frontend dropdowns) to accept `"income" | "expense" | "transfer" | "investment"`.

---

### 7.3 Detection service for CC/bank import

**File:** `backend/app/services/import_detector.py` (new file)

```python
"""
Import detection layer.

Runs after CSV parsing, before AI categorisation.
Classifies each row as: normal_expense | emi | tax_fee | cc_payment

Called by import_router.py preview endpoint.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# ── Pattern banks ─────────────────────────────────────────────────────────────

EMI_PATTERNS = [
    r'\bEMI\b',
    r'\bE\.M\.I\b',
    r'EMI\s*NO[\.\s]*\d+',
    r'INST(?:ALMENT|ALLMENT)\s*NO[\.\s]*\d+',
    r'INSTALMENT\s*\d+\s*OF\s*\d+',
    r'EMI\s*\d+\s*(?:OF|/)\s*\d+',
    r'LOAN.*EMI|EMI.*LOAN',
    r'HOME\s*LOAN\s*EMI',
    r'CAR\s*LOAN\s*EMI',
    r'AUTO\s*DEBIT.*(?:EMI|LOAN)',
    r'(?:BAJAJ|HDFC|ICICI|AXIS|SBI|IDFC)\s*(?:BANK\s*)?EMI',
    r'NO\s*COST\s*EMI',
    r'ZERO\s*COST\s*EMI',
]

TAX_FEE_PATTERNS = [
    r'\bIGST\b',
    r'\bSGST\b',
    r'\bCGST\b',
    r'GST\s*ON\b',
    r'GST\s*CHARGES',
    r'SERVICE\s*TAX',
    r'LATE\s*(?:PAYMENT\s*)?FEE',
    r'ANNUAL\s*(?:MEMBERSHIP\s*)?FEE',
    r'RENEWAL\s*FEE',
    r'FINANCE\s*CHARGES',
    r'INTEREST\s*CHARGES',
    r'OVERLIMIT\s*(?:FEE)?',
    r'RETURNED\s*(?:CHEQUE|PAYMENT)\s*(?:CHARGES|FEE)',
    r'CASH\s*ADVANCE\s*(?:CHARGES|FEE)',
    r'REWARD\s*REDEMPTION\s*FEE',
]

CC_PAYMENT_PATTERNS = [
    r'PAYMENT\s*RECEIVED',
    r'PAYMENT.*THANK\s*YOU',
    r'THANK\s*YOU.*PAYMENT',
    r'NEFT\s*(?:CR|CREDIT)',
    r'IMPS\s*(?:CR|CREDIT)',
    r'UPI\s*(?:CR|CREDIT)',
    r'PAYMENT\s*BY\s*(?:NET|NETBANKING|MOBILE|CUSTOMER)',
    r'CREDIT\s*ADJUSTMENT',
    r'PAYMENT\s*CREDITED',
    r'BILL\s*PAYMENT\s*CREDITED',
]


@dataclass
class DetectionResult:
    row_type: str           # "normal" | "emi" | "tax_fee" | "cc_payment"
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
    Classify a single parsed import row.

    Rules applied in order (first match wins):
    1. CC payment: tx_type=income AND matches CC_PAYMENT_PATTERNS → skip by default
    2. Tax/fee: tx_type=expense AND matches TAX_FEE_PATTERNS → auto-categorise
    3. EMI: tx_type=expense AND matches EMI_PATTERNS → flag, try to match Debt
    4. Normal: everything else
    """
    desc_upper = description.upper().strip()

    # ── 1. CC payment ─────────────────────────────────────────────────────────
    if tx_type == "income" and any(re.search(p, desc_upper) for p in CC_PAYMENT_PATTERNS):
        return DetectionResult(
            row_type="cc_payment",
            is_emi=False, is_tax_fee=False, is_cc_payment=True,
            suggested_debt_id=None, suggested_debt_name=None,
            installment_info=None,
            skip_by_default=True,
            skip_reason=(
                "This appears to be a CC bill payment already captured "
                "in your bank statement — importing it here would double-count it."
            ),
        )

    # ── 2. Tax / fee line ─────────────────────────────────────────────────────
    if tx_type == "expense" and any(re.search(p, desc_upper) for p in TAX_FEE_PATTERNS):
        return DetectionResult(
            row_type="tax_fee",
            is_emi=False, is_tax_fee=True, is_cc_payment=False,
            suggested_debt_id=None, suggested_debt_name=None,
            installment_info=None,
            skip_by_default=False,
            skip_reason=None,
        )

    # ── 3. EMI ────────────────────────────────────────────────────────────────
    if tx_type == "expense" and any(re.search(p, desc_upper) for p in EMI_PATTERNS):
        # Extract instalment position e.g. "3 of 12"
        installment_info = None
        m = re.search(r'(\d+)\s*(?:OF|/)\s*(\d+)', desc_upper)
        if m:
            installment_info = f"{m.group(1)} of {m.group(2)}"

        # Auto-match to a Debt record
        suggested_debt_id = None
        suggested_debt_name = None

        for debt in active_debts:
            # Priority 1: account_last4 appears in description
            if debt.account_last4 and debt.account_last4 in desc_upper:
                suggested_debt_id = debt.id
                suggested_debt_name = debt.name
                break

        if not suggested_debt_id:
            for debt in active_debts:
                # Priority 2: EMI amount within ±5% tolerance
                if debt.emi_amount and debt.emi_amount > 0:
                    if abs(debt.emi_amount - amount) / debt.emi_amount <= 0.05:
                        suggested_debt_id = debt.id
                        suggested_debt_name = debt.name
                        break

        if not suggested_debt_id:
            for debt in active_debts:
                # Priority 3: first word of lender name in description
                if debt.lender:
                    first_word = debt.lender.upper().split()[0]
                    if len(first_word) >= 4 and first_word in desc_upper:
                        suggested_debt_id = debt.id
                        suggested_debt_name = debt.name
                        break

        return DetectionResult(
            row_type="emi",
            is_emi=True, is_tax_fee=False, is_cc_payment=False,
            suggested_debt_id=suggested_debt_id,
            suggested_debt_name=suggested_debt_name,
            installment_info=installment_info,
            skip_by_default=False,
            skip_reason=None,
        )

    # ── 4. Normal ─────────────────────────────────────────────────────────────
    return DetectionResult(
        row_type="normal",
        is_emi=False, is_tax_fee=False, is_cc_payment=False,
        suggested_debt_id=None, suggested_debt_name=None,
        installment_info=None,
        skip_by_default=False,
        skip_reason=None,
    )
```

---

### 7.4 Extend import schema

**File:** `backend/app/schemas/import_schema.py`

Add new fields to existing classes:

```python
class ImportPreviewRow(BaseModel):
    # --- existing fields (unchanged) ---
    row_index: int
    date: str
    description: str
    amount: float
    tx_type: str
    suggested_category: str
    is_duplicate: bool
    duplicate_txn_id: str | None

    # --- NEW fields ---
    is_emi: bool = False
    is_tax_fee: bool = False
    is_cc_payment: bool = False
    suggested_debt_id: str | None = None
    suggested_debt_name: str | None = None   # display label for loan dropdown
    installment_info: str | None = None      # "3 of 12"
    skip_by_default: bool = False
    skip_reason: str | None = None           # shown to user when skip_by_default=True


class ConfirmRow(BaseModel):
    # --- existing fields (unchanged) ---
    row_index: int
    date: str
    description: str
    amount: float
    tx_type: str
    category: str
    notes: str | None = None
    include: bool = True

    # --- NEW fields ---
    debt_id: str | None = None         # user selected loan to link (for EMI rows)
    tax_amount: float | None = None    # user-confirmed tax portion (for tax_fee rows)
```

---

### 7.5 Wire detection into import preview endpoint

**File:** `backend/app/routers/import_router.py`

In the preview endpoint, after parsing rows and before AI categorisation, add:

```python
# Load active debts for EMI matching
from app.models.debt import Debt as DebtModel
from app.services.import_detector import detect_row

active_debts = db.query(DebtModel).filter(
    DebtModel.status == "active"
).all()

for row in parsed_rows:
    detection = detect_row(
        description=row["description"],
        amount=row["amount"],
        tx_type=row["tx_type"],
        active_debts=active_debts,
    )
    row["is_emi"] = detection.is_emi
    row["is_tax_fee"] = detection.is_tax_fee
    row["is_cc_payment"] = detection.is_cc_payment
    row["suggested_debt_id"] = detection.suggested_debt_id
    row["suggested_debt_name"] = detection.suggested_debt_name
    row["installment_info"] = detection.installment_info
    row["skip_by_default"] = detection.skip_by_default
    row["skip_reason"] = detection.skip_reason

    # Tax fee rows: skip AI categorisation, assign directly
    if detection.is_tax_fee:
        row["suggested_category"] = "Taxes & Fees"
        row["skip_ai"] = True

    # CC payment rows: skip AI categorisation, mark to skip
    if detection.is_cc_payment:
        row["suggested_category"] = "CC Payment"
        row["include"] = False
        row["skip_ai"] = True
```

**In the confirm endpoint**, handle debt-linked rows:

```python
from app.models.debt import Debt as DebtModel
from app.models.debt_payment import DebtPayment

for confirm_row in req.rows:
    if not confirm_row.include:
        skipped += 1
        continue

    # Build base transaction
    t = Transaction(
        type=confirm_row.tx_type,
        amount=confirm_row.amount,
        date=confirm_row.date,
        category=confirm_row.category,
        account=req.account_name,
        notes=confirm_row.notes,
        tax_amount=confirm_row.tax_amount,
        debt_id=confirm_row.debt_id,
    )
    db.add(t)
    db.flush()  # get t.id before commit

    # If EMI linked to a debt → create DebtPayment + reduce outstanding
    if confirm_row.debt_id:
        debt = db.get(DebtModel, confirm_row.debt_id)
        if debt and debt.status == "active":
            outstanding_after = max(0.0, debt.outstanding - confirm_row.amount)

            payment = DebtPayment(
                debt_id=debt.id,
                transaction_id=t.id,
                amount=confirm_row.amount,
                payment_date=confirm_row.date,
                outstanding_after=outstanding_after,
            )
            db.add(payment)

            debt.outstanding = outstanding_after
            # Auto-close if fully paid
            if outstanding_after == 0.0:
                debt.status = "closed"

    imported += 1

db.commit()
```

**Edge cases:**
- If `debt_id` is set but the Debt record no longer exists (deleted between preview and confirm): skip the DebtPayment creation silently, still create the Transaction. Log a warning.
- If `debt.outstanding` would go below 0 after payment: clamp to 0.0, set `debt.status = "closed"`.
- If `confirm_row.amount` is larger than `debt.emi_amount` by more than 20%: still process, but note it may be a pre-payment. No special handling needed.

---

### 7.6 Routers

#### Debt router

**File:** `backend/app/routers/debt.py`

```
GET    /api/v1/finance/debt                     list active debts
POST   /api/v1/finance/debt                     create debt
GET    /api/v1/finance/debt/{id}                get one + payment history
PATCH  /api/v1/finance/debt/{id}                partial update
DELETE /api/v1/finance/debt/{id}                soft-close (status=closed)

POST   /api/v1/finance/debt/{id}/payment        manual EMI payment (no CC import)
GET    /api/v1/finance/debt/{id}/payments       list payment history

GET    /api/v1/finance/debt/summary             totals + payoff projections
GET    /api/v1/finance/debt/payoff-strategy     avalanche vs snowball comparison
```

**`POST /debt/{id}/payment` — manual payment flow:**

Body: `{ amount: float, payment_date: date, notes: str | None }`

Logic:
1. Validate debt exists and status == "active"
2. Create Transaction (type="expense", category="EMI/Loan", account=debt.lender, debt_id=debt.id)
3. Create DebtPayment (same outstanding_after logic as import confirm)
4. Reduce Debt.outstanding
5. Auto-close if outstanding reaches 0

**`GET /debt/payoff-strategy` — computation:**

```python
import math

def _months_to_payoff(outstanding: float, emi: float, annual_rate: float) -> int:
    """Using reducing balance formula. Returns 0 if already paid."""
    if outstanding <= 0:
        return 0
    if annual_rate == 0.0 or emi <= 0:
        return math.ceil(outstanding / emi) if emi > 0 else 999
    r = annual_rate / 12 / 100
    if emi <= outstanding * r:
        return 999  # EMI doesn't cover interest — loan never ends
    try:
        months = -math.log(1 - (outstanding * r) / emi) / math.log(1 + r)
        return math.ceil(months)
    except (ValueError, ZeroDivisionError):
        return 999

def _total_interest(outstanding: float, emi: float, months: int) -> float:
    return max(0.0, round(emi * months - outstanding, 2))
```

Response shape:
```json
{
  "avalanche": [
    {
      "priority": 1,
      "debt_id": "...",
      "name": "HDFC Personal Loan",
      "outstanding": 85000,
      "interest_rate": 18.5,
      "emi_amount": 3200,
      "months_to_payoff": 34,
      "total_interest_remaining": 23800,
      "why_first": "Highest interest rate — paying this first saves the most money."
    }
  ],
  "snowball": [
    {
      "priority": 1,
      "debt_id": "...",
      "name": "Amazon No-Cost EMI",
      "outstanding": 12000,
      "interest_rate": 0.0,
      "emi_amount": 2000,
      "months_to_payoff": 6,
      "why_first": "Smallest balance — eliminates one obligation fastest."
    }
  ],
  "summary": {
    "total_outstanding": 182000,
    "total_emi_monthly": 12400,
    "avalanche_total_interest": 31200,
    "snowball_total_interest": 34800,
    "interest_saved_by_avalanche": 3600,
    "recommendation": "avalanche",
    "recommendation_reason": "Following avalanche order saves you ₹3,600 in interest over the life of your loans."
  }
}
```

#### Investments router

**File:** `backend/app/routers/investments.py`

```
GET    /api/v1/finance/investments                  list all investments
POST   /api/v1/finance/investments                  create
PATCH  /api/v1/finance/investments/{id}             update
DELETE /api/v1/finance/investments/{id}             soft-delete (status=redeemed)

POST   /api/v1/finance/investments/{id}/entry       add investment entry (manual or SIP)
GET    /api/v1/finance/investments/{id}/entries     list entries

GET    /api/v1/finance/investments/summary          total invested, by type, recent SIPs
```

**`POST /investments/{id}/entry` logic:**
1. Create InvestmentEntry row
2. Create Transaction (type="investment", category=investment.investment_type, investment_id=investment.id)
3. Update Investment.total_invested += entry.amount
4. If linked to a FinancialGoal, recompute goal.current_amount (sum of linked investments' total_invested)

**Summary response:**
```json
{
  "total_invested": 420000,
  "by_type": {
    "mutual_fund": 300000,
    "fd": 100000,
    "ppf": 20000
  },
  "sip_this_month": 30000,
  "investments": [...]
}
```

#### Financial goals router

**File:** `backend/app/routers/financial_goals.py`

```
GET    /api/v1/finance/goals                  list all + computed progress
POST   /api/v1/finance/goals                  create
PATCH  /api/v1/finance/goals/{id}             update (inc. manually setting current_amount)
DELETE /api/v1/finance/goals/{id}             soft-archive (status=paused)
POST   /api/v1/finance/goals/{id}/achieve     mark achieved
```

**Progress computation (in list endpoint):**
For each goal, `current_amount` is computed as:
- If `linked_investment_ids` is non-empty: sum of `Investment.total_invested` for all linked investments
- Else: use `goal.current_amount` as-is (manual)

**Response includes computed fields:**
```json
{
  "id": "...",
  "title": "House Down Payment",
  "target_amount": 2000000,
  "current_amount": 420000,
  "progress_pct": 21.0,
  "target_date": "2027-12-31",
  "days_remaining": 576,
  "monthly_needed": 59700,
  "timeline": "medium",
  "is_on_track": false
}
```

`monthly_needed` = `(target_amount - current_amount) / months_remaining`. If negative (already achieved): 0.
`is_on_track` = current savings rate (from investments this month) >= monthly_needed.

**Register all three routers in `backend/app/main.py`:**
```python
from app.routers.debt import router as debt_router
from app.routers.investments import router as investments_router
from app.routers.financial_goals import router as financial_goals_router

app.include_router(debt_router)
app.include_router(investments_router)
app.include_router(financial_goals_router)
```

---

### 7.7 Finance Advisor AI

**File:** `backend/app/routers/finance_advisor.py`

```
POST   /api/v1/finance/advisor     generate full AI advice
```

**Context builder for advisor:**

```python
async def _build_finance_context(db: Session) -> str:
    from datetime import date, timedelta
    from sqlalchemy import extract
    from app.models.finance import Transaction
    from app.models.debt import Debt
    from app.models.investment import Investment
    from app.models.financial_goal import FinancialGoal

    today = date.today()
    lines = [f"Finance analysis as of {today.isoformat()}"]

    # ── Income & expenses: last 3 months ──────────────────────────────────────
    three_months_ago = today.replace(day=1) - timedelta(days=1)
    three_months_ago = three_months_ago.replace(day=1) - timedelta(days=1)
    three_months_ago = three_months_ago.replace(day=1)  # first day of 3 months ago

    txns = db.query(Transaction).filter(Transaction.date >= three_months_ago).all()
    income_txns = [t for t in txns if t.type == "income"]
    expense_txns = [t for t in txns if t.type == "expense"]
    investment_txns = [t for t in txns if t.type == "investment"]

    avg_income = sum(t.amount for t in income_txns) / 3
    avg_expense = sum(t.amount for t in expense_txns) / 3
    avg_investment = sum(t.amount for t in investment_txns) / 3

    lines.append(f"\n## Cash flow (3-month average)")
    lines.append(f"Average monthly income: {avg_income:.0f}")
    lines.append(f"Average monthly expenses: {avg_expense:.0f}")
    lines.append(f"Average monthly investments/SIPs: {avg_investment:.0f}")
    lines.append(f"Real disposable (income - expenses - investments): {avg_income - avg_expense - avg_investment:.0f}")

    # Category breakdown
    cat_totals: dict[str, float] = {}
    for t in expense_txns:
        c = t.category or "Other"
        cat_totals[c] = cat_totals.get(c, 0) + t.amount / 3  # monthly average
    top_cats = sorted(cat_totals.items(), key=lambda x: -x[1])[:8]
    lines.append("Top expense categories (monthly avg): " + ", ".join(f"{c}: {v:.0f}" for c, v in top_cats))

    # ── Debts ─────────────────────────────────────────────────────────────────
    debts = db.query(Debt).filter(Debt.status == "active").all()
    if debts:
        total_outstanding = sum(d.outstanding for d in debts)
        total_emi = sum(d.emi_amount for d in debts)
        lines.append(f"\n## Active debts ({len(debts)} loans)")
        lines.append(f"Total outstanding: {total_outstanding:.0f}")
        lines.append(f"Total monthly EMI commitment: {total_emi:.0f}")
        for d in sorted(debts, key=lambda x: -x.interest_rate):
            lines.append(
                f"- {d.name}: outstanding={d.outstanding:.0f}, "
                f"EMI={d.emi_amount:.0f}/mo, rate={d.interest_rate}% p.a."
            )

    # ── Investments ───────────────────────────────────────────────────────────
    investments = db.query(Investment).filter(Investment.status == "active").all()
    if investments:
        total_invested = sum(i.total_invested for i in investments)
        monthly_sip = sum((i.sip_amount or 0) for i in investments)
        lines.append(f"\n## Investments ({len(investments)} instruments)")
        lines.append(f"Total invested: {total_invested:.0f}")
        lines.append(f"Monthly SIP commitment: {monthly_sip:.0f}")
        for inv in investments:
            lines.append(f"- {inv.name} ({inv.investment_type}): invested={inv.total_invested:.0f}")

    # ── Financial goals ───────────────────────────────────────────────────────
    goals = db.query(FinancialGoal).filter(FinancialGoal.status == "active").all()
    if goals:
        lines.append(f"\n## Financial goals ({len(goals)} active)")
        for g in sorted(goals, key=lambda x: x.priority):
            progress = g.current_amount / g.target_amount * 100 if g.target_amount > 0 else 0
            deadline = f", deadline: {g.target_date}" if g.target_date else ""
            lines.append(
                f"- {g.title} ({g.timeline} term{deadline}): "
                f"target={g.target_amount:.0f}, saved={g.current_amount:.0f} ({progress:.0f}%)"
            )

    return "\n".join(lines)
```

**Advisor system prompt:**

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
[Income minus expenses minus EMIs minus SIPs = actual free cash. 1 sentence with the number. Flag if it's negative.]

📊 Spending to watch:
[Top 2-3 expense categories that are high relative to income. Be specific — name the category, the amount, and what reducing by ₹X would achieve. Max 4 sentences.]

💳 Debt priority (avalanche recommended):
[Rank their debts by interest rate, highest first. For each, say why it costs the most. Explain avalanche vs snowball in 1 sentence. Let them choose — don't be prescriptive.]

🎯 Goal check:
[For each active financial goal, say whether current savings pace will hit it on time. If not, say the monthly gap in ₹. Max 3 sentences total.]

⚡ One action this week:
[Single most impactful thing they can do this week. Specific and actionable. Not an investment recommendation.]

Keep the entire response under 250 words. Use actual numbers from the data. Do not fabricate. If data is missing for a section, skip that section.
"""
```

**Endpoint:**

```python
@router.post("/advisor")
async def finance_advisor(db: Session = Depends(get_db)):
    from app.services.llm_client import generate as llm_generate, LLMError

    context = await _build_finance_context(db)

    try:
        response = await llm_generate(
            context,
            purpose="insights",
            system=ADVISOR_SYSTEM,
            temperature=0.4,
            max_tokens=600,
        )
    except LLMError as e:
        raise HTTPException(status_code=503, detail=f"AI unavailable: {e}")

    return {"advice": response, "generated_at": date.today().isoformat()}
```

**Scheduled advisor** (when user enables it):

Add to `scheduler.py`:
```python
def _run_finance_advisor() -> None:
    """Weekly (Sunday) or monthly (1st) — controlled by setting finance.advisor_schedule."""
    import asyncio
    from app.db import SessionLocal
    from app.models.setting import Setting

    with SessionLocal() as db:
        s = db.query(Setting).filter(Setting.key == "finance.advisor_schedule").first()
        schedule = s.value if s else "manual"
        if schedule == "manual":
            return

    async def _inner():
        from app.routers.finance_advisor import _build_finance_context, ADVISOR_SYSTEM
        from app.services.llm_client import generate as llm_generate, LLMError
        from app.services.notification_service import create_notification

        with SessionLocal() as db:
            context = await _build_finance_context(db)
            try:
                response = await llm_generate(
                    context, purpose="insights", system=ADVISOR_SYSTEM,
                    temperature=0.4, max_tokens=600,
                )
            except LLMError:
                return

            if response:
                create_notification(
                    db=db,
                    type="finance_advisor",
                    title="Your finance check-in",
                    body=response.strip(),
                    skip_quiet=True,
                )

    try:
        asyncio.run(_inner())
    except Exception as e:
        log.warning("Finance advisor job failed: %s", e)
```

Add two scheduler jobs in `start_scheduler()`:
```python
# Weekly advisor (Sunday 10:00)
_scheduler.add_job(
    _run_finance_advisor,
    CronTrigger(day_of_week="sun", hour=10, minute=0),
    id="finance_advisor_weekly", replace_existing=True,
)
# Monthly advisor (1st of month 10:00) — APScheduler runs whichever fires
_scheduler.add_job(
    _run_finance_advisor,
    CronTrigger(day=1, hour=10, minute=0),
    id="finance_advisor_monthly", replace_existing=True,
)
```

Note: both jobs call the same function which reads `finance.advisor_schedule` setting. If set to "weekly", Sunday fires and runs. Monday–Saturday fire but the function returns immediately. If "monthly", only the 1st job runs.

Add trigger endpoint in `notifications.py`:
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

### 7.8 Frontend — Finance module tab structure

The Finance page (`frontend/src/routes/Finance.tsx`) currently shows a single view. Restructure into 5 tabs using the existing tab pattern from other pages.

**Tab order:** Overview | Budget | Debt & EMI | My Wealth | Advisor

**Tab 1 — Overview** (existing content, no change)
- `TransactionList.tsx`
- `MonthlyReportView.tsx`
- `CategoryBreakdownCard.tsx`
- `SmsInbox.tsx`

**Tab 2 — Budget** (existing content, no change)
- `BudgetCard.tsx`

**Tab 3 — Debt & EMI** (new)

Components in `frontend/src/components/finance/debt/`:

`DebtCard.tsx` — one card per loan:
- Emoji + name + lender
- Outstanding amount (large, prominent)
- Interest rate badge (red for >15%, amber for 5-15%, green for 0%)
- Progress bar: `(principal - outstanding) / principal * 100`
- EMI amount + next due date chip (red if due within 3 days, amber if within 7)
- Overflow menu: Edit, Record Payment, Mark as Closed

`PayoffStrategyCard.tsx`:
- Shows recommended order (avalanche, sorted by interest rate)
- Each debt ranked 1, 2, 3... with interest rate shown
- "Saving ₹X by following this order vs paying smallest first"
- Small toggle: "Show Snowball comparison" → reveals snowball order alongside
- Explanation: "Avalanche: pay highest interest first — mathematically saves the most. Snowball: pay smallest balance first — faster psychological wins."
- User can drag to reorder (optional in v1, fine to skip)

`DebtSummaryBar.tsx` — top of tab:
- Total outstanding | Total EMI/month | Debts remaining count

`RecordPaymentDrawer.tsx` — opened via RightDrawer:
- Select debt (dropdown)
- Amount (pre-filled with EMI amount)
- Date (default today)
- Notes
- Confirm → `POST /api/v1/finance/debt/{id}/payment`

**Tab 4 — My Wealth** (new)

Components in `frontend/src/components/finance/wealth/`:

`WealthSummaryBar.tsx` — top of tab:
- In-hand this month: `income - expenses - EMIs - SIPs` (current month)
- Total invested (lifetime)
- Active SIP / month

`InvestmentCard.tsx` — one card per investment:
- Emoji + name + type badge
- Total invested (large)
- Progress bar toward target (if target set)
- `sip_amount/month` chip if SIP-based
- Overflow: Edit, Add Entry, Mark as Redeemed

`InvestmentNote.tsx` — persistent banner at top of investments list:
> "Amounts shown are what you've put in, not current market value. Check your brokerage or investment app for NAV-based returns."

`FinancialGoalCard.tsx` — one card per goal:
- Emoji + title + timeline badge (short=blue, medium=amber, long=green)
- Progress bar: current / target
- `₹X of ₹Y saved` label
- Days remaining chip
- `on track` / `behind` badge computed from `is_on_track`
- Overflow: Edit, Mark as Achieved

`AddInvestmentEntryDrawer.tsx` — add SIP / lumpsum manually:
- Select investment
- Amount
- Date
- Type: SIP / Lumpsum / Manual
- Confirm → `POST /api/v1/finance/investments/{id}/entry`

**Tab 5 — Advisor** (upgrade of existing `FinanceInsightsCard.tsx`)

Replace the existing card with a full tab:
- "Generate analysis" button → calls `POST /api/v1/finance/advisor`
- Renders AI response with preserved newlines (`whitespace-pre-wrap`)
- Shows `generated_at` date at bottom
- Schedule setting inline: "Auto-run: Off / Weekly / Monthly" → saves to `finance.advisor_schedule`
- Manual trigger: "Run now" button → `POST /api/v1/notifications/trigger/finance-advisor`

**Notification rendering for `type="finance_advisor"`:**
Same as `weekly_review` — render body with `whitespace-pre-wrap` in `NotificationPanel.tsx`.

---

### 7.9 Import review UI upgrades

**File:** `frontend/src/components/finance/ImportModal.tsx`

In the row review table, add conditional rendering based on new fields:

**EMI rows** (`is_emi=true`):
- Show orange "EMI" badge on the row
- Show installment info chip if available ("Instalment 3 of 12")
- Show loan dropdown: pre-selected to `suggested_debt_name` if matched
- If no debt matched: show amber warning "⚠️ No matching loan found — add this loan in the Debt & EMI tab first, then re-import"
- Dropdown fetches `GET /api/v1/finance/debt` and shows all active debts by name

**CC payment rows** (`is_cc_payment=true`):
- Pre-check the Skip checkbox
- Show info tooltip/badge: "This appears to be a CC bill payment already captured in your bank statement — importing it here would double-count it."
- User can un-skip if they want (override is allowed)

**Tax/fee rows** (`is_tax_fee=true`):
- Show "Taxes & Fees" pre-assigned in category column (non-editable or editable with note)
- No debt dropdown

---

### 7.10 Settings additions

**File:** `frontend/src/routes/Settings.tsx`

In the Finance section (create if doesn't exist, else add to existing):

```
Finance Advisor schedule
  [ Off ]  [ Weekly (Sunday) ]  [ Monthly (1st) ]
```

Key: `finance.advisor_schedule` — values: `"manual"` | `"weekly"` | `"monthly"`, default: `"manual"`

Add to `api.ts`:
```typescript
finance: {
  // ... existing
  debt: {
    list: () => fetch('/api/v1/finance/debt').then(r => r.json()),
    create: (body) => fetch('/api/v1/finance/debt', { method: 'POST', ... }).then(r => r.json()),
    update: (id, body) => fetch(`/api/v1/finance/debt/${id}`, { method: 'PATCH', ... }).then(r => r.json()),
    delete: (id) => fetch(`/api/v1/finance/debt/${id}`, { method: 'DELETE' }).then(r => r.json()),
    payment: (id, body) => fetch(`/api/v1/finance/debt/${id}/payment`, { method: 'POST', ... }).then(r => r.json()),
    summary: () => fetch('/api/v1/finance/debt/summary').then(r => r.json()),
    payoffStrategy: () => fetch('/api/v1/finance/debt/payoff-strategy').then(r => r.json()),
  },
  investments: {
    list: () => fetch('/api/v1/finance/investments').then(r => r.json()),
    create: (body) => fetch('/api/v1/finance/investments', { method: 'POST', ... }).then(r => r.json()),
    addEntry: (id, body) => fetch(`/api/v1/finance/investments/${id}/entry`, { method: 'POST', ... }).then(r => r.json()),
    summary: () => fetch('/api/v1/finance/investments/summary').then(r => r.json()),
  },
  goals: {
    list: () => fetch('/api/v1/finance/goals').then(r => r.json()),
    create: (body) => fetch('/api/v1/finance/goals', { method: 'POST', ... }).then(r => r.json()),
    update: (id, body) => fetch(`/api/v1/finance/goals/${id}`, { method: 'PATCH', ... }).then(r => r.json()),
    achieve: (id) => fetch(`/api/v1/finance/goals/${id}/achieve`, { method: 'POST' }).then(r => r.json()),
  },
  advisor: {
    generate: () => fetch('/api/v1/finance/advisor', { method: 'POST' }).then(r => r.json()),
  },
}
```

---

### 7.11 Dashboard — Finance card upgrade

**File:** `frontend/src/components/dashboard/DashFinanceCard.tsx`

Add below the existing income/expense summary:
- Total outstanding debt (if any active debts) — shown in amber
- Next EMI due (soonest upcoming, with days remaining) — shown in red if ≤3 days
- Total SIP this month — shown in blue
- Link to Finance → Debt & EMI tab

---

### 7.12 Testing checklist — Phase 7

**Models:**
- [ ] All 5 new tables created on clean DB startup
- [ ] Transaction.tax_amount, debt_id, investment_id columns created
- [ ] Transaction type "investment" accepted by API

**Import detection:**
- [ ] CC statement with "EMI NO 3 OF 12 - LAPTOP" flagged as `is_emi=true`
- [ ] "PAYMENT RECEIVED - THANK YOU" flagged as `is_cc_payment=true`, `skip_by_default=true`
- [ ] "IGST ON FINANCE CHARGES" flagged as `is_tax_fee=true`, category="Taxes & Fees"
- [ ] Regular "SWIGGY" row unaffected — `is_emi=false`, `is_tax_fee=false`
- [ ] EMI row auto-matched to Debt when account_last4 in description
- [ ] EMI row auto-matched to Debt when amount within ±5% of emi_amount
- [ ] Unmatched EMI shows amber warning in import UI (no crash)

**Debt:**
- [ ] `POST /finance/debt/{id}/payment` reduces outstanding correctly
- [ ] Outstanding reaching 0 auto-sets status="closed"
- [ ] Payoff strategy returns avalanche sorted by interest_rate DESC
- [ ] No-cost EMI (rate=0%) shows months = ceil(outstanding / emi)
- [ ] `months_to_payoff=999` returned when EMI < monthly interest (loan never ends)
- [ ] CC import confirm with debt_id creates DebtPayment + reduces outstanding

**Investments:**
- [ ] `POST /investments/{id}/entry` increments total_invested correctly
- [ ] Investment with goal_id link: goal.current_amount auto-updated
- [ ] Investment note banner visible in My Wealth tab

**Financial goals:**
- [ ] `monthly_needed` correctly computed from target_amount, current_amount, months_remaining
- [ ] `is_on_track` correctly compares monthly_needed vs actual SIP this month
- [ ] Linked investments auto-update goal.current_amount on new entry

**Advisor:**
- [ ] `POST /finance/advisor` returns structured advice with all 5 sections
- [ ] Advice contains no stock/investment/buy/sell recommendations (manual review)
- [ ] `POST /notifications/trigger/finance-advisor` creates notification
- [ ] Notification renders with whitespace-pre-wrap in NotificationPanel
- [ ] Setting finance.advisor_schedule="weekly" causes Sunday job to run
- [ ] Setting finance.advisor_schedule="manual" suppresses scheduler jobs

---

_Phase 7 added: 2026-06-03. Previous phases unchanged._
