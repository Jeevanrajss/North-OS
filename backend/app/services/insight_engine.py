"""Rule-based daily insight generator (Phase 11b).

No AI required — pure data analysis over existing transactions, habits,
budgets, and goals. This is Tier 1 (always works, even when the desktop/
LM Studio is off); Tier 2 (LM Studio narrative briefing) is the existing
`/notifications/?type=morning_briefing` flow on the dashboard, unchanged.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.budget import Budget
from app.models.finance import Transaction
from app.models.goal import Goal
from app.models.habit import Habit, HabitCheckin

_MILESTONES = [7, 14, 21, 30, 60, 90]


class InsightEngine:
    """Generates one rule-based insight per call — the highest-priority
    observation found, or a sensible default if nothing stands out."""

    def generate_daily_insight(self, user_id: str, db: Session) -> dict:
        for fn in (
            self._streak_milestone,
            self._habit_spend_correlation,
            self._category_spend_change,
            self._goal_progress,
        ):
            insight = fn(user_id, db)
            if insight:
                return insight
        return self._default_insight(user_id, db)

    # ------------------------------------------------------------------
    def _habit_spend_correlation(self, user_id: str, db: Session) -> dict | None:
        """Compare avg daily expense spend on days a habit was done vs
        skipped over the last 30 days. Surfaces the habit with the largest
        difference, if it's over 20%."""
        window_days = 30
        today = date.today()
        start = today - timedelta(days=window_days - 1)

        habits = (
            db.query(Habit)
            .filter(Habit.user_id == user_id, Habit.archived_at.is_(None))
            .all()
        )
        if not habits:
            return None

        txns = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.type == "expense",
                Transaction.date >= start,
                Transaction.date <= today,
            )
            .all()
        )
        spend_by_day: dict[date, float] = {}
        for t in txns:
            spend_by_day[t.date] = spend_by_day.get(t.date, 0.0) + t.amount

        all_days = [start + timedelta(days=i) for i in range(window_days)]

        best: dict | None = None
        for h in habits:
            done_days = {
                c.day_date
                for c in db.query(HabitCheckin).filter(
                    HabitCheckin.habit_id == h.id,
                    HabitCheckin.day_date >= start,
                    HabitCheckin.day_date <= today,
                )
            }
            skipped_days = [d for d in all_days if d not in done_days]
            if not done_days or not skipped_days:
                continue

            avg_done = sum(spend_by_day.get(d, 0.0) for d in done_days) / len(done_days)
            avg_skipped = sum(spend_by_day.get(d, 0.0) for d in skipped_days) / len(skipped_days)
            if avg_done <= 0:
                continue

            diff_pct = (avg_skipped - avg_done) / avg_done * 100
            if diff_pct > 20 and (best is None or diff_pct > best["_diff_pct"]):
                diff_amt = avg_skipped - avg_done
                best = {
                    "insight_text": (
                        f"Last {window_days} days you spent ₹{diff_amt:,.0f} more on days "
                        f"you skipped {h.name}."
                    ),
                    "insight_type": "habit_spend_correlation",
                    "_diff_pct": diff_pct,
                }
        if best:
            best.pop("_diff_pct")
        return best

    # ------------------------------------------------------------------
    def _category_spend_change(self, user_id: str, db: Session) -> dict | None:
        """This month-to-date category spend vs the same day-range last
        month. Surfaces the category with the largest increase, if over 25%."""
        today = date.today()
        this_month_start = today.replace(day=1)
        last_month_end = this_month_start - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1)
        # Same number of days into the month, for a fair comparison.
        days_in = (today - this_month_start).days
        last_month_cutoff = min(last_month_start + timedelta(days=days_in), last_month_end)

        this_month_txns = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.type == "expense",
                Transaction.date >= this_month_start,
                Transaction.date <= today,
            )
            .all()
        )
        last_month_txns = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.type == "expense",
                Transaction.date >= last_month_start,
                Transaction.date <= last_month_cutoff,
            )
            .all()
        )
        this_by_cat: dict[str, float] = {}
        for t in this_month_txns:
            cat = t.category or "Other"
            this_by_cat[cat] = this_by_cat.get(cat, 0.0) + t.amount
        last_by_cat: dict[str, float] = {}
        for t in last_month_txns:
            cat = t.category or "Other"
            last_by_cat[cat] = last_by_cat.get(cat, 0.0) + t.amount

        best: dict | None = None
        for cat, this_amt in this_by_cat.items():
            last_amt = last_by_cat.get(cat, 0.0)
            if last_amt <= 0:
                continue
            pct_change = (this_amt - last_amt) / last_amt * 100
            if pct_change > 25 and (best is None or pct_change > best["_pct"]):
                best = {
                    "insight_text": (
                        f"Your {cat} spending is up {pct_change:.0f}% this month vs last month."
                    ),
                    "insight_type": "category_spend_change",
                    "_pct": pct_change,
                }
        if best:
            best.pop("_pct")
        return best

    # ------------------------------------------------------------------
    def _goal_progress(self, user_id: str, db: Session) -> dict | None:
        """Surface the active goal closest to completion."""
        goals = (
            db.query(Goal)
            .filter(
                Goal.user_id == user_id,
                Goal.status == "active",
                Goal.archived_at.is_(None),
                Goal.target_value.isnot(None),
                Goal.target_value > 0,
                Goal.current_value.isnot(None),
            )
            .all()
        )
        if not goals:
            return None

        best_goal, best_pct = None, -1.0
        for g in goals:
            pct = (g.current_value / g.target_value) * 100
            if pct < 100 and pct > best_pct:
                best_goal, best_pct = g, pct
        if best_goal is None:
            return None

        return {
            "insight_text": f"{best_goal.title} is {best_pct:.0f}% complete.",
            "insight_type": "goal_progress",
        }

    # ------------------------------------------------------------------
    def _streak_milestone(self, user_id: str, db: Session) -> dict | None:
        """Celebrate the day the overall habit streak hits 7/14/21/30/60/90."""
        today = date.today()
        window_days = 365
        start = today - timedelta(days=window_days - 1)

        habit_ids = [
            h.id for h in
            db.query(Habit).filter(Habit.user_id == user_id, Habit.archived_at.is_(None)).all()
        ]
        if not habit_ids:
            return None

        checkins = (
            db.query(HabitCheckin)
            .filter(
                HabitCheckin.habit_id.in_(habit_ids),
                HabitCheckin.day_date >= start,
                HabitCheckin.day_date <= today,
            )
            .all()
        )
        any_done_days = {c.day_date for c in checkins}

        streak = 0
        probe = today
        while probe >= start and probe in any_done_days:
            streak += 1
            probe -= timedelta(days=1)

        if streak in _MILESTONES:
            return {
                "insight_text": f"You've hit a {streak}-day habit streak — keep it going!",
                "insight_type": "streak_milestone",
            }
        return None

    # ------------------------------------------------------------------
    def _default_insight(self, user_id: str, db: Session) -> dict:
        """Fallback: budget remaining this month, or a generic nudge if
        there's not enough data yet for anything more specific."""
        today = date.today()
        month_start = today.replace(day=1)
        days_in_month = calendar.monthrange(today.year, today.month)[1]
        days_left = days_in_month - today.day

        overall_budget = (
            db.query(Budget)
            .filter(
                Budget.user_id == user_id,
                Budget.category.is_(None),
                ((Budget.year == today.year) & (Budget.month == today.month))
                | (Budget.year.is_(None) & Budget.month.is_(None)),
            )
            .first()
        )
        if overall_budget:
            spent = sum(
                t.amount for t in db.query(Transaction).filter(
                    Transaction.user_id == user_id,
                    Transaction.type == "expense",
                    Transaction.date >= month_start,
                    Transaction.date <= today,
                )
            )
            remaining = overall_budget.amount - spent
            return {
                "insight_text": f"₹{remaining:,.0f} left in your budget — {days_left} days to go this month.",
                "insight_type": "default_budget_remaining",
            }

        return {
            "insight_text": "Log a few more habits and transactions and I'll start surfacing personalized insights here.",
            "insight_type": "default_empty",
        }
