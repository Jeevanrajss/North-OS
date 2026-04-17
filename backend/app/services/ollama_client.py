"""DEPRECATED — renamed to `llm_client`. This shim keeps old imports working.
Safe to delete once nothing imports `app.services.ollama_client`.
"""
from app.services.llm_client import (  # noqa: F401
    LLMError,
    LLMError as OllamaError,
    embed,
    generate,
    health,
    list_models,
)
