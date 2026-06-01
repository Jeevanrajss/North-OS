"""LLM client — supports local (LM Studio / Ollama) and cloud providers
(OpenAI, Anthropic/Claude, Google Gemini, Groq, Together, Mistral, custom).

Configuration is loaded from the settings DB at runtime (cached 60 s) and
falls back to .env values if the DB has no AI settings yet.

Supported providers
-------------------
- local      LM Studio / Ollama / any OpenAI-compatible local server
- openai     api.openai.com
- anthropic  api.anthropic.com  (different request/response format)
- google     Gemini via OpenAI-compat endpoint
- groq       api.groq.com
- together   api.together.xyz
- mistral    api.mistral.ai
- custom     user-supplied base URL + optional API key
"""
from __future__ import annotations

import time
from typing import Any

import httpx

from app.config import get_settings

_env = get_settings()

# ---------------------------------------------------------------------------
# Runtime config cache — refreshed from DB every 60 s
# ---------------------------------------------------------------------------
_cache: dict[str, str] | None = None
_cache_ts: float = 0.0
_CACHE_TTL = 60.0


def _env_defaults() -> dict[str, str]:
    return {
        "provider": _env.llm_provider or "local",
        "api_base": f"{_env.llm_host}/v1",
        "api_key": "",
        "chat_model": _env.llm_chat_model,
        "fast_model": _env.llm_fast_model,
        "embed_model": _env.llm_embed_model,
        "is_anthropic": "false",
    }


def _load_config() -> dict[str, str]:
    global _cache, _cache_ts
    now = time.monotonic()
    if _cache is not None and (now - _cache_ts) < _CACHE_TTL:
        return _cache

    try:
        from app.db import SessionLocal
        from app.models.setting import Setting as SettingModel

        with SessionLocal() as db:
            rows = db.query(SettingModel).filter(
                SettingModel.key.like("ai.%")
            ).all()
            if rows:
                cfg = {r.key[3:]: (r.value or "") for r in rows}  # strip "ai." prefix
                # Fill missing keys from env defaults
                defaults = _env_defaults()
                for k, v in defaults.items():
                    cfg.setdefault(k, v)
                _cache = cfg
                _cache_ts = now
                return _cache
    except Exception:
        pass  # DB not ready yet (first boot) — fall back silently

    _cache = _env_defaults()
    _cache_ts = now
    return _cache


def invalidate_config_cache() -> None:
    """Called by the settings router after saving new AI config."""
    global _cache_ts
    _cache_ts = 0.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
class LLMError(RuntimeError):
    pass


def _get_headers(cfg: dict[str, str]) -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    api_key = cfg.get("api_key", "").strip()
    if not api_key:
        return headers
    if cfg.get("is_anthropic") == "true":
        headers["x-api-key"] = api_key
        headers["anthropic-version"] = "2023-06-01"
    else:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _chat_url(cfg: dict[str, str]) -> str:
    base = cfg.get("api_base", "").rstrip("/")
    if cfg.get("is_anthropic") == "true":
        return f"{base}/v1/messages"
    return f"{base}/chat/completions"


def _purpose_to_model(cfg: dict[str, str], purpose: str) -> str:
    mapping = {
        "chat": cfg.get("chat_model", ""),
        "insights": cfg.get("chat_model", ""),
        "summary": cfg.get("chat_model", ""),
        "categorize": cfg.get("fast_model", "") or cfg.get("chat_model", ""),
        "parse": cfg.get("fast_model", "") or cfg.get("chat_model", ""),
    }
    return mapping.get(purpose, cfg.get("chat_model", ""))


