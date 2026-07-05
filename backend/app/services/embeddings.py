"""Embedding pipeline.

Week 2 scope: on every journal_entry save, we chunk the plain text, embed each
chunk via LM Studio, and insert (id, vector) into sqlite-vec. No search
endpoint yet — that ships Week 5 with the unified AI layer.

Failures are logged, not raised. The journal entry save should NEVER fail just
because LM Studio is slow / unloaded — embeddings are a side-effect.
"""
from __future__ import annotations

import logging
import struct

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.journal import Embedding
from app.services import llm_client

log = logging.getLogger(__name__)

# Conservative default — nomic embeds at 768. Tune if you swap embedders.
EMBEDDING_DIM = 768

# Chunk boundaries. Journal entries are typically short, so we keep chunks
# small and overlap minimal. Measured in characters (approx ~4 chars/token).
CHUNK_CHARS = 1200
CHUNK_OVERLAP = 120


def chunk_text(s: str) -> list[str]:
    s = (s or "").strip()
    if not s:
        return []
    if len(s) <= CHUNK_CHARS:
        return [s]
    chunks: list[str] = []
    i = 0
    while i < len(s):
        chunks.append(s[i : i + CHUNK_CHARS])
        i += CHUNK_CHARS - CHUNK_OVERLAP
    return chunks


def _pack_vector(vec: list[float]) -> bytes:
    """sqlite-vec accepts f32 little-endian blobs."""
    return struct.pack(f"<{len(vec)}f", *vec)


async def reembed_source(
    db: Session,
    *,
    source_type: str,
    source_id: str,
    text_content: str,
    user_id: str = "",
) -> int:
    """Delete any existing embeddings for (source_type, source_id) and re-insert.

    Returns the number of chunks embedded. Catches and logs LLM errors so a
    save never fails on LLM unavailability.
    """
    chunks = chunk_text(text_content)

    # Delete any prior embeddings for this source (metadata + vec rows).
    prior_ids = [
        row[0]
        for row in db.execute(
            text(
                "SELECT id FROM embeddings WHERE source_type = :t AND source_id = :i"
            ),
            {"t": source_type, "i": source_id},
        )
    ]
    if prior_ids:
        placeholders = ",".join(str(i) for i in prior_ids)
        db.execute(text(f"DELETE FROM embeddings WHERE id IN ({placeholders})"))
        db.execute(text(f"DELETE FROM vec_embeddings WHERE rowid IN ({placeholders})"))
        db.commit()

    if not chunks:
        return 0

    try:
        vectors = await llm_client.embed(chunks, user_id=user_id)
    except llm_client.LLMError as e:
        log.warning("Embedding skipped for %s:%s — %s", source_type, source_id, e)
        return 0

    if len(vectors) != len(chunks):
        log.warning(
            "Embedding count mismatch: got %d vectors for %d chunks",
            len(vectors),
            len(chunks),
        )
        return 0

    for idx, (chunk, vec) in enumerate(zip(chunks, vectors, strict=False)):
        emb = Embedding(
            source_type=source_type,
            source_id=source_id,
            chunk_index=idx,
            chunk_text=chunk,
        )
        db.add(emb)
        db.flush()  # populates emb.id

        try:
            db.execute(
                text(
                    "INSERT INTO vec_embeddings(rowid, embedding) VALUES (:id, :vec)"
                ),
                {"id": emb.id, "vec": _pack_vector(vec)},
            )
        except Exception as e:
            log.warning("vec insert failed for emb id=%s: %s", emb.id, e)

    db.commit()
    return len(chunks)
