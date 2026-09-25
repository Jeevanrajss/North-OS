"""Debts/EMIs, investments/SIPs, and financial goals."""
from datetime import date, timedelta

import pytest

from conftest import API

TODAY = date.today()


def _debt(client, headers=None, **kw):
    body = {"name": "Car loan", "debt_type": "car_loan", "principal": 100000, "outstanding": 60000,
            "interest_rate": 9.5, "emi_amount": 5000, "emi_due_day": 5}
    body.update(kw)
    r = client.post(f"{API}/finance/debt", json=body, headers=headers or {})
    assert r.status_code == 201, r.text
    return r.json()


def _inv(client, headers=None, **kw):
    body = {"name": "Index fund", "investment_type": "mutual_fund", "sip_amount": 2000, "target_amount": 10000}
    body.update(kw)
    r = client.post(f"{API}/finance/investments", json=body, headers=headers or {})
    assert r.status_code == 201, r.text
    return r.json()


def _goal(client, headers=None, **kw):
    body = {"title": "New laptop", "target_amount": 100000}
    body.update(kw)
    r = client.post(f"{API}/finance/goals", json=body, headers=headers or {})
    assert r.status_code == 201, r.text
    return r.json()


# ── Debt ─────────────────────────────────────────────────────────────────────
class TestDebt:
    def test_create_computes_progress_and_payoff(self, client):
        d = _debt(client)
        assert d["progress_pct"] == 40.0
        assert 0 < d["months_to_payoff"] < 999
        assert d["total_interest_remaining"] > 0
        assert 0 <= d["days_to_emi"] <= 31

    def test_zero_interest_payoff_is_simple_division(self, client):
        d = _debt(client, interest_rate=0, outstanding=10000, emi_amount=3000)
        assert d["months_to_payoff"] == 4 and d["total_interest_remaining"] == 2000

    def test_emi_below_interest_never_pays_off(self, client):
        d = _debt(client, outstanding=1_000_000, interest_rate=24, emi_amount=100)
        assert d["months_to_payoff"] == 999

    def test_payment_reduces_outstanding_and_logs_expense(self, client):
        d = _debt(client)
        r = client.post(f"{API}/finance/debt/{d['id']}/payment", json={"amount": 5000, "payment_date": TODAY.isoformat()})
        assert r.status_code == 201 and r.json()["outstanding"] == 55000
        payments = client.get(f"{API}/finance/debt/{d['id']}/payments").json()
        assert [p["outstanding_after"] for p in payments] == [55000]
        txns = client.get(f"{API}/finance/transactions").json()
        assert len(txns) == 1 and txns[0]["category"] == "EMI/Loan" and txns[0]["amount"] == 5000

    def test_paying_off_closes_debt_and_blocks_more_payments(self, client):
        d = _debt(client, outstanding=3000)
        closed = client.post(f"{API}/finance/debt/{d['id']}/payment", json={"amount": 5000, "payment_date": TODAY.isoformat()}).json()
        assert closed["outstanding"] == 0 and closed["status"] == "closed"
        again = client.post(f"{API}/finance/debt/{d['id']}/payment", json={"amount": 1, "payment_date": TODAY.isoformat()})
        assert again.status_code == 400

    def test_non_positive_payment_is_422(self, client):
        d = _debt(client)
        r = client.post(f"{API}/finance/debt/{d['id']}/payment", json={"amount": 0, "payment_date": TODAY.isoformat()})
        assert r.status_code == 422

    def test_summary_only_counts_active(self, client):
        _debt(client, outstanding=1000, emi_amount=100)
        d2 = _debt(client, outstanding=2000, emi_amount=200)
        client.delete(f"{API}/finance/debt/{d2['id']}")
        s = client.get(f"{API}/finance/debt/summary").json()
        assert s["active_count"] == 1 and s["total_outstanding"] == 1000 and s["total_emi_monthly"] == 100

    def test_payoff_strategy_orders_avalanche_and_snowball(self, client):
        _debt(client, name="Card", interest_rate=36, outstanding=50000, emi_amount=5000)
        _debt(client, name="Small", interest_rate=10, outstanding=5000, emi_amount=1000)
        s = client.get(f"{API}/finance/debt/payoff-strategy").json()
        assert [e["name"] for e in s["avalanche"]] == ["Card", "Small"]
        assert [e["name"] for e in s["snowball"]] == ["Small", "Card"]
        assert s["summary"]["recommendation"] == "avalanche"

    def test_payoff_strategy_empty(self, client):
        assert client.get(f"{API}/finance/debt/payoff-strategy").json() == {"avalanche": [], "snowball": [], "summary": {}}

    def test_patch_and_status_filter(self, client):
        d = _debt(client)
        assert client.patch(f"{API}/finance/debt/{d['id']}", json={"status": "paused"}).json()["status"] == "paused"
        assert client.get(f"{API}/finance/debt", params={"status": "active"}).json() == []
        assert len(client.get(f"{API}/finance/debt", params={"status": "paused"}).json()) == 1

    def test_unknown_debt_is_404(self, client):
        assert client.get(f"{API}/finance/debt/nope").status_code == 404

    def test_signed_in_user_sees_own_debt_and_payment(self, client, user_a, user_b):
        """Regression: create_debt/record_payment dropped user_id, so cloud users' debts vanished."""
        d = _debt(client, headers=user_a)
        assert [x["id"] for x in client.get(f"{API}/finance/debt", headers=user_a).json()] == [d["id"]]
        client.post(f"{API}/finance/debt/{d['id']}/payment", json={"amount": 100, "payment_date": TODAY.isoformat()}, headers=user_a)
        assert len(client.get(f"{API}/finance/debt/{d['id']}/payments", headers=user_a).json()) == 1
        assert len(client.get(f"{API}/finance/transactions", headers=user_a).json()) == 1
        assert client.get(f"{API}/finance/debt", headers=user_b).json() == []
        assert client.get(f"{API}/finance/debt/{d['id']}", headers=user_b).status_code == 404


