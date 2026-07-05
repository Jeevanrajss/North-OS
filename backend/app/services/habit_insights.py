"""AI service — generate natural-language insights from habit tracking data.

Reads the last N days of habit checkins and composes a context string for the
LLM. Returns a list of insight strings. Never raises.
"""
from __future__ import annotations

import logging
import re
from datetime import date, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.habit import Habit, HabitCheckin
from app.services import llm_client
from app.services.llm_client import LLMError

log = logging.getLogger(__name__)

_SYSTEM = """You are analyzing someone's personal habit tracking data for the past 30 days.

Write 3–4 short, specific insights about their patterns.
Rules:
- Name the habit and real numbers — don't be vague
- Mix what's going well with what has room to grow
- Note day-of-week patterns if visible
- Max 2 sentences per insight
- Output ONLY a numbered list — no headers, no preamble, no summary line
- Use **bold** (markdown double-asterisks) around habit names and key numbers so they stand out at a glance

Example:
1. **Morning Run** is your strongest habit at **87%** — great consistency on weekdays.
2. **Evening Reading** drops off on Fridays; only 1 of the last 4 Fridays were logged.
3. **Meditation** streak sits at **4 days** — your longest this month was 9."""


def _schedule_days(habit: Habit, start: date, end: date) -> list[date]:
    """Return dates in [start, end] when this habit is scheduled."""
    weekdays = set(habit.weekdays) if habit.weekdays else None  # None = daily
    out = []
    cur = start
    while cur <= end:
        iso_wd = cur.weekday()  # 0=Mon
        if weekdays is None or iso_wd in weekdays:
            out.append(cur)
        cur += timedelta(days=1)
    return out


def _build_context(db: Session, window_days: int = 30, user_id: str = "") -> str:
    today = date.today()
    start = today - timedelta(days=window_days - 1)

    habits: list[Habit] = (
        db.query(Habit)
        .filter(Habit.user_id == user_id, Habit.archived_at.is_(None))
        .order_by(Habit.sort_order)
        .all()
    )
    if not habits:
        return ""

    checkins: list[HabitCheckin] = (
        db.query(HabitCheckin)
        .filter(
            HabitCheckin.user_id == user_id,
            HabitCheckin.day_date >= start,
            HabitCheckin.day_date <= today,
        )
        .all()
    )
    done_set: set[tuple[str, date]] = {(c.habit_id, c.day_date) for c in checkins}

    dow_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    sections: list[str] = [f"Habit data — last {window_days} days (ending {today}):"]
    for habit in habits:
        scheduled = _schedule_days(habit, start, today)
        done_days = [d for d in scheduled if (habit.id, d) in done_set]

        if not scheduled:
            continue

        pct = round(len(done_days) / len(scheduled) * 100)
        freq = "daily" if not habit.weekdays else f"weekly ({', '.join(dow_names[w] for w in sorted(habit.weekdays))})"

        # Current streak from today backwards
        streak = 0
        probe = today
        while probe >= start:
            if probe in {d for d in scheduled} and (habit.id, probe) in done_set:
                streak += 1
                probe -= timedelta(days=1)
            elif probe not in {d for d in scheduled}:
                probe -= timedelta(days=1)
            else:
                break

        # Day-of-week breakdown for daily habits (interesting pattern)
        dow_line = ""
        if not habit.weekdays:  # daily
            dow_done: dict[int, int] = {i: 0 for i in range(7)}
            dow_sched: dict[int, int] = {i: 0 for i in range(7)}
            for d in scheduled:
                wd = d.weekday()
                dow_sched[wd] += 1
                if (habit.id, d) in done_set:
                    dow_done[wd] += 1
            dow_pcts = [
                f"{dow_names[i]}: {round(dow_done[i]/dow_sched[i]*100) if dow_sched[i] else 0}%"
                for i in range(7)
            ]
            dow_line = f"  DOW completion: {', '.join(dow_pcts)}"

        line = (
            f"\n{habit.emoji} {habit.name} ({freq})\n"
            f"  Done: {len(done_days)}/{len(scheduled)} scheduled days ({pct}%)\n"
            f"  Current streak: {streak} days"
        )
        if dow_line:
            line += f"\n{dow_line}"
        sections.append(line)

    return "\n".join(sections)


async def generate_insights(db: Session, window_days: int = 30, user_id: str = "") -> list[str]:
    """Return 3–4 insight strings. Never raises — returns [] on failure."""
    context = _build_context(db, window_days, user_id=user_id)
    if not context:
        return []

    try:
        raw = await llm_client.generate(
            context,
            purpose="insights",
            system=_SYSTEM,
            temperature=0.5,
            max_tokens=350,
            user_id=user_id,
        )
    except LLMError as e:
        log.warning("habit_insights: LLM error: %s", e)
        return []

    insights: list[str] = []
    for line in (raw or "").splitlines():
        line = re.sub(r"^\d+[\.\)]\s*", "", line.strip()).strip()
        if len(line) > 10:
            insights.append(line)
        if len(insights) >= 5:
            break

    return insights
