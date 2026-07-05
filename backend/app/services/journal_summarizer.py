"""AI service — extract a structured daily summary from journal content.

Generates four optional fields (highlights / wins / learnings / gratitude)
from the day's entries, moods, and tags. Never raises — returns all-None on
any LLM failure so the endpoint degrades gracefully when LM Studio is offline.
"""
from __future__ import annotations

import json
import logging
import re

from app.services import llm_client
from app.services.llm_client import LLMError

log = logging.getLogger(__name__)

_SYSTEM = """You extract structured daily reflections from a personal journal.

Output ONLY valid JSON — no prose, no code fences, nothing else:
{
  "highlights": "1–2 sentences: most significant moment or theme today",
  "wins": "1–2 sentences: accomplishments or things that went well",
  "learnings": "1–2 sentences: lessons, realizations, or new insights",
  "gratitude": "1–2 sentences: what the person seems grateful for"
}

If an area is not covered in the content, set that key to null.
Be specific and concise. Mirror the person's own words where possible."""

_EMPTY: dict[str, str | None] = {
    "highlights": None,
    "wins": None,
    "learnings": None,
    "gratitude": None,
}


def _parse(raw: str) -> dict[str, str | None]:
    text = (raw or "").strip()
    # Strip ```json ... ``` fences.
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```\s*$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    # Find the first {...} block.
    m = re.search(r"\{.*?\}", text, re.DOTALL)
    if not m:
        log.warning("summarizer: no JSON found. raw=%r", raw[:200])
        return dict(_EMPTY)
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        log.warning("summarizer: JSON decode error. raw=%r", raw[:200])
        return dict(_EMPTY)
    return {
        k: (str(data[k]).strip() or None) if data.get(k) else None
        for k in ("highlights", "wins", "learnings", "gratitude")
    }


async def summarize_day(
    *,
    mood_labels: list[str],
    tags: list[str],
    entry_texts: list[str],
    user_id: str = "",
) -> dict[str, str | None]:
    """Generate a structured day summary dict. Never raises."""
    total = sum(len((t or "").strip()) for t in entry_texts)
    if total < 10 and not mood_labels and not tags:
        return dict(_EMPTY)

    lines: list[str] = []
    if mood_labels:
        lines.append(f"Moods today: {', '.join(mood_labels)}")
    if tags:
        lines.append(f"Topics/tags: {', '.join(tags)}")
    if entry_texts:
        lines.append(f"\nJournal entries ({len(entry_texts)}):")
        for i, text in enumerate(entry_texts, 1):
            clipped = text.strip()[:1500]
            lines.append(f"--- Entry {i} ---\n{clipped}")
    else:
        lines.append("\nEntries: (none written today)")

    try:
        raw = await llm_client.generate(
            "\n".join(lines),
            purpose="summary",
            system=_SYSTEM,
            temperature=0.35,
            max_tokens=450,
            user_id=user_id,
        )
    except LLMError as e:
        log.warning("summarizer: LLM error: %s", e)
        return dict(_EMPTY)

    return _parse(raw)
