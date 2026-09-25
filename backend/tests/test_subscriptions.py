"""Subscriptions: CRUD, cancel/restore, pause, manual renew, stats, 12-month forecast."""
from datetime import date, timedelta

import pytest

from conftest import API

TODAY = date.today()


def _sub(client, headers=None, **kw):
    body = {"name": "Netflix", "amount": 649, "billing_cycle": "monthly", "next_billing_date": (TODAY + timedelta(days=5)).isoformat()}
    body.update(kw)
    r = client.post(f"{API}/subscriptions", json=body, headers=headers or {})
    assert r.status_code == 201, r.text
    return r.json()


class TestCrud:
    def test_create_get_patch(self, client):
        s = _sub(client)
        assert client.get(f"{API}/subscriptions/{s['id']}").json()["name"] == "Netflix"
        assert client.patch(f"{API}/subscriptions/{s['id']}", json={"amount": 199}).json()["amount"] == 199

    def test_list_sorted_by_next_billing(self, client):
        _sub(client, name="Later", next_billing_date=(TODAY + timedelta(days=20)).isoformat())
        _sub(client, name="Sooner", next_billing_date=(TODAY + timedelta(days=1)).isoformat())
        assert [s["name"] for s in client.get(f"{API}/subscriptions").json()] == ["Sooner", "Later"]

    def test_cancel_hides_and_restore_returns(self, client):
        s = _sub(client)
        assert client.delete(f"{API}/subscriptions/{s['id']}").json()["cancelled_at"] is not None
        assert client.get(f"{API}/subscriptions").json() == []
        assert len(client.get(f"{API}/subscriptions", params={"include_cancelled": True}).json()) == 1
        client.post(f"{API}/subscriptions/{s['id']}/restore")
        assert len(client.get(f"{API}/subscriptions").json()) == 1

    def test_pause_is_idempotent_and_unpause_clears(self, client):
        s = _sub(client)
        first = client.post(f"{API}/subscriptions/{s['id']}/pause").json()["paused_at"]
        assert client.post(f"{API}/subscriptions/{s['id']}/pause").json()["paused_at"] == first
        assert client.post(f"{API}/subscriptions/{s['id']}/unpause").json()["paused_at"] is None

    def test_invalid_cycle_and_missing_fields(self, client):
        assert client.post(f"{API}/subscriptions", json={"name": "x", "amount": 1, "billing_cycle": "daily", "next_billing_date": TODAY.isoformat()}).status_code == 422
        assert client.post(f"{API}/subscriptions", json={"name": "x"}).status_code == 422

    @pytest.mark.parametrize("path", ["", "/pause", "/unpause", "/renew", "/restore"])
    def test_unknown_id_is_404(self, client, path):
        method = client.get if path == "" else client.post
        assert method(f"{API}/subscriptions/nope{path}").status_code == 404


class TestRenew:
    @pytest.mark.parametrize("cycle,start,expected", [
        ("weekly", date(2099, 1, 10), date(2099, 1, 17)),
        ("monthly", date(2099, 1, 31), date(2099, 2, 28)),   # clamps to month end
        ("quarterly", date(2099, 11, 15), date(2100, 2, 15)),  # crosses year
        ("yearly", date(2099, 3, 1), date(2100, 3, 1)),
    ])
    def test_renew_advances_one_cycle_from_future_date(self, client, cycle, start, expected):
        s = _sub(client, billing_cycle=cycle, next_billing_date=start.isoformat())
        out = client.post(f"{API}/subscriptions/{s['id']}/renew").json()
        assert out["next_billing_date"] == expected.isoformat()
        assert out["last_renewed_at"] == TODAY.isoformat()

    def test_overdue_renew_advances_from_today(self, client):
        s = _sub(client, billing_cycle="weekly", next_billing_date=(TODAY - timedelta(days=20)).isoformat())
        out = client.post(f"{API}/subscriptions/{s['id']}/renew").json()
        assert out["next_billing_date"] == (TODAY + timedelta(weeks=1)).isoformat()

    def test_renew_creates_notification(self, client):
        s = _sub(client)
        client.post(f"{API}/subscriptions/{s['id']}/renew")
        types = [n["type"] for n in client.get(f"{API}/notifications/").json()]
        assert "sub_renewed" in types


class TestStatsAndForecast:
    def test_stats_normalises_to_monthly(self, client):
        _sub(client, amount=100, billing_cycle="monthly")
        _sub(client, amount=1200, billing_cycle="yearly", next_billing_date=(TODAY + timedelta(days=200)).isoformat())
        _sub(client, amount=300, billing_cycle="quarterly", next_billing_date=(TODAY + timedelta(days=60)).isoformat())
        s = client.get(f"{API}/subscriptions/stats").json()
        assert s["active_count"] == 3
        assert s["monthly_total"] == pytest.approx(100 + 100 + 100, abs=1)
        assert s["yearly_total"] == pytest.approx(s["monthly_total"] * 12)
        assert [u["subscription"]["amount"] for u in s["upcoming_30d"]] == [100]

    def test_cancelled_not_in_stats(self, client):
        s = _sub(client)
        client.delete(f"{API}/subscriptions/{s['id']}")
        assert client.get(f"{API}/subscriptions/stats").json()["active_count"] == 0

    def test_forecast_twelve_months_and_skips_paused(self, client):
        _sub(client, amount=100, billing_cycle="monthly", next_billing_date=TODAY.isoformat())
        paused = _sub(client, amount=5000, billing_cycle="monthly", next_billing_date=TODAY.isoformat())
        client.post(f"{API}/subscriptions/{paused['id']}/pause")
        months = client.get(f"{API}/subscriptions/forecast").json()["months"]
        assert len(months) == 12
        assert months[0]["year_month"] == TODAY.strftime("%Y-%m")
        assert all(m["total"] == 100 and m["bill_count"] == 1 for m in months)

    def test_forecast_weekly_bills_multiple_times_a_month(self, client):
        _sub(client, amount=10, billing_cycle="weekly", next_billing_date=TODAY.isoformat())
        months = client.get(f"{API}/subscriptions/forecast").json()["months"]
        assert all(m["bill_count"] in (4, 5) for m in months[1:])
        assert months[1]["total"] == 10 * months[1]["bill_count"]


class TestIsolation:
    def test_other_user_cannot_see_or_cancel(self, client, user_a, user_b):
        s = _sub(client, headers=user_a)
        assert client.get(f"{API}/subscriptions", headers=user_b).json() == []
        assert client.delete(f"{API}/subscriptions/{s['id']}", headers=user_b).status_code == 404
