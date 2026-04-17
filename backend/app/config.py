"""Runtime settings — loaded from .env."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "Personal OS"
    app_env: str = "dev"
    app_host: str = "127.0.0.1"
    app_port: int = 8000
    timezone: str = "Asia/Kolkata"
    currency: str = "INR"

    # Database
    db_path: str = str(ROOT_DIR / "data" / "personal-os.db")
    db_encryption: bool = True  # SQLCipher on by default
    db_passphrase: str = "change-me-in-dotenv"

    # LLM server — LM Studio by default, but any OpenAI-compatible endpoint works
    # (Ollama with /v1 compatibility, OpenAI, vLLM, llama.cpp server, etc.)
    llm_provider: str = "lmstudio"
    llm_host: str = "http://127.0.0.1:1234"
    llm_chat_model: str = "google/gemma-4-e4b"
    llm_fast_model: str = "google/gemma-4-e4b"  # Same as chat unless you load a smaller one
    llm_embed_model: str = "nomic-ai/nomic-embed-text-v1.5-gguf"

    # Offline guard
    offline_mode: bool = False  # When true, middleware blocks non-local outbound


@lru_cache
def get_settings() -> Settings:
    return Settings()
