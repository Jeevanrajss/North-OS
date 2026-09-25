"""Health log (sleep/energy/exercise) and life goals (custom, habit-linked, finance-linked)."""
from datetime import date, timedelta

import pytest

from conftest import API

TODAY = date.today()
D = TODAY.isoformat()


class TestHealthLog:
    def test_upsert_is_additive(self, client):
        client.put(f"{API}/health-log/{D}", json={"sleep_hours": 7.5})
        out = client.put(f"{API}/health-log/{D}", json={"energy_level": 4}).json()
        assert out["sleep_hours"] == 7.5 and out["energy_level"] == 4
        assert client.get(f"{API}/health-log/{D}").json()["id"] == out["id"]

    def test_missing_day_returns_null_not_404(self, client):
        r = client.get(f"{API}/health-log/{D}")
        assert r.status_code == 200 and r.json() is None

    @pytest.mark.parametrize("body", [{"sleep_hours": 25}, {"energy_level": 0}, {"energy_level": 6}, {"exercise_minutes": 500}, {"water_glasses": -1}])
    def test_field_ranges(self, client, body):
        assert client.put(f"{API}/health-log/{D}", json=body).status_code == 422

    def test_date_window(self, client):
        assert client.put(f"{API}/health-log/{(TODAY + timedelta(days=2)).isoformat()}", json={}).status_code == 422
        assert client.put(f"{API}/health-log/{(TODAY - timedelta(days=400)).isoformat()}", json={}).status_code == 422

    def test_delete_then_relog_revives(self, client):
        first = client.put(f"{API}/health-log/{D}", json={"sleep_hours": 6}).json()
        assert client.delete(f"{API}/health-log/{D}").status_code == 204
        assert client.get(f"{API}/health-log/{D}").json() is None
        again = client.put(f"{API}/health-log/{D}", json={"sleep_hours": 8}).json()
        assert again["id"] == first["id"] and again["sleep_hours"] == 8

    def test_stats(self, client):
        client.put(f"{API}/health-log/{D}", json={"sleep_hours": 8, "energy_level": 4, "exercise_minutes": 30, "water_glasses": 6})
        client.put(f"{API}/health-log/{(TODAY - timedelta(days=1)).isoformat()}", json={"sleep_hours": 6, "exercise_minutes": 0, "water_glasses": 4})
        s = client.get(f"{API}/health-log/stats").json()
        assert s == {"days_with_data": 2, "avg_sleep_hours": 7.0, "avg_energy_level": 4.0,
                     "avg_exercise_minutes": 30.0, "exercise_days": 1, "total_water_glasses": 10}

    def test_list_is_oldest_first(self, client):
        y = (TODAY - timedelta(days=1)).isoformat()
        client.put(f"{API}/health-log/{D}", json={"sleep_hours": 1})
        client.put(f"{API}/health-log/{y}", json={"sleep_hours": 2})
        assert [x["log_date"] for x in client.get(f"{API}/health-log/").json()] == [y, D]

    def test_two_users_can_log_the_same_date(self, client, user_a, user_b):
        assert client.put(f"{API}/health-log/{D}", json={"sleep_hours": 7}, headers=user_a).status_code == 200
        assert client.put(f"{API}/health-log/{D}", json={"sleep_hours": 5}, headers=user_b).status_code == 200
        assert client.get(f"{API}/health-log/{D}", headers=user_a).json()["sleep_hours"] == 7

    def test_migration_relaxes_a_legacy_global_unique_index(self, tmp_path):
        """Databases created before the fix have UNIQUE(log_date); the startup
        migration must replace it without losing rows."""
        import sqlite3

        from sqlalchemy import create_engine

        from app.db import _dev_migrate_health_logs_per_user_unique

        path = tmp_path / "legacy.db"
        raw = sqlite3.connect(path)
        raw.executescript("""
            CREATE TABLE health_logs (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL DEFAULT '',
                                      log_date DATE NOT NULL, sleep_hours FLOAT);
            CREATE UNIQUE INDEX ix_health_logs_log_date ON health_logs (log_date);
            INSERT INTO health_logs VALUES ('a', '', '2026-01-01', 7);
        """)
        raw.commit()
        raw.close()
        eng = create_engine(f"sqlite:///{path}")
        with eng.begin() as conn:
            _dev_migrate_health_logs_per_user_unique(conn)
            _dev_migrate_health_logs_per_user_unique(conn)  # idempotent
        raw = sqlite3.connect(path)
        raw.execute("INSERT INTO health_logs VALUES ('b', 'other-user', '2026-01-01', 5)")  # now allowed
        with pytest.raises(sqlite3.IntegrityError):
            raw.execute("INSERT INTO health_logs VALUES ('c', '', '2026-01-01', 6)")  # same user+date still blocked
        assert raw.execute("SELECT sleep_hours FROM health_logs WHERE id='a'").fetchone()[0] == 7