# ---------------------------------------------------------------------------
# Anthropic adapter
# ---------------------------------------------------------------------------
async def _complete_anthropic(
    messages_no_system: list[dict[str, str]],
    system: str | None,
    model: str,
    temperature: float,
    max_tokens: int,
    cfg: dict[str, str],
) -> str:
    """POST to /v1/messages (Anthropic format)."""
    base = cfg.get("api_base", "https://api.anthropic.com").rstrip("/")
    url = f"{base}/v1/messages"
    headers = _get_headers(cfg)

    payload: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": messages_no_system,
    }
    if system:
        payload["system"] = system

    async with httpx.AsyncClient(timeout=300) as client:
        try:
            r = await client.post(url, json=payload, headers=headers)
            r.raise_for_status()
        except httpx.ConnectError as e:
            raise LLMError(
                f"Cannot reach Anthropic at {base}. Check your internet connection."
            ) from e
        except httpx.ConnectTimeout as e:
            raise LLMError(
                f"Connection to {base} timed out. Check your internet connection."
            ) from e
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            if status in (401, 403):
                raise LLMError(
                    f"API key rejected ({status}). Open Settings → AI Provider and check your Anthropic key."
                ) from e
            elif status == 404:
                raise LLMError(
                    f"Model '{model}' not found (404). Check the model name in Settings."
                ) from e
            elif status == 503:
                raise LLMError(
                    "Anthropic is temporarily unavailable (503). Try again in a moment."
                ) from e
            else:
                raise LLMError(f"Anthropic API error {status}: {e.response.text}") from e
        except httpx.HTTPError as e:
            raise LLMError(f"Anthropic request failed: {e}") from e

    data = r.json()
    try:
        return data["content"][0]["text"].strip()
    except (KeyError, IndexError) as e:
        raise LLMError(f"Unexpected Anthropic response shape: {data}") from e


# ---------------------------------------------------------------------------
# OpenAI-compatible completion (with Gemma retry logic)
# ---------------------------------------------------------------------------
async def _complete(
    payload: dict[str, Any],
    *,
    messages_no_system: list[dict[str, str]],
    system: str | None,
    max_tokens: int,
    cfg: dict[str, str],
) -> str:
    """POST to /chat/completions (OpenAI-compat).

    Handles two Gemma 4 failure modes:
    1. finish_reason="length" — reasoning exhausted all tokens → retry 5x.
    2. Empty content without length — system-prompt aversion → merge system
       into first user message.
    """
    url = _chat_url(cfg)
    headers = _get_headers(cfg)

    async with httpx.AsyncClient(timeout=300) as client:
        try:
            r = await client.post(url, json=payload, headers=headers)
            r.raise_for_status()
        except httpx.ConnectError as e:
            host = cfg.get("api_base", url)
            raise LLMError(
                f"Cannot reach LLM server at {host}. "
                "Make sure it is running and reachable from this machine. "
                "For LM Studio/Ollama on the same computer use http://127.0.0.1:1234/v1"
            ) from e
        except httpx.ConnectTimeout as e:
            host = cfg.get("api_base", url)
            raise LLMError(
                f"Connection to {host} timed out. "
                "Check the host address and that no firewall is blocking the port."
            ) from e
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            if status in (401, 403):
                raise LLMError(
                    f"API key rejected ({status}). "
                    "Open Settings → AI Provider and check your API key."
                ) from e
            elif status == 404:
                model_name = payload.get("model", cfg.get("chat_model", ""))
                raise LLMError(
                    f"Model '{model_name}' not found (404). "
                    "Check the model name in Settings → AI Provider."
                ) from e
            elif status == 503:
                raise LLMError(
                    "LLM server returned 503 — it may be busy or still loading a model. "
                    "Try again in a moment."
                ) from e
            else:
                raise LLMError(f"LLM API error {status}: {e.response.text}") from e
        except httpx.HTTPError as e:
            raise LLMError(f"LLM request failed: {e}") from e

    data = r.json()
    try:
        choice = data["choices"][0]
        msg = choice["message"]
        content = (msg.get("content") or "").strip()
        finish_reason = choice.get("finish_reason", "")
    except (KeyError, IndexError) as e:
        raise LLMError(f"Unexpected LLM response shape: {data}") from e

    if content == "":
        # ── Retry strategy ───────────────────────────────────────────────────
        # 1. Qwen3/DeepSeek thinking models: content is empty because all tokens
        #    went to reasoning_content. Retry with enable_thinking=false so the
        #    model skips the thinking phase and answers directly.
        # 2. Other models: merge system prompt into user turn (avoids system-
        #    prompt aversion) and boost token count if we hit finish_reason=length.

        if system:
            retry_messages: list[dict[str, str]] = []
            merged = False
            for m in messages_no_system:
                if m["role"] == "user" and not merged:
                    retry_messages.append(
                        {"role": "user", "content": f"{system}\n\n{m['content']}"}
                    )
                    merged = True
                else:
                    retry_messages.append(m)
        else:
            retry_messages = messages_no_system

        boosted = min(max_tokens * 4, 8192) if finish_reason == "length" else max_tokens
        retry_payload = {
            **payload,
            "messages": retry_messages,
            "max_tokens": boosted,
            # Disable Qwen3 / DeepSeek-R1 style thinking — answer directly.
            # LM Studio and Ollama pass unknown keys through harmlessly for other models.
            "enable_thinking": False,
            "thinking": {"type": "disabled"},  # Anthropic-style thinking disable (ignored otherwise)
        }

        async with httpx.AsyncClient(timeout=300) as client:
            try:
                r2 = await client.post(url, json=retry_payload, headers=headers)
                r2.raise_for_status()
            except httpx.HTTPError as e:
                raise LLMError(f"LLM retry failed: {e}") from e

        data2 = r2.json()
        try:
            msg2 = data2["choices"][0]["message"]
            content = (msg2.get("content") or "").strip()
        except (KeyError, IndexError):
            pass

    # Strip leading/trailing whitespace — Qwen3 adds \n\n before the answer
    return content.strip()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
