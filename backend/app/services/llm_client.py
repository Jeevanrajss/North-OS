"""LLM client — speaks the OpenAI-compatible API (LM Studio / Ollama / any
OpenAI-compatible server).

LM Studio exposes this API by default at http://127.0.0.1:1234/v1. We use
/v1/chat/completions for text generation and /v1/embeddings for vectors.
"""
from __future__ import annotations

from typing import Any

import httpx

from app.config import get_settings

settings = get_settings()


class LLMError(RuntimeError):
    pass


def _purpose_to_model(purpose: str) -> str:
    mapping = {
        "chat": settings.llm_chat_model,
        "insights": settings.llm_chat_model,
        "summary": settings.llm_chat_model,
        "categorize": settings.llm_fast_model,
        "parse": settings.llm_fast_model,
        "embed": settings.llm_embed_model,
    }
    return mapping.get(purpose, settings.llm_chat_model)


async def _complete(
    payload: dict[str, Any],
    *,
    messages_no_system: list[dict[str, str]],
    system: str | None,
    max_tokens: int,
) -> str:
    """Post to /v1/chat/completions, retrying once when Gemma returns empty content.

    Gemma 4 is a reasoning model: it spends tokens on internal reasoning_content
    before producing content. Two failure modes handled here:

    1. finish_reason="length" — all tokens consumed by reasoning, no room left
       for the actual reply. Fix: retry with 5x tokens (capped at 4096).
    2. Empty content without a length hit — system-prompt aversion. Fix: merge
       the system content into the first user message so the model sees it as
       a single turn.
    """
    async with httpx.AsyncClient(timeout=300) as client:
        try:
            r = await client.post(
                f"{settings.llm_host}/v1/chat/completions", json=payload
            )
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise LLMError(f"LLM request failed: {e}") from e

    data = r.json()
    try:
        choice = data["choices"][0]
        content = choice["message"]["content"].strip()
        finish_reason = choice.get("finish_reason", "")
    except (KeyError, IndexError) as e:
        raise LLMError(f"Unexpected LLM response shape: {data}") from e

    if content == "":
        # Build retry messages: merge system into first user turn.
        if system:
            retry_messages: list[dict[str, str]] = []
            merged = False
            for msg in messages_no_system:
                if msg["role"] == "user" and not merged:
                    retry_messages.append(
                        {"role": "user", "content": f"{system}\n\n{msg['content']}"}
                    )
                    merged = True
                else:
                    retry_messages.append(msg)
        else:
            retry_messages = messages_no_system

        boosted = min(max_tokens * 5, 4096) if finish_reason == "length" else max_tokens
        retry_payload = {**payload, "messages": retry_messages, "max_tokens": boosted}

        async with httpx.AsyncClient(timeout=300) as client:
            try:
                r2 = await client.post(
                    f"{settings.llm_host}/v1/chat/completions", json=retry_payload
                )
                r2.raise_for_status()
            except httpx.HTTPError as e:
                raise LLMError(f"LLM retry failed: {e}") from e

        data2 = r2.json()
        try:
            content = data2["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError):
            pass

    return content


async def generate(
    prompt: str,
    *,
    purpose: str = "chat",
    system: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 1024,
) -> str:
    """One-shot text generation via /v1/chat/completions. Returns the text."""
    model = _purpose_to_model(purpose)

    messages_no_system: list[dict[str, str]] = [{"role": "user", "content": prompt}]
    full_messages: list[dict[str, str]] = []
    if system:
        full_messages.append({"role": "system", "content": system})
    full_messages.extend(messages_no_system)

    payload: dict[str, Any] = {
        "model": model,
        "messages": full_messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }

    return await _complete(
        payload,
        messages_no_system=messages_no_system,
        system=system,
        max_tokens=max_tokens,
    )


async def chat(
    messages: list[dict[str, str]],
    *,
    system: str | None = None,
    temperature: float = 0.5,
    max_tokens: int = 800,
) -> str:
    """Multi-turn chat. messages = [{role, content}, ...]. Returns assistant reply."""
    model = _purpose_to_model("chat")

    full_messages: list[dict[str, str]] = []
    if system:
        full_messages.append({"role": "system", "content": system})
    full_messages.extend(messages)

    payload: dict[str, Any] = {
        "model": model,
        "messages": full_messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }

    return await _complete(
        payload,
        messages_no_system=messages,
        system=system,
        max_tokens=max_tokens,
    )


async def embed(texts: list[str]) -> list[list[float]]:
    """Embed one or many texts via /v1/embeddings. Returns a list of vectors."""
    if not texts:
        return []

    payload = {
        "model": settings.llm_embed_model,
        "input": texts,
    }

    async with httpx.AsyncClient(timeout=120) as client:
        try:
            r = await client.post(f"{settings.llm_host}/v1/embeddings", json=payload)
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise LLMError(f"Embedding request failed: {e}") from e

    data = r.json()
    try:
        return [item["embedding"] for item in data["data"]]
    except (KeyError, TypeError) as e:
        raise LLMError(f"Unexpected embeddings response: {data}") from e


async def list_models() -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(f"{settings.llm_host}/v1/models")
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise LLMError(f"Cannot reach LLM server: {e}") from e
    return r.json().get("data", [])


async def health() -> dict[str, Any]:
    try:
        models = await list_models()
        names = [m.get("id") for m in models]
        return {
            "ok": True,
            "provider": settings.llm_provider,
            "host": settings.llm_host,
            "chat_model": settings.llm_chat_model,
            "fast_model": settings.llm_fast_model,
            "embed_model": settings.llm_embed_model,
            "models_available": names,
            "chat_loaded": settings.llm_chat_model in names,
            "embed_loaded": settings.llm_embed_model in names,
        }
    except LLMError as e:
        return {
            "ok": False,
            "provider": settings.llm_provider,
            "host": settings.llm_host,
            "error": str(e),
        }
