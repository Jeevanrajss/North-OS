"""AI tag suggester — asks Gemma for 3–5 short topic tags.

Two flavors:
  - ``suggest_tags`` (entry-level): kept for back-compat with older clients.
  - ``suggest_tags_for_day``: reads the full day (moods, tags, summary, all
    entries) and proposes tags for the whole day. This is the current UX.

Transient: we don't persist the suggestions. The frontend shows them as
pending chips; the user clicks accept/reject; accepted tags get added to
the day's ``tags`` via the normal day-patch endpoint.
"""
from __future__ import annotations

import json
import logging
import re

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.journal import Tag
from app.services import llm_client
from app.services.llm_client import LLMError

log = logging.getLogger(__name__)
settings = get_settings()

MAX_SUGGESTIONS = 5

# We used to demand strict JSON; some local models (notably gemma on LM
# Studio) return an empty string when cornered that way. Instead, we ask for
# a simple comma-separated list, which every tiny model handles, and parse
# tolerantly (accept JSON, commas, or newlines).
SYSTEM_PROMPT = """You are a precise tagger for a personal journal.
Read what the person wrote today and output 3 to 5 short, lowercase topic
tags. Each tag is a single word or a short hyphenated phrase (e.g.
"deep-work", "family"). Prefer tags from the allowed list. Only invent a
new tag when nothing in the list fits.

Output ONLY the tags, separated by commas. No prose, no numbering, no
quotes, no explanation. Example: work, meeting, anxiety"""


def _clean_tag(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9\-]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:32]


def _parse_tags(raw: str) -> list[str]:
    """Extract tags from the model's output, accepting several formats.

    Handles, in order of preference:
      1. A JSON array of strings (``["work", "meeting"]``) — legacy behavior.
      2. A comma-separated list (``work, meeting, anxiety``) — current prompt.
      3. A newline-separated list (``- work\\n- meeting``) — fallback.

    Strips code fences, markdown bullets, quotes, numbering, and prose tails.
    """
    text = (raw or "").strip()
    if not text:
        return []

    # Strip ```fence``` wrappers if the model added them.
    fence = re.match(r"^```(?:[a-zA-Z]+)?\s*(.*?)\s*```\s*$", text, flags=re.DOTALL)
    if fence:
        text = fence.group(1).strip()

    candidates: list[str] = []

    # 1. JSON array anywhere in the text.
    m = re.search(r"\[[^\[\]]*\]", text, flags=re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(0))
            if isinstance(data, list):
                candidates = [x for x in data if isinstance(x, str)]
        except json.JSONDecodeError:
            candidates = []

    # 2. If no JSON, try comma-separated on the first non-empty line(s).
    if not candidates:
        # Collapse multiline into a single delimited stream: lines become
        # commas so "- work\n- meeting" and "work, meeting" both parse.
        # Strip leading bullets / numbering from each line first.
        lines = [
            re.sub(r"^[\s\-\*\d\.\)]+", "", ln).strip()
            for ln in text.splitlines()
        ]
        joined = ",".join([ln for ln in lines if ln])
        if "," in joined:
            candidates = joined.split(",")
        elif joined:
            # single-token line
            candidates = [joined]

    out: list[str] = []
    seen: set[str] = set()
    for item in candidates:
        # Strip quotes and surrounding punctuation.
        item = item.strip().strip("\"'`").strip()
        if not item:
            continue
        # If the model appended a prose tail like "work - a good day" or
        # "anxiety. These feel right", keep only the first token-ish chunk.
        item = re.split(r"\s[-–—:]\s|\.\s+", item, maxsplit=1)[0]
        cleaned = _clean_tag(item)
        # A legit tag is at most 3 hyphen-joined words ("deep-work-habits").
        # If it looks like glued prose, drop it.
        if cleaned.count("-") >= 3:
            continue
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            out.append(cleaned)
        if len(out) >= MAX_SUGGESTIONS:
            break
    return out


async def suggest_tags(
    db: Session, entry_text: str, existing_tags: list[str]
) -> tuple[list[str], str, str, str | None]:
    """Suggest tags for an entry.

    Returns (suggestions, model_name, reason, raw_output).
    ``reason`` is a short code describing the outcome so the UI (and humans
    debugging) can see *why* a suggestion list is empty.
    """
    entry_text = (entry_text or "").strip()
    if len(entry_text) < 20:
        return [], settings.llm_chat_model, "too_short", None

    allowed = [t.name for t in db.query(Tag).all()]
    allowed_block = ", ".join(allowed) if allowed else "(none yet)"
    existing_block = ", ".join(existing_tags) if existing_tags else "(none)"

    user_prompt = (
        f"Allowed tags: {allowed_block}\n"
        f"Tags already on today's page: {existing_block}\n\n"
        f"Journal entry:\n\"\"\"\n{entry_text}\n\"\"\"\n\n"
        f"Return the JSON array of tags now."
    )

    try:
        raw = await llm_client.generate(
            user_prompt,
            purpose="categorize",
            system=SYSTEM_PROMPT,
            temperature=0.2,
            max_tokens=120,
        )
    except LLMError as e:
        log.warning("tag suggester failed: %s", e)
        return [], settings.llm_chat_model, "llm_error", str(e)

    raw_trimmed = (raw or "").strip()
    if raw_trimmed == "":
        log.info("tag suggester: empty response from model")
        return [], settings.llm_chat_model, "empty_response", None

    parsed = _parse_tags(raw)
    if not parsed:
        log.info("tag suggester: parse failed. raw=%r", raw_trimmed[:300])
        return [], settings.llm_chat_model, "parse_failed", raw_trimmed[:300]

    existing_set = {t.lower() for t in existing_tags}
    filtered = [t for t in parsed if t not in existing_set]
    if not filtered:
        log.info(
            "tag suggester: all suggestions already on day. parsed=%s existing=%s",
            parsed,
            existing_tags,
        )
        return [], settings.llm_chat_model, "all_existing", raw_trimmed[:300]

    return filtered[:MAX_SUGGESTIONS], settings.llm_chat_model, "ok", raw_trimmed[:300]