async def generate(
    prompt: str,
    *,
    purpose: str = "chat",
    system: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,  # Qwen3 thinking models need this much to think + answer
) -> str:
    cfg = _load_config()
    model = _purpose_to_model(cfg, purpose)

    messages_no_system: list[dict[str, str]] = [{"role": "user", "content": prompt}]

    if cfg.get("is_anthropic") == "true":
        return await _complete_anthropic(
            messages_no_system, system, model, temperature, max_tokens, cfg
        )

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
        # Disable Qwen3-style thinking mode on the first attempt.
        # Other models ignore this key harmlessly.
        "enable_thinking": False,
    }
    return await _complete(
        payload,
        messages_no_system=messages_no_system,
        system=system,
        max_tokens=max_tokens,
        cfg=cfg,
    )


async def chat(
    messages: list[dict[str, str]],
    *,
    system: str | None = None,
    temperature: float = 0.5,
    max_tokens: int = 4096,  # Qwen3 thinking models need this much to think + answer
) -> str:
    cfg = _load_config()
    model = _purpose_to_model(cfg, "chat")

    if cfg.get("is_anthropic") == "true":
        return await _complete_anthropic(
            messages, system, model, temperature, max_tokens, cfg
        )

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
        "enable_thinking": False,  # disable Qwen3 thinking mode
    }
    return await _complete(
        payload,
        messages_no_system=messages,
        system=system,
        max_tokens=max_tokens,
        cfg=cfg,
    )