class TestGoals:
    def _goal(self, client, **kw):
        body = {"title": "Read 12 books", "goal_type": "custom", "target_value": 12, "current_value": 3}
        body.update(kw)
        r = client.post(f"{API}/goals/", json=body)
        assert r.status_code == 201, r.text
        return r.json()

    def test_custom_goal_progress(self, client):
        assert self._goal(client)["progress_pct"] == 25.0

    def test_habit_streak_goal_tracks_live_streak(self, client):
        h = client.post(f"{API}/habits", json={"name": "Meditate"}).json()
        for i in range(3):
            client.put(f"{API}/habits/{h['id']}/checkins/{(TODAY - timedelta(days=i)).isoformat()}")
        g = self._goal(client, goal_type="habit_streak", linked_id=h["id"], target_value=10)
        assert g["computed_current"] == 3 and g["progress_pct"] == 30.0

    def test_habit_rate_goal(self, client):
        h = client.post(f"{API}/habits", json={"name": "Stretch"}).json()
        for i in range(5):
            client.put(f"{API}/habits/{h['id']}/checkins/{(TODAY - timedelta(days=i)).isoformat()}")
        g = self._goal(client, goal_type="habit_rate", linked_id=h["id"], target_value=50, target_period_days=10)
        assert g["computed_current"] == 50.0 and g["progress_pct"] == 100.0

    def test_linked_habit_missing_is_flagged(self, client):
        assert self._goal(client, goal_type="habit_streak", linked_id="gone")["linked_missing"] is True

    def test_finance_spend_goal_is_inverse(self, client):
        client.post(f"{API}/finance/transactions", json={"type": "expense", "amount": 2500, "date": D, "category": "Food & Dining"})
        client.post(f"{API}/finance/transactions", json={"type": "expense", "amount": 999, "date": D, "category": "Transport"})
        g = self._goal(client, goal_type="finance_spend", linked_id="Food & Dining", target_value=10000)
        assert g["computed_current"] == 2500 and g["progress_pct"] == 75.0

    def test_target_date_overdue_and_days_remaining(self, client):
        assert self._goal(client, target_date=(TODAY + timedelta(days=10)).isoformat())["days_remaining"] == 10
        assert self._goal(client, target_date=(TODAY - timedelta(days=1)).isoformat())["overdue"] is True

    def test_complete_abandon_and_filters(self, client):
        a, b = self._goal(client), self._goal(client, title="Learn guitar")
        client.post(f"{API}/goals/{a['id']}/complete")
        client.post(f"{API}/goals/{b['id']}/abandon")
        assert [g["id"] for g in client.get(f"{API}/goals/").json()] == [a["id"]]
        assert [g["id"] for g in client.get(f"{API}/goals/", params={"status": "abandoned"}).json()] == [b["id"]]

    def test_delete_archives(self, client):
        g = self._goal(client)
        assert client.delete(f"{API}/goals/{g['id']}").status_code == 204
        assert client.get(f"{API}/goals/{g['id']}").status_code == 404
        assert client.patch(f"{API}/goals/{g['id']}", json={"title": "x"}).status_code == 404

    def test_other_user_cannot_see_goal(self, client, user_a, user_b):
        g = client.post(f"{API}/goals/", json={"title": "Secret", "goal_type": "custom"}, headers=user_a).json()
        assert client.get(f"{API}/goals/{g['id']}", headers=user_b).status_code == 404
