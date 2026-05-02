"""Pydantic schemas for the Habit Tracker API."""
from __future__ import annotations

from datetime import date as date_cls
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


FrequencyKind = Literal["daily", "weekly"]


# ---------------------------------------------------------------------------
# Weekday helpers — ISO: 0=Mon, 6=Sun.
# ---------------------------------------------------------------------------
def _clean_weekdays(raw: list[int] | None) -> list[int]:
    """Return a sorted, deduped list of valid weekday ints (0..6)."""
    if not raw:
        return []
    out = sorted({int(d) for d in raw if 0 <= int(d) <= 6})
    return out


def weekdays_to_str(days: list[int] | None) -> str | None:
    """Serialize weekdays for DB storage. Empty list → None."""
    cleaned = _clean_weekdays(days)
    return ",".join(str(d) for d in cleaned) if cleaned else None


def weekdays_from_str(s: str | None) -> list[int]:
    """Parse DB storage back into a sorted list[int]."""
    if not s:
        return []
    try:
        return _clean_weekdays([int(x) for x in s.split(",") if x.strip() != ""])
    except ValueError:
        return []


# ---------------------------------------------------------------------------
# Habit
# ---------------------------------------------------------------------------
class HabitIn(BaseModel):
    """Create a habit."""

    name: str = Field(..., min_length=1, max_length=80)
    emoji: str = Field(default="✅", max_length=8)
    frequency_kind: FrequencyKind = "daily"
    # For weekly habits: which specific weekdays (ISO, 0=Mon). For daily: [].
    weekdays: list[int] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        return v.strip()

    @field_validator("weekdays")
    @classmethod
    def _normalize_weekdays(cls, v: list[int]) -> list[int]:
        return _clean_weekdays(v)

    @model_validator(mode="after")
    def _require_weekdays_for_weekly(self) -> "HabitIn":
        if self.frequency_kind == "weekly" and not self.weekdays:
            raise ValueError("Weekly habits must specify at least one weekday (0=Mon..6=Sun).")
        if self.frequency_kind == "daily":
            self.weekdays = []  # defensive — ignore any value passed in
        return self

    @property
    def frequency_target(self) -> int:
        return len(self.weekdays) if self.frequency_kind == "weekly" else 1


class HabitPatch(BaseModel):
    """Partial update. Only provided fields change."""

    name: str | None = Field(default=None, min_length=1, max_length=80)
    emoji: str | None = Field(default=None, max_length=8)
    frequency_kind: FrequencyKind | None = None
    weekdays: list[int] | None = None  # only valid when frequency_kind is weekly
    sort_order: int | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return v.strip()

    @field_validator("weekdays")
    @classmethod
    def _normalize_weekdays(cls, v: list[int] | None) -> list[int] | None:
        return None if v is None else _clean_weekdays(v)

    @model_validator(mode="after")
    def _guard_weekly_needs_days(self) -> "HabitPatch":
        # If caller is switching to weekly, they must also pass weekdays (or
        # have a non-empty list already — but we can't know that here).
        if self.frequency_kind == "weekly" and self.weekdays is not None and not self.weekdays:
            raise ValueError("Weekly habits must specify at least one weekday.")
        return self


class HabitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    emoji: str
    frequency_kind: str
    frequency_target: int
    weekdays: list[int] = Field(default_factory=list)
    sort_order: int
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @field_validator("weekdays", mode="before")
    @classmethod
    def _parse_weekdays(cls, v):
        # The ORM hands us a comma-separated string (or None). Normalize to a
        # sorted list[int] for the API.
        if v is None:
            return []
        if isinstance(v, str):
            return weekdays_from_str(v)
        if isinstance(v, list):
            return _clean_weekdays(v)
        return []


# ---------------------------------------------------------------------------
# Check-in
# ---------------------------------------------------------------------------
class HabitCheckinIn(BaseModel):
    """Optional body for a check-in. All fields optional — defaults kick in."""

    value: int = Field(default=1, ge=1)
    note: str | None = None


class HabitCheckinOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    habit_id: str
    day_date: date_cls
    value: int
    note: str | None
    created_at: datetime


# ---------------------------------------------------------------------------
# Today — habit + its check status for a given date
# ---------------------------------------------------------------------------
class HabitTodayOut(BaseModel):
    """One row per active habit, annotated with whether it's done for `date`."""

    habit: HabitOut
    done: bool
    # Null when not done; present when done (so the UI can show 'ticked at X time').
    checkin: HabitCheckinOut | None = None


class HabitsTodayResponse(BaseModel):
    date: date_cls
    habits: list[HabitTodayOut]


# ---------------------------------------------------------------------------
# Stats — per-habit streaks + completion rates
# ---------------------------------------------------------------------------
class HabitStatRow(BaseModel):
    habit_id: str
    current_streak: int          # consecutive days ending today with a checkin
    longest_streak_in_window: int
    completion_rate: float       # 0..1 over the window
    done_count: int              # days with >=1 checkin in window
    last7: list[bool] = []       # oldest → newest bit per day (7 items)


class HabitDayDoneBit(BaseModel):
    """One entry per day: did any habit get done?"""

    date: date_cls
    any_done: bool
    done_count: int              # distinct habits ticked that day


class HabitStatsResponse(BaseModel):
    window_days: int
    per_habit: list[HabitStatRow]
    # Overall "any habit was done today" streak — mirrors journal-streak
    # semantics. Zero when no habits exist or nothing's been ticked recently.
    overall_current_streak: int = 0
    overall_longest_streak_in_window: int = 0
    # Last 7 days, oldest → newest. Used by the streak-card sparkline.
    daily_any_done: list[HabitDayDoneBit] = []


# ---------------------------------------------------------------------------
# Detail view — everything the /habits/:id page needs in one call.
# ---------------------------------------------------------------------------
class HabitDayBit(BaseModel):
    """One day in the heatmap window."""

    date: date_cls
    done: bool
    value: int = 0
    # First ~80 chars of the note, if any. Used for heatmap cell tooltips.
    note_preview: str | None = None


class HabitDowBucket(BaseModel):
    """Day-of-week breakdown. ISO 0=Mon..6=Sun."""

    weekday: int
    done_count: int              # ticks on this weekday in the window
    opportunities: int           # days this weekday occurred in the window
                                 # (respecting frequency_kind + schedule)
    completion_rate: float       # done_count / opportunities (0 if no opps)


class HabitMonthlyPoint(BaseModel):
    """One month of the 12-month trend. year_month = 'YYYY-MM'."""

    year_month: str
    done_count: int
    opportunities: int           # scheduled days in that month (daily = days in month)
    completion_rate: float


class HabitDetailResponse(BaseModel):
    habit: HabitOut
    window_days: int
    start: date_cls              # inclusive
    end: date_cls                # inclusive — always today
    # Heatmap data — length == (end - start + 1). Oldest → newest.
    daily: list[HabitDayBit]
    # Reuse the per-habit stat row the stats endpoint already computes.
    stats: HabitStatRow
    dow: list[HabitDowBucket]    # length 7, Mon..Sun
    # Last 12 calendar months (including current), oldest → newest.
    monthly: list[HabitMonthlyPoint]
    # Most recent ~10 check-ins that have a note attached. newest first.
    recent_notes: list[HabitCheckinOut]