async def embed(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []

    cfg = _load_config()
    embed_model = cfg.get("embed_model", "").strip()
    if not embed_model:
        raise LLMError("No embedding model configured.")

    # Anthropic has no embeddings API — callers should guard against this
    if cfg.get("is_anthropic") == "true":
        raise LLMError("Anthropic does not provide an embeddings API.")

    base = cfg.get("api_base", "").rstrip("/")
    url = f"{base}/embeddings"
    headers = _get_headers(cfg)

    payload = {"model": embed_model, "input": texts}

    async with httpx.AsyncClient(timeout=120) as client:
        try:
            r = await client.post(url, json=payload, headers=headers)
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise LLMError(f"Embedding request failed: {e}") from e

    data = r.json()
    try:
        return [item["embedding"] for item in data["data"]]
    except (KeyError, TypeError) as e:
        raise LLMError(f"Unexpected embeddings response: {data}") from e


async def list_models() -> list[str]:
    """Fetch available model IDs from the provider (OpenAI-compat only)."""
    cfg = _load_config()
    if cfg.get("is_anthropic") == "true":
        from app.schemas.setting import PROVIDER_PRESETS
        return PROVIDER_PRESETS["anthropic"]["suggested_chat"]

    base = cfg.get("api_base", "").rstrip("/")
    url = f"{base}/models"
    headers = _get_headers(cfg)

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(url, headers=headers)
            r.raise_for_status()
        except httpx.ConnectError as e:
            raise LLMError(
                f"Cannot reach LLM server at {base}. "
                "Make sure it is running and reachable from this machine."
            ) from e
        except httpx.ConnectTimeout as e:
            raise LLMError(f"Connection to {base} timed out.") from e
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403):
                raise LLMError("API key rejected. Check your key in Settings → AI Provider.") from e
            raise LLMError(f"LLM server error {e.response.status_code}.") from e
        except httpx.HTTPError as e:
            raise LLMError(f"Cannot reach LLM server: {e}") from e

    return [m.get("id", "") for m in r.json().get("data", [])]


async def quick_health() -> dict[str, Any]:
    """Fast reachability probe (5 s timeout). Used by the Settings UI on load.

    Returns ``ok=True``  when the server answers,
            ``ok=False`` with a human-readable ``error`` when it cannot,
            ``ok=None``  for Anthropic (no cheap probe available — use test-llm).
    """
    cfg = _load_config()
    provider = cfg.get("provider", "local")
    host = cfg.get("api_base", "")

    if cfg.get("is_anthropic") == "true":
        return {
            "ok": None,
            "provider": provider,
            "host": host,
            "models": [],
            "error": None,
            "note": "Use 'Test connection' to verify your Anthropic key.",
        }

    base = host.rstrip("/")
    url = f"{base}/models"
    headers = _get_headers(cfg)

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(url, headers=headers)
            r.raise_for_status()
        models = [m.get("id", "") for m in r.json().get("data", [])]
        return {"ok": True, "provider": provider, "host": host, "models": models, "error": None, "note": None}
    except httpx.ConnectError:
        return {
            "ok": False, "provider": provider, "host": host, "models": [],
            "error": (
                f"Cannot reach {host}. "
                "If using LM Studio or Ollama on this computer, set the URL to "
                "http://127.0.0.1:1234/v1 (LM Studio) or http://127.0.0.1:11434/v1 (Ollama)."
            ),
            "note": None,
        }
    except httpx.ConnectTimeout:
        return {
            "ok": False, "provider": provider, "host": host, "models": [],
            "error": f"Connection to {host} timed out. Check the address and any firewall rules.",
            "note": None,
        }
    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        if status in (401, 403):
            error = "API key rejected. Check your key in Settings → AI Provider."
        else:
            error = f"Server returned {status}."
        return {"ok": False, "provider": provider, "host": host, "models": [], "error": error, "note": None}
    except Exception as e:
        return {"ok": False, "provider": provider, "host": host, "models": [], "error": str(e), "note": None}


async def health() -> dict[str, Any]:
    cfg = _load_config()
    try:
        if cfg.get("is_anthropic") == "true":
            from app.schemas.setting import PROVIDER_PRESETS
            model_names = PROVIDER_PRESETS["anthropic"]["suggested_chat"]
        else:
            model_names = await list_models()

        return {
            "ok": True,
            "provider": cfg.get("provider", "local"),
            "host": cfg.get("api_base", ""),
            "chat_model": cfg.get("chat_model", ""),
            "fast_model": cfg.get("fast_model", ""),
            "embed_model": cfg.get("embed_model", ""),
            "models_available": model_names,
            "chat_loaded": cfg.get("chat_model", "") in model_names,
            "embed_loaded": cfg.get("embed_model", "") in model_names,
        }
    except LLMError as e:
        return {
            "ok": False,
            "provider": cfg.get("provider", "local"),
            "host": cfg.get("api_base", ""),
            "error": str(e),
        }
