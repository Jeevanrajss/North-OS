"""Journal models — Week 2.

Data model:

  mood_codes        fixed 12-row reference table (seeded once on boot).
  tags              vocabulary; seeded with 8 common tags, extends as user types
                    or accepts AI suggestions.
  journal_days      one row per calendar date. Holds day-level mood, tags, and
                    the optional Reflective summary (Highlights, Wins, Learnings,
                    Gratitude).
  journal_entries   many-per-day, timestamped, free-form BlockNote content.
  embeddings        metadata for each embedded chunk. Paired with the
                    `vec_embeddings` sqlite-vec virtual table (see db.py).
"""
from __future__ import annotations

import uuid
from datetime import date as date_cls
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Reference tables
# ---------------------------------------------------------------------------
class MoodCode(Base):
    """The 12 mood codes. Seeded once; rarely changes."""

    __tablename__ = "mood_codes"

    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    label: Mapped[str] = mapped_column(String(32), nullable=False)
    emoji: Mapped[str] = mapped_column(String(8), nullable=False)
    valence: Mapped[int] = mapped_column(Integer, nullable=False)  # -2..+2
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Tag(Base):
    """Tag vocabulary. `seeded=True` for the initial 8; False for user / AI tags."""

    __tablename__ = "tags"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    seeded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# ---------------------------------------------------------------------------
# Main journal tables
# ---------------------------------------------------------------------------
class JournalDay(Base):
    """One row per (user, date). Day-level mood + tags + optional Reflective summary.

    `date` used to be the sole primary key, which meant every user shared a
    single row per calendar date (whoever wrote to a date last won, and every
    user's moods/tags/summary/entries for that date were visible to everyone
    else). It's now identified by a synthetic `id`, scoped by `user_id`, with
    the uniqueness constraint moved to (user_id, date).
    """

    __tablename__ = "journal_days"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_journal_day_user_date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True, default="")
    date: Mapped[date_cls] = mapped_column(Date, nullable=False, index=True)

    # JSON arrays — stored as JSON for easy querying with SQLite json1.
    # Mood: up to 3 mood_codes.code values.
    mood_codes: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    # Tags: list of tag names.
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    # Reflective summary — each field is optional; UI shows "Add summary" pill
    # until at least one is filled.
    summary_highlights: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_wins: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_learnings: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_gratitude: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def has_summary(self) -> bool:
        return any(
            [
                self.summary_highlights,
                self.summary_wins,
                self.summary_learnings,
                self.summary_gratitude,
            ]
        )


class JournalEntry(Base):
    """A single timestamped entry within a day. Free-form BlockNote content.

    Not FK'd to journal_days — (user_id, day_date) is looked up explicitly by
    the router. journal_days.date stopped being unique on its own once it
    became per-user, so a real FK to it is no longer meaningful.
    """

    __tablename__ = "journal_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True, default="")
    day_date: Mapped[date_cls] = mapped_column(Date, nullable=False, index=True)

    # BlockNote stores as JSON blocks. We store the raw JSON string AND a plain
    # text render for fast search + embedding.
    content_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    content_text: Mapped[str] = mapped_column(Text, nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


# ---------------------------------------------------------------------------
# Embeddings — metadata table. The actual float[] lives in the sqlite-vec
# virtual table `vec_embeddings`, keyed by embeddings.id.
# ---------------------------------------------------------------------------
class Embedding(Base):
    __tablename__ = "embeddings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    # e.g. "journal_entry" | "journal_summary"
    source_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
