"""Habits: CRUD, archive/restore, check-ins, schedule-aware streaks, stats, detail."""
from datetime import date, timedelta

from conftest import API

TODAY = date.today()


def _habit(client, headers=None, **kw):
    body = {"name": "Read", "emoji": "📚"}
    body.update(kw)
    r = client.post(f"{API}/habits", json=body, headers=headers or {})
    assert r.status_code == 201, r.text
    return r.json()


def _tick(client, habit_id, d: date, headers=None, **body):
    r = client.put(f"{API}/habits/{habit_id}/checkins/{d.isoformat()}", json=body or None, headers=headers or {})
    assert r.status_code == 200, r.text
    return r.json()


class TestHabitCrud:
    def test_create_defaults_and_sort_order(self, client):
        a = _habit(client)
        b = client.post(f"{API}/habits", json={"name": "Run"}).json()
        assert a["frequency_kind"] == "daily"
        assert b["emoji"]
        assert b["sort_order"] == a["sort_order"] + 1

    def test_weekly_habit_stores_weekdays(self, client):
        h = _habit(client, frequency_kind="weekly", weekdays=[0, 2, 4])
        assert h["weekdays"] == [0, 2, 4]

    def test_archive_hides_from_list_and_restore_brings_back(self, client):
        h = _habit(client)
        assert client.delete(f"{API}/habits/{h['id']}").json()["archived_at"] is not None
        assert client.get(f"{API}/habits").json() == []
        assert len(client.get(f"{API}/habits", params={"include_archived": True}).json()) == 1
        assert client.post(f"{API}/habits/{h['id']}/restore").json()["archived_at"] is None
        assert len(client.get(f"{API}/habits").json()) == 1

    def test_switching_to_daily_clears_schedule(self, client):
        h = _habit(client, frequency_kind="weekly", weekdays=[1])
        out = client.patch(f"{API}/habits/{h['id']}", json={"frequency_kind": "daily"}).json()
        assert out["frequency_kind"] == "daily" and not out["weekdays"]

    def test_switching_to_weekly_without_days_is_rejected(self, client):
        h = _habit(client)
        assert client.patch(f"{API}/habits/{h['id']}", json={"frequency_kind": "weekly"}).status_code == 400

    def test_weekly_patch_keeps_target_in_sync_with_days(self, client):
        h = _habit(client)
        out = client.patch(f"{API}/habits/{h['id']}", json={"frequency_kind": "weekly", "weekdays": [0, 3, 5]}).json()
        assert out["frequency_target"] == 3

    def test_unknown_habit_is_404(self, client):
        assert client.get(f"{API}/habits/nope").status_code == 404
        assert client.put(f"{API}/habits/nope/checkins/{TODAY}").status_code == 404

    def test_empty_name_is_422(self, client):
        assert client.post(f"{API}/habits", json={"name": ""}).status_code == 422


class TestCheckins:
    def test_tick_is_idempotent(self, client):
        h = _habit(client)
        a = _tick(client, h["id"], TODAY)
        b = _tick(client, h["id"], TODAY)
        assert a["id"] == b["id"]
        rows = client.get(f"{API}/habits/{h['id']}/checkins", params={"from": TODAY.isoformat(), "to": TODAY.isoformat()}).json()
        assert len(rows) == 1

    def test_untick_then_retick_revives_same_row(self, client):
        h = _habit(client)
        first = _tick(client, h["id"], TODAY, note="30 pages")
        assert client.delete(f"{API}/habits/{h['id']}/checkins/{TODAY}").status_code == 204
        assert client.get(f"{API}/habits/today").json()["habits"][0]["done"] is False
        again = _tick(client, h["id"], TODAY)
        assert again["id"] == first["id"]
        assert client.get(f"{API}/habits/today").json()["habits"][0]["done"] is True

    def test_untick_missing_day_is_noop(self, client):
        h = _habit(client)
        assert client.delete(f"{API}/habits/{h['id']}/checkins/{TODAY}").status_code == 204

    def test_checkins_window_validation(self, client):
        h = _habit(client)
        r = client.get(f"{API}/habits/{h['id']}/checkins", params={"from": TODAY.isoformat(), "to": (TODAY - timedelta(days=1)).isoformat()})
        assert r.status_code == 400

    def test_today_endpoint_for_specific_date(self, client):
        h = _habit(client)
        yesterday = TODAY - timedelta(days=1)
        _tick(client, h["id"], yesterday)
        r = client.get(f"{API}/habits/today", params={"date": yesterday.isoformat()}).json()
        assert r["date"] == yesterday.isoformat() and r["habits"][0]["done"] is True
        assert client.get(f"{API}/habits/today").json()["habits"][0]["done"] is False