# ── Investments ──────────────────────────────────────────────────────────────
class TestInvestments:
    def test_entry_increments_total_and_logs_transaction(self, client):
        inv = _inv(client)
        r = client.post(f"{API}/finance/investments/{inv['id']}/entry", json={"amount": 2000, "entry_date": TODAY.isoformat()})
        assert r.status_code == 201
        assert r.json()["investment"]["total_invested"] == 2000
        assert r.json()["investment"]["progress_pct"] == 20.0
        txns = client.get(f"{API}/finance/transactions").json()
        assert txns[0]["type"] == "investment" and txns[0]["amount"] == 2000

    def test_summary_groups_by_type_and_counts_this_months_sip(self, client):
        a = _inv(client, investment_type="mutual_fund")
        b = _inv(client, name="FD", investment_type="fd", sip_amount=None)
        client.post(f"{API}/finance/investments/{a['id']}/entry", json={"amount": 1000, "entry_date": TODAY.isoformat()})
        client.post(f"{API}/finance/investments/{a['id']}/entry", json={"amount": 500, "entry_date": (TODAY.replace(day=1) - timedelta(days=1)).isoformat()})
        client.post(f"{API}/finance/investments/{b['id']}/entry", json={"amount": 5000, "entry_date": TODAY.isoformat(), "entry_type": "lumpsum"})
        s = client.get(f"{API}/finance/investments/summary").json()
        assert s["total_invested"] == 6500
        assert s["by_type"] == {"mutual_fund": 1500, "fd": 5000}
        assert s["sip_this_month"] == 1000
        assert s["active_count"] == 2

    def test_entries_listed_newest_first(self, client):
        inv = _inv(client)
        for d in ("2025-01-01", "2025-03-01"):
            client.post(f"{API}/finance/investments/{inv['id']}/entry", json={"amount": 1, "entry_date": d})
        dates = [e["entry_date"] for e in client.get(f"{API}/finance/investments/{inv['id']}/entries").json()]
        assert dates == ["2025-03-01", "2025-01-01"]

    def test_signed_in_user_sees_own_investment(self, client, user_a, user_b):
        """Regression: create_investment dropped user_id."""
        inv = _inv(client, headers=user_a)
        client.post(f"{API}/finance/investments/{inv['id']}/entry", json={"amount": 100, "entry_date": TODAY.isoformat()}, headers=user_a)
        assert len(client.get(f"{API}/finance/investments", headers=user_a).json()) == 1
        assert len(client.get(f"{API}/finance/investments/{inv['id']}/entries", headers=user_a).json()) == 1
        assert client.get(f"{API}/finance/investments", headers=user_b).json() == []


