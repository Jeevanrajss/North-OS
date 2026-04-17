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

    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=180) as client:
        try:
            r = await client.post(
                f"{settings.llm_host}/v1/chat/completions", json=payload
            )
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise LLMError(f"LLM request failed: {e}") from e

    data = r.json()
    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError) as e:
        raise LLMError(f"Unexpected LLM response shape: {data}") from e


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
