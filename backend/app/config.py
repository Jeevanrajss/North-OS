"""Runtime settings — loaded from .env."""
import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


def _default_db_path() -> str:
    """Use PERSONAL_OS_DATA_DIR (set by Electron) when running as packaged app."""
    data_dir = os.environ.get("PERSONAL_OS_DATA_DIR", "")
    if data_dir:
        Path(data_dir).mkdir(parents=True, exist_ok=True)
        return str(Path(data_dir) / "north-os.db")
    return str(ROOT_DIR / "data" / "north-os.db")


def _default_db_encryption() -> bool:
    """Disable SQLCipher in packaged mode (Windows compatibility)."""
    if os.environ.get("PERSONAL_OS_DATA_DIR"):
        return False
    return True


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "North OS"
    app_env: str = "dev"
    app_host: str = "127.0.0.1"
    app_port: int = 8000
    app_version: str = "1.2.0"
    timezone: str = "Asia/Kolkata"
    currency: str = "INR"

    # Database
    db_path: str = ""  # resolved below via default_factory logic
    db_encryption: bool = True
    db_passphrase: str = "change-me-in-dotenv"

    # Packaged app paths (set by Electron / run.py before importing this module)
    personal_os_data_dir: str = ""   # OS app-data dir — overrides db_path
    frontend_dist: str = ""          # Path to built React app served in production

    # LLM server — LM Studio by default, but any OpenAI-compatible endpoint works
    # (Ollama with /v1 compatibility, OpenAI, vLLM, llama.cpp server, etc.)
    llm_provider: str = "lmstudio"
    llm_host: str = "http://127.0.0.1:1234"
    llm_chat_model: str = "google/gemma-4-e4b"
    llm_fast_model: str = "google/gemma-4-e4b"  # Same as chat unless you load a smaller one
    llm_embed_model: str = "nomic-ai/nomic-embed-text-v1.5-gguf"

    # Offline guard
    offline_mode: bool = False  # When true, middleware blocks non-local outbound

    def model_post_init(self, __context) -> None:  # type: ignore[override]
        # Resolve the effective data dir: pydantic field takes priority over
        # bare os.environ (Electron sets it as a real env var; .env sets the field).
        effective_data_dir = (
            self.personal_os_data_dir
            or os.environ.get("PERSONAL_OS_DATA_DIR", "")
        )

        # Resolve db_path: env-var override → .env value → default
        if not self.db_path:
            if effective_data_dir:
                Path(effective_data_dir).mkdir(parents=True, exist_ok=True)
                object.__setattr__(
                    self, "db_path", str(Path(effective_data_dir) / "north-os.db")
                )
            else:
                object.__setattr__(self, "db_path", str(ROOT_DIR / "data" / "north-os.db"))

        # Disable encryption when running as packaged app
        if effective_data_dir and self.db_encryption:
            object.__setattr__(self, "db_encryption", False)


@lru_cache
def get_settings() -> Settings:
    return Settings()
