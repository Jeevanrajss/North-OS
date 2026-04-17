"""Smoke tests — run with `pytest`."""
from fastapi.testclient import TestClient

from app.main import app


def test_root():
    with TestClient(app) as c:
        r = c.get("/")
        assert r.status_code == 200
        assert "app" in r.json()


def test_health_endpoint_exists():
    with TestClient(app) as c:
        r = c.get("/api/v1/health")
        assert r.status_code == 200
        body = r.json()
        assert body["app"]["name"]
        assert body["db"]["ok"] is True