class TestStreaksAndStats:
    def test_daily_streak_counts_back_from_today(self, client):
        h = _habit(client)
        for i in range(3):
            _tick(client, h["id"], TODAY - timedelta(days=i))
        _tick(client, h["id"], TODAY - timedelta(days=5))
        stats = client.get(f"{API}/habits/stats").json()
        row = stats["per_habit"][0]
        assert row["current_streak"] == 3
        assert row["longest_streak_in_window"] == 3
        assert row["done_count"] == 4
        assert row["last7"] == [False, True, False, False, True, True, True]
        assert stats["overall_current_streak"] == 3

    def test_weekly_streak_skips_unscheduled_days(self, client):
        # Scheduled only on today's weekday and the weekday 2 days ago.
        days = sorted({TODAY.weekday(), (TODAY - timedelta(days=2)).weekday()})
        h = _habit(client, frequency_kind="weekly", weekdays=days)
        _tick(client, h["id"], TODAY)
        _tick(client, h["id"], TODAY - timedelta(days=2))
        row = client.get(f"{API}/habits/stats").json()["per_habit"][0]
        assert row["current_streak"] == 2  # yesterday was unscheduled, so it doesn't break the run

    def test_streak_endpoint_for_notifications(self, client):
        h1, h2 = _habit(client), _habit(client, name="Walk")
        _tick(client, h1["id"], TODAY)
        _tick(client, h1["id"], TODAY - timedelta(days=1))
        s = client.get(f"{API}/habits/streak").json()
        assert s == {"current_streak": 2, "today_complete": False, "habits_due_today": 2}
        _tick(client, h2["id"], TODAY)
        assert client.get(f"{API}/habits/streak").json()["today_complete"] is True

    def test_streak_with_no_habits(self, client):
        assert client.get(f"{API}/habits/streak").json() == {"current_streak": 0, "today_complete": True, "habits_due_today": 0}

    def test_stats_with_no_habits_still_returns_seven_day_bits(self, client):
        s = client.get(f"{API}/habits/stats").json()
        assert s["per_habit"] == [] and len(s["daily_any_done"]) == 7

    def test_stats_window_bounds(self, client):
        assert client.get(f"{API}/habits/stats", params={"days": 3}).status_code == 422
        assert client.get(f"{API}/habits/stats", params={"days": 366}).status_code == 422

    def test_archived_and_unticked_days_excluded_from_stats(self, client):
        h = _habit(client)
        _tick(client, h["id"], TODAY)
        client.delete(f"{API}/habits/{h['id']}/checkins/{TODAY}")
        assert client.get(f"{API}/habits/stats").json()["per_habit"][0]["done_count"] == 0
        client.delete(f"{API}/habits/{h['id']}")
        assert client.get(f"{API}/habits/stats").json()["per_habit"] == []

    def test_detail_payload_shape(self, client):
        h = _habit(client)
        _tick(client, h["id"], TODAY, note="felt great")
        d = client.get(f"{API}/habits/{h['id']}/detail", params={"days": 30}).json()
        assert len(d["daily"]) == 30 and d["daily"][-1]["done"] is True
        assert d["daily"][-1]["note_preview"] == "felt great"
        assert len(d["dow"]) == 7
        assert len(d["monthly"]) == 12
        assert d["recent_notes"][0]["note"] == "felt great"
        assert d["stats"]["current_streak"] == 1


class TestIsolation:
    def test_other_user_cannot_touch_habit(self, client, user_a, user_b):
        h = _habit(client, headers=user_a)
        assert client.get(f"{API}/habits", headers=user_b).json() == []
        assert client.put(f"{API}/habits/{h['id']}/checkins/{TODAY}", headers=user_b).status_code == 404
        assert client.delete(f"{API}/habits/{h['id']}", headers=user_b).status_code == 404
