"""Journal router — Week 2.

Endpoints (all prefixed /api/v1/journal):

  GET    /moods                         list the 12 mood codes
  GET    /tags                          list all tags (seeded + user)
  GET    /calendar?start=&end=          heatmap cells for a date range
  GET    /days/{date}                   one day (auto-creates if missing)
  PATCH  /days/{date}                   partial day update (mood, tags, summary)
  POST   /days/{date}/entries           create a new timestamped entry
  PUT    /entries/{id}                  replace an entry's content
  DELETE /entries/{id}                  delete an entry
  POST   /days/{date}/suggest-tags       AI tag suggestions for the full day (transient)

All auto-creates a JournalDay row on first touch for a date.
"""
from __future__ import annotations

from datetime import date as date_cls
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.journal import JournalDay, JournalEntry, MoodCode, Tag
from app.schemas.journal import (
    CalendarCell,
    CalendarOut,
    DailyValencePoint,
    DayOut,
    DayPatch,
    EntryIn,
    EntryOut,
    JournalSearchRequest,
    JournalSearchResult,
    MoodCodeOut,
    StatsOut,
    TagCount,
    TagOut,
    TagSuggestionOut,
)
from app.services import embeddings as emb_service
from app.services.ai_tag_suggester import suggest_tags_for_day
from app.services.journal_summarizer import summarize_day as ai_summarize_day
from app.services.seed import mood_valence_map

