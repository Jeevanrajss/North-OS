"""Habit tracker router — Week 3.

Endpoints (all prefixed /api/v1/habits):

  GET    /                          list habits (active only by default)
  POST   /                          create a habit
  GET    /today?date=               active habits + today's check status
  GET    /stats?days=30             per-habit streaks + completion rates
  GET    /{id}                      get one habit
  PATCH  /{id}                      partial update
  DELETE /{id}                      archive (soft delete)
  POST   /{id}/restore              un-archive a habit
  GET    /{id}/checkins?from=&to=   check-ins in a window
  PUT    /{id}/checkins/{date}      upsert (idempotent tick)
  DELETE /{id}/checkins/{date}      delete tick
"""
from __future__ import annotations

from datetime import date as date_cls
from datetime import datetime, timezone
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.habit import Habit, HabitCheckin
from app.models.user import User
from app.services.auth_service import get_current_user
from app.schemas.habit import (
    HabitCheckinIn,
    HabitCheckinOut,
    HabitDayBit,
    HabitDayDoneBit,
    HabitDetailResponse,
    HabitDowBucket,
    HabitIn,
    HabitMonthlyPoint,
    HabitOut,
    HabitPatch,
    HabitStatRow,
    HabitStatsResponse,
    HabitTodayOut,
    HabitsTodayResponse,
    weekdays_from_str,
    weekdays_to_str,
)

