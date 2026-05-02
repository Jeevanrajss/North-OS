"""Seed data — mood palette (12 codes) and initial tag vocabulary.

Runs idempotently from init_db(). Safe to re-run; uses `INSERT OR IGNORE`-style
semantics via SQLAlchemy's merge pattern.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.journal import MoodCode, Tag

# ---------------------------------------------------------------------------
# The 12-mood palette.
# Grouped by energy × valence so analytics have clean buckets later.
# valence: +2 strong positive, +1 positive, -1 negative, -2 strong negative.
# ---------------------------------------------------------------------------
MOOD_PALETTE: list[dict] = [
    {"code": "grateful",    "label": "Grateful",    "emoji": "🙏",  "valence":  2, "sort_order":  1},
    {"code": "content",     "label": "Content",     "emoji": "😊",  "valence":  2, "sort_order":  2},
    {"code": "motivated",   "label": "Motivated",   "emoji": "⚡",  "valence":  1, "sort_order":  3},
    {"code": "calm",        "label": "Calm",        "emoji": "😌",  "valence":  1, "sort_order":  4},
    {"code": "focused",     "label": "Focused",     "emoji": "🎯",  "valence":  1, "sort_order":  5},
    {"code": "curious",     "label": "Curious",     "emoji": "🤔",  "valence":  1, "sort_order":  6},
    {"code": "tired",       "label": "Tired",       "emoji": "😴",  "valence": -1, "sort_order":  7},
    {"code": "sad",         "label": "Sad",         "emoji": "😢",  "valence": -1, "sort_order":  8},
    {"code": "anxious",     "label": "Anxious",     "emoji": "😰",  "valence": -1, "sort_order":  9},
    {"code": "drained",     "label": "Drained",     "emoji": "🪫",  "valence": -2, "sort_order": 10},
    {"code": "overwhelmed", "label": "Overwhelmed", "emoji": "😵",  "valence": -2, "sort_order": 11},
    {"code": "angry",       "label": "Angry",       "emoji": "😡",  "valence": -2, "sort_order": 12},
]

# Initial tag vocabulary.
SEED_TAGS: list[str] = [
    "work",
    "family",
    "health",
    "money",
    "win",
    "lesson",
    "gratitude",
    "grief",
]


def seed_all(db: Session) -> None:
    """Idempotent seed — only inserts missing rows."""
    _seed_moods(db)
    _seed_tags(db)
    db.commit()


def _seed_moods(db: Session) -> None:
    existing = {m.code for m in db.query(MoodCode).all()}
    for m in MOOD_PALETTE:
        if m["code"] not in existing:
            db.add(MoodCode(**m))


def _seed_tags(db: Session) -> None:
    existing = {t.name for t in db.query(Tag).filter(Tag.seeded.is_(True)).all()}
    for name in SEED_TAGS:
        if name not in existing:
            db.add(Tag(name=name, seeded=True))


def mood_valence_map(db: Session) -> dict[str, int]:
    """Lookup used for calendar heatmap coloring."""
    return {m.code: m.valence for m in db.query(MoodCode).all()}