# ---------------------------------------------------------------------------
# Day-level tag suggestions — reads moods + existing tags + daily summary +
# all entries for a date, and proposes tags for the whole day.
# ---------------------------------------------------------------------------
def _compose_day_context(
    *,
    mood_labels: list[str],
    existing_tags: list[str],
    summary: dict[str, str | None],
    entry_texts: list[str],
) -> str:
    """Build the user-prompt body with the full day's context."""
    lines: list[str] = []

    if mood_labels:
        lines.append(f"Moods today: {', '.join(mood_labels)}")
    else:
        lines.append("Moods today: (none logged)")

    lines.append(
        f"Tags already on today's page: {', '.join(existing_tags) if existing_tags else '(none)'}"
    )

    summary_bits: list[str] = []
    if summary.get("highlights"):
        summary_bits.append(f"- Highlights: {summary['highlights']}")
    if summary.get("wins"):
        summary_bits.append(f"- Wins: {summary['wins']}")
    if summary.get("learnings"):
        summary_bits.append(f"- Learnings: {summary['learnings']}")
    if summary.get("gratitude"):
        summary_bits.append(f"- Gratitude: {summary['gratitude']}")
    if summary_bits:
        lines.append("Daily summary:")
        lines.extend(summary_bits)

    if entry_texts:
        lines.append(f"Entries ({len(entry_texts)}):")
        for i, text in enumerate(entry_texts, start=1):
            # Cap each entry so a very long day doesn't blow the context window.
            clipped = text.strip()[:1200]
            lines.append(f'--- Entry {i} ---\n"""\n{clipped}\n"""')
    else:
        lines.append("Entries: (none written)")

    return "\n".join(lines)


async def suggest_tags_for_day(
    db: Session,
    *,
    mood_labels: list[str],
    existing_tags: list[str],
    summary: dict[str, str | None],
    entry_texts: list[str],
    user_id: str = "",
) -> tuple[list[str], str, str, str | None]:
    """Suggest tags for a whole day using all available context.

    Returns (suggestions, model_name, reason, raw_output).

    ``mood_labels`` should be human-readable mood labels (e.g. "focused",
    "curious") — not the internal codes — so the model has semantic context.
    """
    # Require *some* signal to suggest from. 20 chars of combined entry text
    # is the same floor as the entry-level suggester used to use.
    combined_len = sum(len((t or "").strip()) for t in entry_texts)
    summary_len = sum(len((v or "").strip()) for v in summary.values())
    if combined_len + summary_len < 20 and not mood_labels:
        return [], settings.llm_chat_model, "too_short", None

    allowed = [t.name for t in db.query(Tag).all()]
    allowed_block = ", ".join(allowed) if allowed else "(none yet)"

    context_block = _compose_day_context(
        mood_labels=mood_labels,
        existing_tags=existing_tags,
        summary=summary,
        entry_texts=entry_texts,
    )

    user_prompt = (
        f"Allowed tags (prefer these): {allowed_block}\n\n"
        f"{context_block}\n\n"
        f"Now output 3 to 5 tags for this whole day, separated by commas. "
        f"Tags only, nothing else."
    )

    try:
        raw = await llm_client.generate(
            user_prompt,
            purpose="categorize",
            system=SYSTEM_PROMPT,
            temperature=0.3,
            max_tokens=200,
            user_id=user_id,
        )
    except LLMError as e:
        log.warning("day tag suggester failed: %s", e)
        return [], settings.llm_chat_model, "llm_error", str(e)

    raw_trimmed = (raw or "").strip()
    if raw_trimmed == "":
        log.info("day tag suggester: empty response from model")
        return [], settings.llm_chat_model, "empty_response", None

    parsed = _parse_tags(raw)
    if not parsed:
        log.info("day tag suggester: parse failed. raw=%r", raw_trimmed[:400])
        return [], settings.llm_chat_model, "parse_failed", raw_trimmed[:400]

    existing_set = {t.lower() for t in existing_tags}
    filtered = [t for t in parsed if t not in existing_set]
    if not filtered:
        log.info(
            "day tag suggester: all suggestions already on day. parsed=%s existing=%s",
            parsed,
            existing_tags,
        )
        return [], settings.llm_chat_model, "all_existing", raw_trimmed[:400]

    return filtered[:MAX_SUGGESTIONS], settings.llm_chat_model, "ok", raw_trimmed[:400]