router = APIRouter(prefix="/api/v1/habits", tags=["habits"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _get_habit_or_404(db: Session, habit_id: str, user_id: str) -> Habit:
    habit = db.query(Habit).filter(Habit.id == habit_id, Habit.user_id == user_id).first()
    if habit is None:
        raise HTTPException(404, "Habit not found")
    return habit


def _next_sort_order(db: Session, user_id: str) -> int:
    """Return max(sort_order)+1 so newly-created habits land at the bottom."""
    max_so = db.query(Habit).filter(Habit.user_id == user_id).order_by(Habit.sort_order.desc()).first()
    return (max_so.sort_order + 1) if max_so else 0


# ---------------------------------------------------------------------------
# Streak helpers — schedule-aware.
#
# Rule: unscheduled days are SKIPPED (they neither extend nor break a streak).
# Scheduled + done extends; scheduled + not done breaks. Daily habits have
# every day scheduled, so behavior matches the previous "day ticked = count"
# implementation for them.
# ---------------------------------------------------------------------------
ScheduleFn = "Callable[[date_cls], bool]"  # type: ignore[valid-type]


def _schedule_fn_for(habit: Habit):  # noqa: ANN202 — simple closure
    if habit.frequency_kind != "weekly":
        return lambda _d: True
    from app.schemas.habit import weekdays_from_str as _parse  # local import

    days = set(_parse(habit.weekdays))
    if not days:
        # Weekly but no days selected — treat every day as scheduled to avoid
        # always-zero streaks. Matches the current-weekday fallback elsewhere.
        return lambda _d: True
    return lambda d: d.weekday() in days


def _current_streak(
    done_days: set,
    is_scheduled,
    start: date_cls,
    today: date_cls,
) -> int:
    """Walk back from today; unscheduled days skip, scheduled+not-done break."""
    count = 0
    probe = today
    while probe >= start:
        if is_scheduled(probe):
            if probe in done_days:
                count += 1
            else:
                break
        probe -= timedelta(days=1)
    return count


def _longest_streak(
    done_days: set,
    is_scheduled,
    start: date_cls,
    end: date_cls,
) -> int:
    """Longest run where every SCHEDULED day was done. Unscheduled days pass
    through without interrupting."""
    longest = 0
    run = 0
    cur = start
    while cur <= end:
        if is_scheduled(cur):
            if cur in done_days:
                run += 1
                longest = max(longest, run)
            else:
                run = 0
        # else: skip without affecting run
        cur += timedelta(days=1)
    return longest


# ---------------------------------------------------------------------------
# Habit CRUD
# ---------------------------------------------------------------------------
@router.get("", response_model=list[HabitOut])
def list_habits(
    include_archived: bool = Query(False, description="Include archived habits"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Habit).filter(Habit.user_id == current_user.id)
    if not include_archived:
        q = q.filter(Habit.archived_at.is_(None))
    return q.order_by(Habit.sort_order, Habit.created_at).all()


@router.post("", response_model=HabitOut, status_code=201)
def create_habit(payload: HabitIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    habit = Habit(
        name=payload.name,
        emoji=payload.emoji or "✅",
        frequency_kind=payload.frequency_kind,
        frequency_target=payload.frequency_target,
        weekdays=weekdays_to_str(payload.weekdays),
        sort_order=_next_sort_order(db, current_user.id),
        user_id=current_user.id,
    )
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return habit


@router.get("/today", response_model=HabitsTodayResponse)
def habits_today(
    date: date_cls | None = Query(None, description="ISO date. Defaults to today."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = date or date_cls.today()
    habits = (
        db.query(Habit)
        .filter(Habit.user_id == current_user.id, Habit.archived_at.is_(None))
        .order_by(Habit.sort_order, Habit.created_at)
        .all()
    )
    habit_ids = [h.id for h in habits]
    checkins = (
        db.query(HabitCheckin)
        .filter(HabitCheckin.day_date == d, HabitCheckin.habit_id.in_(habit_ids))
        .all()
        if habit_ids
        else []
    )
    checkin_by_habit: dict[str, HabitCheckin] = {c.habit_id: c for c in checkins}

    rows: list[HabitTodayOut] = []
    for h in habits:
        ci = checkin_by_habit.get(h.id)
        rows.append(
            HabitTodayOut(
                habit=HabitOut.model_validate(h),
                done=ci is not None,
                checkin=HabitCheckinOut.model_validate(ci) if ci else None,
            )
        )
    return HabitsTodayResponse(date=d, habits=rows)


@router.get("/stats", response_model=HabitStatsResponse)
def habits_stats(
    days: int = Query(30, ge=7, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date_cls.today()
    start = today - timedelta(days=days - 1)

    habits = (
        db.query(Habit)
        .filter(Habit.user_id == current_user.id, Habit.archived_at.is_(None))
        .order_by(Habit.sort_order, Habit.created_at)
        .all()
    )
    if not habits:
        # Still populate the last-7-days bits (all False) so the UI has a
        # stable sparkline length to render against.
        empty_bits = [
            HabitDayDoneBit(
                date=today - timedelta(days=6 - i), any_done=False, done_count=0
            )
            for i in range(7)
        ]
        return HabitStatsResponse(
            window_days=days,
            per_habit=[],
            overall_current_streak=0,
            overall_longest_streak_in_window=0,
            daily_any_done=empty_bits,
        )

    habit_ids = [h.id for h in habits]
    checkins = (
        db.query(HabitCheckin)
        .filter(
            HabitCheckin.habit_id.in_(habit_ids),
            HabitCheckin.day_date >= start,
            HabitCheckin.day_date <= today,
        )
        .all()
    )
    by_habit: dict[str, set[date_cls]] = {hid: set() for hid in habit_ids}
    for c in checkins:
        by_habit[c.habit_id].add(c.day_date)

    # Per-day "any habit done?" — the set union across all habits.
    any_done_days: set[date_cls] = set()
    # Per-day count of distinct habits ticked. Used for the sparkline tooltip.
    day_done_counts: dict[date_cls, int] = {}
    for hid, dset in by_habit.items():
        for d in dset:
            any_done_days.add(d)
            day_done_counts[d] = day_done_counts.get(d, 0) + 1

    # Last 7 days oldest → newest: (date, any_done, done_count).
    last7_start = today - timedelta(days=6)
    last7_bits_overall: list[HabitDayDoneBit] = []
    cur = last7_start
    while cur <= today:
        last7_bits_overall.append(
            HabitDayDoneBit(
                date=cur,
                any_done=cur in any_done_days,
                done_count=day_done_counts.get(cur, 0),
            )
        )
        cur += timedelta(days=1)

    per_habit: list[HabitStatRow] = []
    window_len = days
    for h in habits:
        done_days = by_habit.get(h.id, set())
        is_scheduled = _schedule_fn_for(h)

        current = _current_streak(done_days, is_scheduled, start, today)
        longest = _longest_streak(done_days, is_scheduled, start, today)

        done_count = len(done_days)
        completion_rate = (done_count / window_len) if window_len > 0 else 0.0

        # Per-habit last 7 bits (oldest → newest).
        last7: list[bool] = []
        cur = last7_start
        while cur <= today:
            last7.append(cur in done_days)
            cur += timedelta(days=1)

        per_habit.append(
            HabitStatRow(
                habit_id=h.id,
                current_streak=current,
                longest_streak_in_window=longest,
                completion_rate=round(completion_rate, 4),
                done_count=done_count,
                last7=last7,
            )
        )

    # Overall current streak: walk back from today while *any* habit was done.
    overall_current = 0
    probe = today
    while probe >= start and probe in any_done_days:
        overall_current += 1
        probe -= timedelta(days=1)

    # Overall longest streak inside the window.
    overall_longest = 0
    run = 0
    cur = start
    while cur <= today:
        if cur in any_done_days:
            run += 1
            if run > overall_longest:
                overall_longest = run
        else:
            run = 0
        cur += timedelta(days=1)

    return HabitStatsResponse(
        window_days=days,
        per_habit=per_habit,
        overall_current_streak=overall_current,
        overall_longest_streak_in_window=overall_longest,
        daily_any_done=last7_bits_overall,
    )


@router.get("/{habit_id}/detail", response_model=HabitDetailResponse)
def habit_detail(
    habit_id: str,
    days: int = Query(90, ge=14, le=730),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Single-shot payload for the per-habit detail page."""
    habit = _get_habit_or_404(db, habit_id, current_user.id)

    today = date_cls.today()
    start = today - timedelta(days=days - 1)

    # Shared schedule predicate — same rule used by streaks, DOW, and monthly.
    is_scheduled = _schedule_fn_for(habit)

    # --- Checkins in the window -------------------------------------------
    checkins = (
        db.query(HabitCheckin)
        .filter(
            HabitCheckin.habit_id == habit_id,
            HabitCheckin.day_date >= start,
            HabitCheckin.day_date <= today,
        )
        .order_by(HabitCheckin.day_date)
        .all()
    )
    done_days: set[date_cls] = {c.day_date for c in checkins}
    checkin_by_date: dict[date_cls, HabitCheckin] = {c.day_date: c for c in checkins}

    # --- Daily bits for the heatmap ---------------------------------------
    daily: list[HabitDayBit] = []
    cur = start
    while cur <= today:
        ci = checkin_by_date.get(cur)
        preview: str | None = None
        if ci and ci.note:
            preview = ci.note[:80]
        daily.append(
            HabitDayBit(
                date=cur,
                done=cur in done_days,
                value=ci.value if ci else 0,
                note_preview=preview,
            )
        )
        cur += timedelta(days=1)

    # --- Stats: streaks + simple completion rate (window-wide) -------------
    current = _current_streak(done_days, is_scheduled, start, today)
    longest = _longest_streak(done_days, is_scheduled, start, today)
    done_count = len(done_days)
    completion_rate = (done_count / days) if days > 0 else 0.0

    # Per-habit last7 so the existing HabitStatRow contract stays filled.
    last7_start = today - timedelta(days=6)
    last7: list[bool] = []
    cur = last7_start
    while cur <= today:
        last7.append(cur in done_days)
        cur += timedelta(days=1)

    stat = HabitStatRow(
        habit_id=habit.id,
        current_streak=current,
        longest_streak_in_window=longest,
        completion_rate=round(completion_rate, 4),
        done_count=done_count,
        last7=last7,
    )

    # --- Day-of-week breakdown --------------------------------------------
    dow_done = [0] * 7
    dow_opps = [0] * 7
    cur = start
    while cur <= today:
        wd = cur.weekday()
        if is_scheduled(cur):
            dow_opps[wd] += 1
            if cur in done_days:
                dow_done[wd] += 1
        elif cur in done_days:
            # Off-schedule ticks still count as opportunities *and* done so
            # the bar reflects actual behavior rather than 0/0.
            dow_opps[wd] += 1
            dow_done[wd] += 1
        cur += timedelta(days=1)
    dow: list[HabitDowBucket] = []
    for wd in range(7):
        rate = (dow_done[wd] / dow_opps[wd]) if dow_opps[wd] else 0.0
        dow.append(
            HabitDowBucket(
                weekday=wd,
                done_count=dow_done[wd],
                opportunities=dow_opps[wd],
                completion_rate=round(rate, 4),
            )
        )

    # --- 12-month trend ---------------------------------------------------
    # Anchor: first day of (today's month - 11 months). Walk month-by-month.
    def _shift_months(d: date_cls, delta: int) -> date_cls:
        total = d.year * 12 + (d.month - 1) + delta
        y, m = divmod(total, 12)
        return date_cls(y, m + 1, 1)

    month_start = _shift_months(date_cls(today.year, today.month, 1), -11)
    # Habit was created at `habit.created_at`; for monthly opportunities we
    # clip the lower bound to its start date so we don't invent history.
    habit_start_d = (habit.created_at.date() if habit.created_at else date_cls.min)

    # Pre-group checkins by month for O(months) lookup.
    by_month_done: dict[str, int] = {}
    for c in (
        db.query(HabitCheckin)
        .filter(
            HabitCheckin.habit_id == habit_id,
            HabitCheckin.day_date >= month_start,
            HabitCheckin.day_date <= today,
        )
        .all()
    ):
        ym = c.day_date.strftime("%Y-%m")
        by_month_done[ym] = by_month_done.get(ym, 0) + 1

    monthly: list[HabitMonthlyPoint] = []
    m_cur = month_start
    while m_cur <= date_cls(today.year, today.month, 1):
        m_next = _shift_months(m_cur, 1)
        # Clip to habit's lifetime + not beyond today.
        range_start = max(m_cur, habit_start_d)
        range_end = min(m_next - timedelta(days=1), today)
        opps = 0
        if range_start <= range_end:
            walker = range_start
            while walker <= range_end:
                if is_scheduled(walker):
                    opps += 1
                walker += timedelta(days=1)
        ym = m_cur.strftime("%Y-%m")
        dc = by_month_done.get(ym, 0)
        rate = (dc / opps) if opps else 0.0
        monthly.append(
            HabitMonthlyPoint(
                year_month=ym,
                done_count=dc,
                opportunities=opps,
                completion_rate=round(rate, 4),
            )
        )
        m_cur = m_next

    # --- Recent notes -----------------------------------------------------
    noted = (
        db.query(HabitCheckin)
        .filter(HabitCheckin.habit_id == habit_id, HabitCheckin.note.is_not(None))
        .order_by(HabitCheckin.day_date.desc())
        .limit(10)
        .all()
    )

    return HabitDetailResponse(
        habit=HabitOut.model_validate(habit),
        window_days=days,
        start=start,
        end=today,
        daily=daily,
        stats=stat,
        dow=dow,
        monthly=monthly,
        recent_notes=[HabitCheckinOut.model_validate(c) for c in noted],
    )


@router.get("/{habit_id}", response_model=HabitOut)
def get_habit(habit_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _get_habit_or_404(db, habit_id, current_user.id)


@router.patch("/{habit_id}", response_model=HabitOut)
def update_habit(habit_id: str, patch: HabitPatch, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    habit = _get_habit_or_404(db, habit_id, current_user.id)
    data = patch.model_dump(exclude_unset=True)

    # Convert weekdays list[int] → comma-string for DB storage.
    if "weekdays" in data:
        data["weekdays"] = weekdays_to_str(data["weekdays"])

    # If caller is switching to daily, clear the schedule automatically.
    if data.get("frequency_kind") == "daily":
        data["weekdays"] = None
        data["frequency_target"] = 1

    # If switching to weekly without providing weekdays in the same PATCH,
    # reject — we need a schedule to know when it applies.
    if (
        data.get("frequency_kind") == "weekly"
        and "weekdays" not in data
        and not habit.weekdays
    ):
        raise HTTPException(
            400, "Switching to weekly requires a weekdays list (0=Mon..6=Sun)."
        )

    # When weekdays changes and habit is weekly, keep frequency_target in sync.
    if "weekdays" in data and (
        data.get("frequency_kind", habit.frequency_kind) == "weekly"
    ):
        raw = data["weekdays"]
        count = len(raw.split(",")) if raw else 0
        data["frequency_target"] = count or 1

    for field, value in data.items():
        setattr(habit, field, value)
    db.commit()
    db.refresh(habit)
    return habit


@router.delete("/{habit_id}", response_model=HabitOut)
def archive_habit(habit_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Soft-archive the habit. Historical check-ins are preserved."""
    habit = _get_habit_or_404(db, habit_id, current_user.id)
    if habit.archived_at is None:
        habit.archived_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(habit)
    return habit


@router.post("/{habit_id}/restore", response_model=HabitOut)
def restore_habit(habit_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    habit = _get_habit_or_404(db, habit_id, current_user.id)
    if habit.archived_at is not None:
        habit.archived_at = None
        db.commit()
        db.refresh(habit)
    return habit


# ---------------------------------------------------------------------------
# Check-ins
# ---------------------------------------------------------------------------
@router.get("/{habit_id}/checkins", response_model=list[HabitCheckinOut])
def list_checkins(
    habit_id: str,
    from_: date_cls = Query(..., alias="from"),
    to: date_cls = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_habit_or_404(db, habit_id, current_user.id)
    if to < from_:
        raise HTTPException(400, "'to' must be >= 'from'")
    rows = (
        db.query(HabitCheckin)
        .filter(
            HabitCheckin.habit_id == habit_id,
            HabitCheckin.day_date >= from_,
            HabitCheckin.day_date <= to,
        )
        .order_by(HabitCheckin.day_date)
        .all()
    )
    return rows


@router.put("/{habit_id}/checkins/{d}", response_model=HabitCheckinOut)
def upsert_checkin(
    habit_id: str,
    d: date_cls,
    payload: HabitCheckinIn | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Idempotent tick."""
    _get_habit_or_404(db, habit_id, current_user.id)
    body = payload or HabitCheckinIn()

    existing = (
        db.query(HabitCheckin)
        .filter(HabitCheckin.habit_id == habit_id, HabitCheckin.day_date == d)
        .first()
    )
    if existing is None:
        existing = HabitCheckin(
            habit_id=habit_id,
            day_date=d,
            value=body.value,
            note=body.note,
            user_id=current_user.id,
        )
        db.add(existing)
    else:
        existing.value = body.value
        if body.note is not None:
            existing.note = body.note
    db.commit()
    db.refresh(existing)
    return existing


@router.delete("/{habit_id}/checkins/{d}", status_code=204)
def delete_checkin(habit_id: str, d: date_cls, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_habit_or_404(db, habit_id, current_user.id)
    row = (
        db.query(HabitCheckin)
        .filter(HabitCheckin.habit_id == habit_id, HabitCheckin.day_date == d)
        .first()
    )
    if row is None:
        # Idempotent: no-op if already absent.
        return None
    db.delete(row)
    db.commit()
    return None
