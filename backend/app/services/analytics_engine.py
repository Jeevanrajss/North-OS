"""Cross-module analytics engine.

Computes per-day structured snapshots that correlate data across Journal,
Habits, and Finance. Results stored in AnalyticsSnapshot.

Mood score mapping:
  grateful, content, motivated, calm, focused, curious  → 3.5–4.5  (positive)
  tired, sad                                             → 2.0–2.5  (negative-light)
  anxious, drained, overwhelmed, angry                  → 1.0–1.5  (negative)
  Default for unknown codes                             → 3.0

Habit completion rate: habits_done / habits_scheduled for that day.
  - Daily habits are always scheduled.
  - Weekly habits: only scheduled on their configured weekdays.
  - Archived habits are excluded.
"""
from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

# Mood codes from the seed palette → numeric score (1.0–5.0)
MOOD_SCORE_MAP: dict[str, float] = {
    "grateful":    4.5,
    "content":     4.0,
    "motivated":   4.0,
    "calm":        3.5,
    "focused":     3.5,
    "curious":     3.5,
    "tired":       2.5,
    "sad":         2.0,
    "anxious":     1.5,
    "drained":     1.5,
    "overwhelmed": 1.0,
    "angry":       1.0,
    # Extended codes used in some installations
    "happy":    4.5, "excited":   4.5, "joyful":   4.5, "loved":  4.5, "hopeful": 4.0,
    "proud":    4.0, "okay":      3.0, "meh":      2.5, "bored":  2.0,
    "confused": 2.5, "stressed":  1.5, "low":      1.5, "lonely": 1.5,
    "frustrated": 1.5,
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
                continue  # not scheduled today
        scheduled += 1
        completed = h.id in checkin_ids
        detail[h.id] = completed
        if completed:
            done += 1

    return scheduled, done, detail


def compute_snapshot_for_date(db: Session, target: date, user_id: str = "") -> None:
    """
    Compute and upsert the analytics snapshot for `target`.
    Safe to call multiple times (upsert by computed_date).
    """
    from app.models.analytics import AnalyticsSnapshot
    from app.models.journal import JournalDay
    from app.models.finance import Transaction as TxnModel

    # ── Habits ──────────────────────────────────────────────────────────────
    scheduled, done, habit_detail = _habits_for_date(db, target)
    completion_rate = round(done / scheduled, 4) if scheduled > 0 else None

    # ── Journal ─────────────────────────────────────────────────────────────
    jday = db.query(JournalDay).filter(JournalDay.date == target).first()
    mood_score: float | None = None
    mood_codes_raw: list[str] = []
    journal_written = False
    journal_word_count = 0

    if jday:
        journal_written = bool(jday.entries)
        mood_codes_raw = list(jday.mood_codes or [])
        mood_score = _mood_score_from_codes(mood_codes_raw)
        for entry in (jday.entries or []):
            text = entry.content_text or ""
            journal_word_count += len(text.split())

    # ── Finance ─────────────────────────────────────────────────────────────
    txns = db.query(TxnModel).filter(TxnModel.date == target).all()
    daily_expense = sum(t.amount for t in txns if t.type == "expense") or None
    daily_income = sum(t.amount for t in txns if t.type == "income") or None
    cat_totals: dict[str, float] = {}
    for t in txns:
        if t.type == "expense":
            c = t.category or "Other"
            cat_totals[c] = cat_totals.get(c, 0) + t.amount

    # ── Health (Phase 5 — reads if table exists, graceful if not) ───────────
    sleep_hours: float | None = None
    energy_level: int | None = None
    exercise_minutes: int | None = None
    try:
        from app.models.health_log import HealthLog  # type: ignore
        hlog = db.query(HealthLog).filter(HealthLog.log_date == target).first()
        if hlog:
            sleep_hours = hlog.sleep_hours
            energy_level = hlog.energy_level
            exercise_minutes = hlog.exercise_minutes
    except Exception:
        pass  # Health module not yet installed

    # ── Upsert ──────────────────────────────────────────────────────────────
    existing = db.query(AnalyticsSnapshot).filter(
        AnalyticsSnapshot.computed_date == target
    ).first()

    snap = existing if existing else AnalyticsSnapshot(computed_date=target)
    if not existing:
        db.add(snap)

    snap.habit_completion_rate = completion_rate
    snap.mood_score = mood_score
    snap.daily_expense = daily_expense
    snap.daily_income = daily_income
    snap.habits_done_count = done if scheduled > 0 else None
    snap.habits_scheduled_count = scheduled if scheduled > 0 else None
    snap.journal_written = journal_written
    snap.journal_word_count = journal_word_count if journal_written else None
    snap.sleep_hours = sleep_hours
    snap.energy_level = energy_level
    snap.exercise_minutes = exercise_minutes
    snap.mood_codes_json = json.dumps(mood_codes_raw) if mood_codes_raw else None
    snap.expense_categories_json = json.dumps(cat_totals) if cat_totals else None
    snap.habit_detail_json = json.dumps(habit_detail) if habit_detail else None

    db.commit()
    log.debug("Analytics snapshot upserted for %s", target)


def backfill_snapshots(db: Session, days: int = 90) -> int:
    """
    Compute snapshots for the last `days` days.
    Always recomputes (upserts) so data stays fresh.
    Returns number of snapshots processed.
    """
    today = date.today()
    count = 0
    for i in range(days, -1, -1):  # oldest → newest
        try:
            compute_snapshot_for_date(db, today - timedelta(days=i))
            count += 1
        except Exception as e:
            log.warning("Snapshot failed for day -%d: %s", i, e)
    log.info("Analytics backfill complete: %d days processed", count)
    return count


def get_correlations(db: Session, days: int = 30) -> dict:
    """
    Compute cross-module correlations over the last `days` days.
    Returns a dict consumed by the analytics API and AI context builder.
    """
    from app.models.analytics import AnalyticsSnapshot

    today = date.today()
    cutoff = today - timedelta(days=days)
    snaps = (
        db.query(AnalyticsSnapshot)
        .filter(AnalyticsSnapshot.computed_date >= cutoff)
        .order_by(AnalyticsSnapshot.computed_date.asc())
        .all()
    )

    DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    result: dict = {
        "days_analysed": len(snaps),
        "mood_vs_habit_completion": None,
        "expense_vs_mood": None,
        "journal_habit_correlation": None,
        "sleep_vs_mood": None,
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

    paired  = [s for s in snaps if s.mood_score is not None and s.habit_completion_rate is not None]
    all_mood   = [s for s in snaps if s.mood_score is not None]
    all_habit  = [s for s in snaps if s.habit_completion_rate is not None]
    all_expense = [s for s in snaps if s.daily_expense is not None and s.mood_score is not None]

    if all_mood:
        result["avg_mood_score"] = round(sum(s.mood_score for s in all_mood) / len(all_mood), 2)
        result["low_mood_days"]  = sum(1 for s in all_mood if s.mood_score < 2.5)
        result["high_mood_days"] = sum(1 for s in all_mood if s.mood_score >= 3.5)

    if all_habit:
        result["avg_habit_completion"] = round(
            sum(s.habit_completion_rate for s in all_habit) / len(all_habit), 2
        )
        result["zero_habit_days"]    = sum(1 for s in all_habit if s.habit_completion_rate == 0)
        result["perfect_habit_days"] = sum(1 for s in all_habit if s.habit_completion_rate == 1.0)

    if all_expense:
        result["avg_daily_expense"] = round(
            sum(s.daily_expense for s in all_expense) / len(all_expense), 2
        )

    # Mood vs habit completion
    if paired:
        high_comp = [s.mood_score for s in paired if s.habit_completion_rate >= 0.75]
        low_comp  = [s.mood_score for s in paired if s.habit_completion_rate < 0.5]
        if high_comp and low_comp:
            result["mood_vs_habit_completion"] = {
                "mood_on_high_completion_days": round(sum(high_comp) / len(high_comp), 2),
                "mood_on_low_completion_days":  round(sum(low_comp)  / len(low_comp),  2),
                "delta": round(sum(high_comp)/len(high_comp) - sum(low_comp)/len(low_comp), 2),
                "sample_high": len(high_comp),
                "sample_low":  len(low_comp),
            }

    # Expense vs mood
    if all_expense:
        high_mood_exp = [s.daily_expense for s in all_expense if s.mood_score >= 3.5]
        low_mood_exp  = [s.daily_expense for s in all_expense if s.mood_score < 2.5]
        if high_mood_exp and low_mood_exp:
            result["expense_vs_mood"] = {
                "avg_spend_high_mood": round(sum(high_mood_exp) / len(high_mood_exp), 2),
                "avg_spend_low_mood":  round(sum(low_mood_exp)  / len(low_mood_exp),  2),
                "delta": round(
                    sum(low_mood_exp)/len(low_mood_exp) - sum(high_mood_exp)/len(high_mood_exp), 2
                ),
            }

    # Journal vs habits
    with_journal    = [s.habit_completion_rate for s in snaps
                       if s.journal_written and s.habit_completion_rate is not None]
    without_journal = [s.habit_completion_rate for s in snaps
                       if not s.journal_written and s.habit_completion_rate is not None]
    if with_journal and without_journal:
        result["journal_habit_correlation"] = {
            "habit_rate_with_journal":    round(sum(with_journal)    / len(with_journal),    2),
            "habit_rate_without_journal": round(sum(without_journal) / len(without_journal), 2),
            "delta": round(
                sum(with_journal)/len(with_journal) - sum(without_journal)/len(without_journal), 2
            ),
        }

    # Sleep vs mood (Phase 5 data — only computes when 5+ days available)
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

    # Best/worst day of week by habit completion
    dow_completion: dict[int, list[float]] = defaultdict(list)
    for s in all_habit:
        dow_completion[s.computed_date.weekday()].append(s.habit_completion_rate)

    if dow_completion:
        dow_avg = {d: sum(v) / len(v) for d, v in dow_completion.items()}
        best_dow  = max(dow_avg, key=lambda d: dow_avg[d])
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
