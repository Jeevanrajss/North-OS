"""Shared test harness for the North OS backend.

Every test runs against a throwaway SQLite database in a temp dir — never the
real desktop DB (the repo's .env points PERSONAL_OS_DATA_DIR at it). The env
vars below MUST be set before anything imports `app`, because config, the DB
engine and the auth module all read them at import time.
"""
from __future__ import annotations

import atexit
import os
import shutil
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="northos-tests-"))
atexit.register(shutil.rmtree, _TMP, ignore_errors=True)
os.environ.update(
    {
        "PERSONAL_OS_DATA_DIR": str(_TMP),
        "DB_PATH": str(_TMP / "north-os-test.db"),
        "DB_ENCRYPTION": "false",
        "APP_ENV": "dev",
        # Port 9 (discard) refuses connections instantly — any un-stubbed LLM
        # call fails fast instead of hitting the developer's real LM Studio.
        "LLM_HOST": "http://127.0.0.1:9",
        "GEMINI_API_KEY": "",
        "INVITE_CODE": "test-invite",
        "JWT_SECRET": "test-secret",
        "OFFLINE_MODE": "false",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

import app.scheduler as scheduler  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services import llm_client  # noqa: E402

API = "/api/v1"


@pytest.fixture(scope="session")
def client():
    # Background cron jobs would race the per-test DB cleanup; the job
    # functions themselves are exercised directly in test_scheduler.py.
    real_start, real_stop = scheduler.start_scheduler, scheduler.stop_scheduler
    scheduler.start_scheduler = lambda: None
    scheduler.stop_scheduler = lambda: None
    try:
        with TestClient(app) as c:
            yield c
    finally:
        scheduler.start_scheduler, scheduler.stop_scheduler = real_start, real_stop


@pytest.fixture(autouse=True)
def clean_db(client):
    yield
    from app.services.seed import seed_all

    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(text(f"DELETE FROM {table.name}"))
    with SessionLocal() as db:
        seed_all(db)
    llm_client.invalidate_config_cache()


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


class FakeLLM:
    """Stands in for the OpenAI-compatible HTTP call inside llm_client.

    `reply` may be a string, or a callable taking the request payload and
    returning a string — useful for asserting on what was sent.
    """

    def __init__(self) -> None:
        self.reply: str | object = "1. **Food** spending rose 20% this month compared to last."
        self.calls: list[dict] = []

    async def __call__(self, payload, *, messages_no_system, system, max_tokens, cfg):
        self.calls.append(payload)
        return self.reply(payload) if callable(self.reply) else self.reply


@pytest.fixture
def fake_llm(monkeypatch):
    fake = FakeLLM()
    monkeypatch.setattr(llm_client, "_complete", fake)
    return fake


def _register(client, email: str, name: str = "Test User") -> dict[str, str]:
    r = client.post(
        f"{API}/auth/register",
        json={"name": name, "email": email, "password": "s3cret-pass", "invite_code": "test-invite"},
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def user_a(client):
    return _register(client, "alice@example.com", "Alice")


@pytest.fixture
def user_b(client):
    return _register(client, "bob@example.com", "Bob")
