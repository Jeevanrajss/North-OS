"""Auth, health/liveness, settings (AI provider config), client error logs, data wipe."""
from datetime import date, timedelta

from conftest import API

D = date.today().isoformat()


def _user_rows(user_id: str) -> dict[str, int]:
    """Row counts per user-owned table (including tombstones)."""
    from sqlalchemy import text

    from app.db import engine

    with engine.connect() as conn:
        tables = [r[0] for r in conn.execute(text(
            "SELECT m.name FROM sqlite_master m WHERE m.type='table' AND m.sql NOT LIKE '%VIRTUAL%'"))]
        out = {}
        for t in tables:
            cols = [r[1] for r in conn.execute(text(f"PRAGMA table_info({t})"))]
            if "user_id" in cols and t not in ("users", "settings"):
                n = conn.execute(text(f"SELECT COUNT(*) FROM {t} WHERE user_id = :u"), {"u": user_id}).scalar()
                if n:
                    out[t] = n
        return out


def _uid(client, headers=None) -> str:
    return client.get(f"{API}/auth/me", headers=headers or {}).json()["id"]

class TestAppHealth:
    def test_root_and_ping(self, client):
        assert "app" in client.get("/").json()
        assert client.get(f"{API}/ping").json() == {"ok": True}

    def test_health_reports_db_ok_and_llm_down(self, client):
        body = client.get(f"{API}/health").json()
        assert body["db"]["ok"] is True
        assert "northos-tests-" in body["db"]["path"], "tests must never touch the real database"
        assert body["llm"]

    def test_app_version(self, client):
        assert client.get(f"{API}/app-version").status_code == 200

    def test_app_version_reports_the_release_channel(self, client):
        assert client.get(f"{API}/app-version").json()["channel"] == "prod"  # UAT sets APP_CHANNEL=uat

class TestAuth:
    def _register(self, client, **kw):
        body = {"name": "Neo", "email": "neo@example.com", "password": "hunter22", "invite_code": "test-invite"}
        body.update(kw)
        return client.post(f"{API}/auth/register", json=body)

    def test_register_login_me_refresh(self, client):
        tokens = self._register(client).json()
        me = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}).json()
        assert me["email"] == "neo@example.com"
        login = client.post(f"{API}/auth/login", json={"email": "neo@example.com", "password": "hunter22"})
        assert login.status_code == 200
        refreshed = client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        assert refreshed.status_code == 200 and refreshed.json()["access_token"]

    def test_wrong_invite_code(self, client):
        assert self._register(client, invite_code="nope").status_code == 403

    def test_duplicate_email(self, client):
        self._register(client)
        assert self._register(client).status_code == 409

    def test_invalid_email_is_422(self, client):
        assert self._register(client, email="not-an-email").status_code == 422

    def test_wrong_password_and_unknown_user(self, client):
        self._register(client)
        assert client.post(f"{API}/auth/login", json={"email": "neo@example.com", "password": "bad"}).status_code == 401
        assert client.post(f"{API}/auth/login", json={"email": "ghost@example.com", "password": "x"}).status_code == 401

    def test_access_token_cannot_be_used_as_refresh_and_vice_versa(self, client):
        tokens = self._register(client).json()
        assert client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["access_token"]}).status_code == 401
        assert client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tokens['refresh_token']}"}).status_code == 401

    def test_garbage_token_is_401_not_local_fallback(self, client):
        r = client.get(f"{API}/finance/transactions", headers={"Authorization": "Bearer garbage"})
        assert r.status_code == 401

    def test_no_token_on_desktop_uses_local_account(self, client):
        assert client.get(f"{API}/auth/me").json()["email"] == "local@localhost"

    def test_local_owner_is_greeted_by_profile_name(self, client):
        client.put(f"{API}/settings", json={"settings": {"profile.name": "Jeevan"}})
        assert client.get(f"{API}/auth/me").json()["name"] == "Jeevan"

    def test_no_token_on_cloud_is_rejected(self, client, monkeypatch):
        from app.config import get_settings

        monkeypatch.setattr(get_settings(), "app_env", "production")
        assert client.get(f"{API}/finance/transactions").status_code == 401

    def test_local_account_cannot_be_logged_into(self, client):
        client.get(f"{API}/auth/me")  # materialise the local user (empty password hash)
        r = client.post(f"{API}/auth/login", json={"email": "local@localhost", "password": ""})
        assert r.status_code in (401, 422)