router = APIRouter(prefix="/api/v1/journal", tags=["journal"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _get_or_create_day(db: Session, d: date_cls) -> JournalDay:
    day = db.get(JournalDay, d)
    if day is None:
        day = JournalDay(date=d, mood_codes=[], tags=[])
        db.add(day)
        db.commit()
        db.refresh(day)
    return day


def _avg_valence(codes: list[str], valence_map: dict[str, int]) -> float | None:
    vals = [valence_map[c] for c in codes if c in valence_map]
    if not vals:
        return None
    return sum(vals) / len(vals)


# ---------------------------------------------------------------------------
# Reference endpoints
# ---------------------------------------------------------------------------
@router.get("/moods", response_model=list[MoodCodeOut])
def list_moods(db: Session = Depends(get_db)):
    return db.query(MoodCode).order_by(MoodCode.sort_order).all()


@router.get("/tags", response_model=list[TagOut])
def list_tags(db: Session = Depends(get_db)):
    return db.query(Tag).order_by(Tag.seeded.desc(), Tag.name).all()


# ---------------------------------------------------------------------------
# Calendar
# ---------------------------------------------------------------------------
@router.get("/calendar", response_model=CalendarOut)
def calendar(
    start: date_cls = Query(..., description="Inclusive start date (YYYY-MM-DD)"),
    end: date_cls = Query(..., description="Inclusive end date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    if end < start:
        raise HTTPException(400, "end must be >= start")
    if (end - start).days > 400:
        raise HTTPException(400, "range too large (>400 days)")

    valence_map = mood_valence_map(db)

    days = (
        db.query(JournalDay)
        .filter(JournalDay.date >= start, JournalDay.date <= end)
        .all()
    )
    day_map = {d.date: d for d in days}

    entry_counts: dict[date_cls, int] = {}
    for d in days:
        entry_counts[d.date] = len(d.entries)

    cells: list[CalendarCell] = []
    cur = start
    while cur <= end:
        d = day_map.get(cur)
        if d is None:
            cells.append(
                CalendarCell(
                    date=cur,
                    mood_codes=[],
                    valence_avg=None,
                    entry_count=0,
                    has_summary=False,
                )
            )
        else:
            cells.append(
                CalendarCell(
                    date=cur,
                    mood_codes=d.mood_codes,
                    valence_avg=_avg_valence(d.mood_codes, valence_map),
                    entry_count=entry_counts.get(cur, 0),
                    has_summary=d.has_summary,
                )
            )
        cur += timedelta(days=1)

    return CalendarOut(start=start, end=end, cells=cells)


# ---------------------------------------------------------------------------
# Stats (left-column widgets: streaks, mood sparkline, tag cloud)
# ---------------------------------------------------------------------------
@router.get("/stats", response_model=StatsOut)
def stats(
    days: int = Query(30, ge=7, le=365, description="Window size in days"),
    db: Session = Depends(get_db),
):
    today = date_cls.today()
    start = today - timedelta(days=days - 1)

    valence_map = mood_valence_map(db)

    # Pull all days in the window in one query.
    day_rows = (
        db.query(JournalDay)
        .filter(JournalDay.date >= start, JournalDay.date <= today)
        .all()
    )
    by_date: dict[date_cls, JournalDay] = {d.date: d for d in day_rows}

    # Build daily_valence + entry_count series, filling gaps with null.
    daily: list[DailyValencePoint] = []
    active_days = 0
    total_entries = 0
    cur = start
    while cur <= today:
        d = by_date.get(cur)
        if d is None:
            daily.append(DailyValencePoint(date=cur, valence_avg=None, entry_count=0))
        else:
            n = len(d.entries)
            if n > 0:
                active_days += 1
                total_entries += n
            daily.append(
                DailyValencePoint(
                    date=cur,
                    valence_avg=_avg_valence(d.mood_codes, valence_map),
                    entry_count=n,
                )
            )
        cur += timedelta(days=1)

    # Current streak — count back from today while there are entries.
    current_streak = 0
    probe = today
    while probe >= start:
        d = by_date.get(probe)
        if d and len(d.entries) > 0:
            current_streak += 1
            probe -= timedelta(days=1)
        else:
            break

    # Longest streak inside the window.
    longest = 0
    run = 0
    for p in daily:
        if p.entry_count > 0:
            run += 1
            if run > longest:
                longest = run
        else:
            run = 0

    # Top tags in the window.
    tag_counts: dict[str, int] = {}
    for d in day_rows:
        for name in d.tags or []:
            tag_counts[name] = tag_counts.get(name, 0) + 1
    top_tags = [
        TagCount(name=name, count=cnt)
        for name, cnt in sorted(
            tag_counts.items(), key=lambda kv: (-kv[1], kv[0])
        )[:20]
    ]

    return StatsOut(
        window_days=days,
        current_streak=current_streak,
        longest_streak_in_window=longest,
        active_days=active_days,
        total_entries=total_entries,
        daily_valence=daily,
        top_tags=top_tags,
    )


# ---------------------------------------------------------------------------
# Days
# ---------------------------------------------------------------------------
@router.get("/days/{d}", response_model=DayOut)
def get_day(d: date_cls, db: Session = Depends(get_db)):
    day = _get_or_create_day(db, d)
    return _serialize_day(day)


@router.patch("/days/{d}", response_model=DayOut)
def patch_day(d: date_cls, patch: DayPatch, db: Session = Depends(get_db)):
    day = _get_or_create_day(db, d)

    if patch.mood_codes is not None:
        # validate against the 12-palette
        valid = {m.code for m in db.query(MoodCode).all()}
        for code in patch.mood_codes:
            if code not in valid:
                raise HTTPException(400, f"Unknown mood code: {code}")
        day.mood_codes = patch.mood_codes

    if patch.tags is not None:
        # Auto-create any new tag names as non-seeded entries.
        cleaned = [t.strip().lower() for t in patch.tags if t.strip()]
        existing = {t.name for t in db.query(Tag).filter(Tag.name.in_(cleaned)).all()}
        for name in cleaned:
            if name not in existing:
                db.add(Tag(name=name, seeded=False))
        day.tags = cleaned

    for field in (
        "summary_highlights",
        "summary_wins",
        "summary_learnings",
        "summary_gratitude",
    ):
        val = getattr(patch, field)
        if val is not None:
            setattr(day, field, val or None)

    db.commit()
    db.refresh(day)
    return _serialize_day(day)


# ---------------------------------------------------------------------------
# Entries
# ---------------------------------------------------------------------------
@router.post("/days/{d}/entries", response_model=EntryOut, status_code=201)
async def create_entry(d: date_cls, payload: EntryIn, db: Session = Depends(get_db)):
    _get_or_create_day(db, d)
    entry = JournalEntry(
        day_date=d,
        content_json=payload.content_json,
        content_text=payload.content_text,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    await emb_service.reembed_source(
        db,
        source_type="journal_entry",
        source_id=entry.id,
        text_content=payload.content_text,
    )
    return entry


@router.put("/entries/{entry_id}", response_model=EntryOut)
async def update_entry(entry_id: str, payload: EntryIn, db: Session = Depends(get_db)):
    entry = db.get(JournalEntry, entry_id)
    if entry is None:
        raise HTTPException(404, "Entry not found")
    entry.content_json = payload.content_json
    entry.content_text = payload.content_text
    db.commit()
    db.refresh(entry)

    await emb_service.reembed_source(
        db,
        source_type="journal_entry",
        source_id=entry.id,
        text_content=payload.content_text,
    )
    return entry


@router.delete("/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: str, db: Session = Depends(get_db)):
    entry = db.get(JournalEntry, entry_id)
    if entry is None:
        raise HTTPException(404, "Entry not found")
    db.delete(entry)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# AI tag suggestions (day-level)
# ---------------------------------------------------------------------------
@router.post("/days/{d}/suggest-tags", response_model=TagSuggestionOut)
async def suggest_tags_for_day_endpoint(d: date_cls, db: Session = Depends(get_db)):
    """Suggest tags for the whole day — reads moods + existing tags + summary
    + all entries and asks the LLM for 3–5 topic tags. Transient (not saved)."""
    day = _get_or_create_day(db, d)

    # Resolve mood codes → labels so the model gets semantic context.
    label_by_code: dict[str, str] = {
        m.code: m.label for m in db.query(MoodCode).all()
    }
    mood_labels = [
        label_by_code.get(code, code).lower() for code in (day.mood_codes or [])
    ]

    summary = {
        "highlights": day.summary_highlights,
        "wins": day.summary_wins,
        "learnings": day.summary_learnings,
        "gratitude": day.summary_gratitude,
    }
    entry_texts = [e.content_text for e in day.entries if (e.content_text or "").strip()]

    tags, model, reason, raw = await suggest_tags_for_day(
        db,
        mood_labels=mood_labels,
        existing_tags=day.tags or [],
        summary=summary,
        entry_texts=entry_texts,
    )
    return TagSuggestionOut(suggestions=tags, model=model, reason=reason, raw=raw)


# ---------------------------------------------------------------------------
# AI daily summary (auto-fill the 4 structured fields)
# ---------------------------------------------------------------------------
@router.post("/days/{d}/summarize", response_model=DayOut)
async def summarize_day_endpoint(d: date_cls, db: Session = Depends(get_db)):
    """Ask the LLM to fill in highlights / wins / learnings / gratitude from
    today's entries + moods. Overwrites existing summary fields. Gracefully
    returns the unchanged day if LM Studio is offline."""
    day = _get_or_create_day(db, d)

    label_by_code: dict[str, str] = {
        m.code: m.label for m in db.query(MoodCode).all()
    }
    mood_labels = [
        label_by_code.get(c, c).lower() for c in (day.mood_codes or [])
    ]
    entry_texts = [
        e.content_text for e in day.entries if (e.content_text or "").strip()
    ]

    summary = await ai_summarize_day(
        mood_labels=mood_labels,
        tags=day.tags or [],
        entry_texts=entry_texts,
    )

    # Write all four fields (AI returns None for missing areas).
    day.summary_highlights = summary["highlights"]
    day.summary_wins = summary["wins"]
    day.summary_learnings = summary["learnings"]
    day.summary_gratitude = summary["gratitude"]
    db.commit()
    db.refresh(day)
    return _serialize_day(day)


# ---------------------------------------------------------------------------
# Semantic search over embedded journal entries
# ---------------------------------------------------------------------------
@router.post("/search", response_model=list[JournalSearchResult])
async def search_journal(body: JournalSearchRequest, db: Session = Depends(get_db)):
    """Embed the query and run KNN against stored journal entry embeddings.

    Returns up to `limit` results ordered by cosine similarity. Falls back to
    an empty list if sqlite-vec is unavailable or LM Studio is offline.
    """
    import struct

    from sqlalchemy import text as sa_text

    from app.services import llm_client
    from app.services.llm_client import LLMError

    # 1. Embed the query.
    try:
        vectors = await llm_client.embed([body.query])
        query_vec = struct.pack(f"<{len(vectors[0])}f", *vectors[0])
    except LLMError:
        return []

    # 2. KNN in vec_embeddings → join to embeddings metadata.
    try:
        rows = db.execute(
            sa_text(
                """
                SELECT e.source_id, e.chunk_text, ve.distance
                FROM vec_embeddings ve
                JOIN embeddings e ON ve.rowid = e.id
                WHERE ve.embedding MATCH :vec AND k = :k
                  AND e.source_type = 'journal_entry'
                ORDER BY ve.distance
                """
            ),
            {"vec": query_vec, "k": body.limit * 2},  # oversample, filter below
        ).all()
    except Exception as exc:  # vec table may not exist
        import logging
        logging.getLogger(__name__).warning("journal search failed: %s", exc)
        return []

    # 3. Resolve entry → day and build results (deduplicate by entry_id).
    seen: set[str] = set()
    results: list[JournalSearchResult] = []
    for source_id, chunk_text, distance in rows:
        if source_id in seen:
            continue
        seen.add(source_id)
        entry = db.get(JournalEntry, source_id)
        if entry is None:
            continue
        results.append(
            JournalSearchResult(
                entry_id=source_id,
                day_date=entry.day_date,
                snippet=(chunk_text or "").strip()[:300],
                score=round(1 - distance, 4),
            )
        )
        if len(results) >= body.limit:
            break

    return results


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------
def _serialize_day(day: JournalDay) -> DayOut:
    return DayOut(
        date=day.date,
        mood_codes=day.mood_codes or [],
        tags=day.tags or [],
        summary_highlights=day.summary_highlights,
        summary_wins=day.summary_wins,
        summary_learnings=day.summary_learnings,
        summary_gratitude=day.summary_gratitude,
        has_summary=day.has_summary,
        entries=[EntryOut.model_validate(e) for e in day.entries],
        created_at=day.created_at,
        updated_at=day.updated_at,
    )
