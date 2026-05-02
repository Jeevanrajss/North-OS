"""Pydantic schemas for the Journal API."""
from __future__ import annotations

from datetime import date as date_cls
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Max moods per day — matches the product decision.
MAX_MOODS_PER_DAY = 3


# ---------------------------------------------------------------------------
# Reference
# ---------------------------------------------------------------------------
class MoodCodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    label: str
    emoji: str
    valence: int
    sort_order: int


class TagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    seeded: bool


# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------
class EntryIn(BaseModel):
    """Create or replace an entry's content."""

    content_json: str = Field(default="[]", description="BlockNote blocks as JSON string")
    content_text: str = Field(default="", description="Plain-text render for search + embed")


class EntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    day_date: date_cls
    content_json: str
    content_text: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Day
# ---------------------------------------------------------------------------
class DayPatch(BaseModel):
    """Partial update for a day. All fields optional — only provided ones change."""

    mood_codes: list[str] | None = None
    tags: list[str] | None = None
    summary_highlights: str | None = None
    summary_wins: str | None = None
    summary_learnings: str | None = None
    summary_gratitude: str | None = None

    @field_validator("mood_codes")
    @classmethod
    def _cap_moods(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        if len(v) > MAX_MOODS_PER_DAY:
            raise ValueError(f"At most {MAX_MOODS_PER_DAY} moods per day")
        # Dedup preserving order.
        seen: set[str] = set()
        out = []
        for code in v:
            if code not in seen:
                seen.add(code)
                out.append(code)
        return out


class DayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date_cls
    mood_codes: list[str]
    tags: list[str]
    summary_highlights: str | None
    summary_wins: str | None
    summary_learnings: str | None
    summary_gratitude: str | None
    has_summary: bool
    entries: list[EntryOut]
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Calendar (heatmap) — one cell per date
# ---------------------------------------------------------------------------
class CalendarCell(BaseModel):
    date: date_cls
    mood_codes: list[str]
    valence_avg: float | None  # average of mood valences; None if no mood set
    entry_count: int
    has_summary: bool


class CalendarOut(BaseModel):
    start: date_cls
    end: date_cls
    cells: list[CalendarCell]


# ---------------------------------------------------------------------------
# Stats — streaks + mood series + top tags for left-column widgets
# ---------------------------------------------------------------------------
class DailyValencePoint(BaseModel):
    date: date_cls
    valence_avg: float | None
    entry_count: int


class TagCount(BaseModel):
    name: str
    count: int


class StatsOut(BaseModel):
    window_days: int
    current_streak: int           # consecutive days ending today with >=1 entry
    longest_streak_in_window: int # longest such run inside the window
    active_days: int              # days in window with >=1 entry
    total_entries: int            # total entries in window
    daily_valence: list[DailyValencePoint]
    top_tags: list[TagCount]


# ---------------------------------------------------------------------------
# Semantic search
# ---------------------------------------------------------------------------
class JournalSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    limit: int = Field(default=5, ge=1, le=20)


class JournalSearchResult(BaseModel):
    entry_id: str
    day_date: date_cls
    snippet: str
    score: float


# ---------------------------------------------------------------------------
# AI tag suggestions — transient (not persisted)
# ---------------------------------------------------------------------------
class TagSuggestionOut(BaseModel):
    suggestions: list[str]
    model: str
    # Diagnostic: why the list might be empty.
    #   "ok"             — we have fresh suggestions
    #   "too_short"      — entry text below min length
    #   "llm_error"      — LLM call failed (host down, timeout, etc.)
    #   "parse_failed"   — model returned non-JSON or malformed output
    #   "all_existing"   — model returned tags that are already on the day
    #   "empty_response" — model returned an empty/whitespace response
    reason: str = "ok"
    # Raw model output (trimmed). Useful in dev to debug weird outputs.
    raw: str | None = None