# ── Financial goals ──────────────────────────────────────────────────────────
class TestFinancialGoals:
    def test_create_with_target_date_computes_monthly_needed(self, client):
        g = _goal(client, target_amount=12000, target_date=(TODAY + timedelta(days=365)).isoformat())
        assert g["progress_pct"] == 0.0
        assert g["days_remaining"] == 365
        assert g["monthly_needed"] == pytest.approx(1000, rel=0.1)

    def test_progress_derived_from_linked_investments(self, client):
        inv = _inv(client)
        client.post(f"{API}/finance/investments/{inv['id']}/entry", json={"amount": 25000, "entry_date": TODAY.isoformat()})
        g = _goal(client, linked_investment_ids=[inv["id"]])
        assert g["current_amount"] == 25000 and g["progress_pct"] == 25.0

    def test_investment_entry_updates_goal_it_points_at(self, client):
        """Regression: _recompute_goal crashed on an undefined name and was silently skipped."""
        g = _goal(client)
        inv = _inv(client, goal_id=g["id"])
        client.post(f"{API}/finance/investments/{inv['id']}/entry", json={"amount": 30000, "entry_date": TODAY.isoformat()})
        goal = next(x for x in client.get(f"{API}/finance/goals").json() if x["id"] == g["id"])
        assert goal["current_amount"] == 30000
        assert inv["id"] in goal["linked_investment_ids"]

    def test_cannot_read_another_users_investment_through_goal_link(self, client, user_a, user_b):
        inv = _inv(client, headers=user_a)
        client.post(f"{API}/finance/investments/{inv['id']}/entry", json={"amount": 9999, "entry_date": TODAY.isoformat()}, headers=user_a)
        g = _goal(client, headers=user_b, linked_investment_ids=[inv["id"]])
        assert g["current_amount"] == 0

    def test_archive_hides_and_achieve_sets_status(self, client):
        g1, g2 = _goal(client), _goal(client, title="Trip")
        assert client.delete(f"{API}/finance/goals/{g1['id']}").status_code == 204
        assert [g["id"] for g in client.get(f"{API}/finance/goals").json()] == [g2["id"]]
        assert client.post(f"{API}/finance/goals/{g2['id']}/achieve").json()["status"] == "achieved"

    def test_patch_relinks_investments(self, client):
        g = _goal(client)
        inv = _inv(client)
        out = client.patch(f"{API}/finance/goals/{g['id']}", json={"linked_investment_ids": [inv["id"]], "title": "MacBook"}).json()
        assert out["linked_investment_ids"] == [inv["id"]] and out["title"] == "MacBook"

    def test_target_must_be_positive(self, client):
        assert client.post(f"{API}/finance/goals", json={"title": "x", "target_amount": 0}).status_code == 422

    def test_signed_in_user_sees_own_goal(self, client, user_a, user_b):
        """Regression: create_goal dropped user_id."""
        _goal(client, headers=user_a)
        assert len(client.get(f"{API}/finance/goals", headers=user_a).json()) == 1
        assert client.get(f"{API}/finance/goals", headers=user_b).json() == []