class TestSettings:
    def test_put_get_and_api_key_masking(self, client):
        client.put(f"{API}/settings", json={"settings": {"ai.provider": "openai", "ai.api_key": "sk-secret-123"}})
        got = client.get(f"{API}/settings").json()
        assert got["ai.provider"] == "openai"
        assert got["ai.api_key"] == "•" * 12

    def test_masked_placeholder_does_not_overwrite_real_key(self, client, db):
        from app.models.setting import Setting

        client.put(f"{API}/settings", json={"settings": {"ai.api_key": "sk-real"}})
        client.put(f"{API}/settings", json={"settings": {"ai.api_key": "•" * 12}})
        assert db.query(Setting).filter_by(key="ai.api_key").one().value == "sk-real"

    def test_settings_are_per_user(self, client, user_a, user_b):
        client.put(f"{API}/settings", json={"settings": {"ai.provider": "groq"}}, headers=user_a)
        assert "ai.provider" not in client.get(f"{API}/settings", headers=user_b).json()

    def test_providers_catalog(self, client):
        assert client.get(f"{API}/settings/providers").json()

    def test_llm_test_reports_offline(self, client):
        r = client.post(f"{API}/settings/test-llm").json()
        assert r["ok"] is False and r["error"]

    def test_llm_test_with_fake_provider(self, client, fake_llm):
        fake_llm.reply = "North OS connected."
        r = client.post(f"{API}/settings/test-llm").json()
        assert r["ok"] is True and r["response"] == "North OS connected."

    def test_changing_provider_takes_effect_immediately(self, client, fake_llm):
        client.put(f"{API}/settings", json={"settings": {"ai.chat_model": "model-one"}})
        client.post(f"{API}/settings/test-llm")
        client.put(f"{API}/settings", json={"settings": {"ai.chat_model": "model-two"}})
        client.post(f"{API}/settings/test-llm")
        assert [c["model"] for c in fake_llm.calls] == ["model-one", "model-two"]

class TestClientErrorLog:
    def test_log_list_filter_clear(self, client):
        client.delete(f"{API}/logs/errors")
        client.post(f"{API}/logs/error", json={"error_code": "UI-0001", "message": "boom"})
        client.post(f"{API}/logs/error", json={"error_code": "API-0500", "message": "bang"})
        codes = [e["error_code"] for e in client.get(f"{API}/logs/errors").json()]
        assert codes == ["API-0500", "UI-0001"]
        assert [e["message"] for e in client.get(f"{API}/logs/errors", params={"error_code": "UI"}).json()] == ["boom"]
        client.delete(f"{API}/logs/errors")
        assert client.get(f"{API}/logs/errors").json() == []

    def test_log_file_tail(self, client):
        client.post(f"{API}/logs/error", json={"error_code": "UI-0009", "message": "persisted"})
        tail = client.get(f"{API}/logs/file", params={"lines": 5}).json()
        assert tail["available"] is True and tail["lines"][-1]["message"] == "persisted"

class TestDataWipe:
    def _populate(self, client, headers=None, health_day=D):
        h = headers or {}
        client.post(f"{API}/finance/transactions", json={"type": "expense", "amount": 5, "date": D}, headers=h)
        client.post(f"{API}/habits", json={"name": "Run"}, headers=h)
        client.patch(f"{API}/journal/days/{D}", json={"mood_codes": ["calm"], "summary_wins": "private"}, headers=h)
        client.post(f"{API}/journal/days/{D}/entries", json={"content_text": "secret diary"}, headers=h)
        client.post(f"{API}/goals/", json={"title": "Goal", "goal_type": "custom"}, headers=h)
        client.post(f"{API}/finance/debt", json={"name": "Loan"}, headers=h)
        client.post(f"{API}/finance/investments", json={"name": "SIP"}, headers=h)
        client.post(f"{API}/finance/goals", json={"title": "House", "target_amount": 1}, headers=h)
        client.put(f"{API}/health-log/{health_day}", json={"sleep_hours": 7}, headers=h)
        client.post(f"{API}/contacts", json={"name": "Ravi"}, headers=h)

    def test_wipe_removes_everything_including_journal_days_goals_debts(self, client):
        """Regression: wipe used to leave journal days, goals, debts, investments, health logs and contacts behind."""
        self._populate(client)
        client.put(f"{API}/settings", json={"settings": {"ai.provider": "local"}})
        assert client.delete(f"{API}/data/wipe").json()["ok"] is True
        assert _user_rows(_uid(client)) == {}
        assert client.get(f"{API}/goals/").json() == []
        assert client.get(f"{API}/settings").json()["ai.provider"] == "local"
        assert client.get(f"{API}/journal/moods").json(), "seed data must survive"

    def test_wipe_only_touches_the_current_user(self, client, user_a, user_b):
        self._populate(client, headers=user_a)
        self._populate(client, headers=user_b, health_day=(date.today() - timedelta(days=1)).isoformat())  # different dates keep the fixture independent of the health-log index
        client.delete(f"{API}/data/wipe", headers=user_a)
        assert _user_rows(_uid(client, user_a)) == {}
        assert {"transactions", "journal_entries", "debts"} <= set(_user_rows(_uid(client, user_b)))
