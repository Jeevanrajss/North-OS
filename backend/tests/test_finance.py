"""Finance: transactions, categories, budgets, monthly summary, AI insights."""
from datetime import date

from conftest import API

TODAY = date.today()
Y, M = TODAY.year, TODAY.month


def _txn(client, headers=None, **overrides):
    body = {"type": "expense", "amount": 250.0, "date": TODAY.isoformat(), "category": "Food & Dining", "payee": "Swiggy"}
    body.update(overrides)
    r = client.post(f"{API}/finance/transactions", json=body, headers=headers or {})
    assert r.status_code == 201, r.text
    return r.json()


# ── Transactions ─────────────────────────────────────────────────────────────
class TestTransactions:
    def test_create_returns_row_with_id(self, client):
        t = _txn(client)
        assert t["id"] and t["amount"] == 250.0 and t["type"] == "expense"

    def test_list_filters_by_year_and_month(self, client):
        _txn(client, date=f"{Y}-{M:02d}-01")
        _txn(client, date="2020-01-15")
        rows = client.get(f"{API}/finance/transactions", params={"year": Y, "month": M}).json()
        assert len(rows) == 1
        assert len(client.get(f"{API}/finance/transactions").json()) == 2

    def test_list_is_newest_first(self, client):
        _txn(client, date="2024-01-01", payee="old")
        _txn(client, date="2024-06-01", payee="new")
        payees = [t["payee"] for t in client.get(f"{API}/finance/transactions").json()]
        assert payees == ["new", "old"]

    def test_patch_updates_only_sent_fields(self, client):
        t = _txn(client)
        r = client.patch(f"{API}/finance/transactions/{t['id']}", json={"amount": 999})
        assert r.status_code == 200
        assert r.json()["amount"] == 999 and r.json()["payee"] == "Swiggy"

    def test_patch_unknown_is_404(self, client):
        assert client.patch(f"{API}/finance/transactions/nope", json={"amount": 1}).status_code == 404

    def test_delete_hides_row_but_keeps_tombstone(self, client, db):
        from app.models.finance import Transaction

        t = _txn(client)
        assert client.delete(f"{API}/finance/transactions/{t['id']}").status_code == 204
        assert client.get(f"{API}/finance/transactions").json() == []
        row = db.query(Transaction).execution_options(include_deleted=True).filter_by(id=t["id"]).one()
        assert row.deleted_at is not None

    def test_delete_twice_is_404(self, client):
        t = _txn(client)
        client.delete(f"{API}/finance/transactions/{t['id']}")
        assert client.delete(f"{API}/finance/transactions/{t['id']}").status_code == 404

    def test_missing_amount_is_422(self, client):
        r = client.post(f"{API}/finance/transactions", json={"type": "expense", "date": TODAY.isoformat()})
        assert r.status_code == 422

    def test_invalid_type_is_422(self, client):
        r = client.post(f"{API}/finance/transactions", json={"type": "gift", "amount": 1, "date": TODAY.isoformat()})
        assert r.status_code == 422


# ── Monthly summary ──────────────────────────────────────────────────────────
class TestMonthlySummary:
    def test_totals_net_and_category_breakdown(self, client):
        _txn(client, type="income", amount=50000, category="Salary")
        _txn(client, amount=300, category="Food & Dining")
        _txn(client, amount=200, category="Food & Dining")
        _txn(client, amount=1000, category="Transport")
        s = client.get(f"{API}/finance/summary/{Y}/{M}").json()
        assert s["total_income"] == 50000
        assert s["total_expense"] == 1500
        assert s["net"] == 48500
        assert s["transaction_count"] == 4
        assert [c["category"] for c in s["by_category"]] == ["Transport", "Food & Dining"]
        assert s["by_category"][1] == {"category": "Food & Dining", "total": 500, "count": 2}

    def test_uncategorised_expense_counts_as_other(self, client):
        _txn(client, category=None)
        s = client.get(f"{API}/finance/summary/{Y}/{M}").json()
        assert s["by_category"][0]["category"] == "Other"

    def test_deleted_transactions_excluded(self, client):
        t = _txn(client, amount=700)
        client.delete(f"{API}/finance/transactions/{t['id']}")
        assert client.get(f"{API}/finance/summary/{Y}/{M}").json()["total_expense"] == 0

    def test_budget_progress_overall_and_per_category(self, client):
        _txn(client, amount=400, category="Transport")
        client.post(f"{API}/finance/budgets", json={"year": Y, "month": M, "category": None, "amount": 2000})
        client.post(f"{API}/finance/budgets", json={"category": "Transport", "amount": 800})  # recurring
        s = client.get(f"{API}/finance/summary/{Y}/{M}").json()
        assert s["budget_overall"] == {"category": None, "budget": 2000, "spent": 400, "pct": 20.0}
        assert s["budget_by_category"] == [{"category": "Transport", "budget": 800, "spent": 400, "pct": 50.0}]


# ── Budgets ──────────────────────────────────────────────────────────────────
class TestBudgets:
    def test_post_same_scope_upserts_instead_of_duplicating(self, client):
        a = client.post(f"{API}/finance/budgets", json={"year": Y, "month": M, "category": "Shopping", "amount": 100}).json()
        b = client.post(f"{API}/finance/budgets", json={"year": Y, "month": M, "category": "Shopping", "amount": 300}).json()
        assert a["id"] == b["id"] and b["amount"] == 300
        assert len(client.get(f"{API}/finance/budgets").json()) == 1

    def test_month_filter_returns_exact_and_recurring(self, client):
        client.post(f"{API}/finance/budgets", json={"year": Y, "month": M, "category": "A", "amount": 1})
        client.post(f"{API}/finance/budgets", json={"category": "B", "amount": 2})
        client.post(f"{API}/finance/budgets", json={"year": 2000, "month": 1, "category": "C", "amount": 3})
        cats = {b["category"] for b in client.get(f"{API}/finance/budgets", params={"year": Y, "month": M}).json()}
        assert cats == {"A", "B"}

    def test_exact_month_beats_recurring(self, client):
        _txn(client, amount=150, category="Shopping")
        client.post(f"{API}/finance/budgets", json={"category": "Shopping", "amount": 1000})
        client.post(f"{API}/finance/budgets", json={"year": Y, "month": M, "category": "Shopping", "amount": 100})
        status = client.get(f"{API}/finance/budgets/status").json()
        assert status == [{"category": "Shopping", "spent": 150, "limit": 100, "exceeded": True}]

    def test_status_not_exceeded_under_limit(self, client):
        _txn(client, amount=50, category="Shopping")
        client.post(f"{API}/finance/budgets", json={"category": "Shopping", "amount": 100})
        assert client.get(f"{API}/finance/budgets/status").json()[0]["exceeded"] is False

    def test_patch_and_delete(self, client):
        b = client.post(f"{API}/finance/budgets", json={"category": "X", "amount": 10}).json()
        assert client.patch(f"{API}/finance/budgets/{b['id']}", json={"amount": 20}).json()["amount"] == 20
        assert client.delete(f"{API}/finance/budgets/{b['id']}").status_code == 204
        assert client.get(f"{API}/finance/budgets").json() == []
        assert client.patch(f"{API}/finance/budgets/{b['id']}", json={"amount": 1}).status_code == 404


# ── Categories & meta ────────────────────────────────────────────────────────
class TestCategories:
    def test_meta_lists_seeded_categories(self, client):
        meta = client.get(f"{API}/finance/meta").json()
        assert "Food & Dining" in meta["expense_categories"]
        assert "Salary" in meta["income_categories"]
        assert meta["category_emoji"]["Food & Dining"]

    def test_create_custom_category_and_reject_duplicate(self, client):
        r = client.post(f"{API}/finance/categories", json={"name": "Pets", "emoji": "🐶", "type": "expense"})
        assert r.status_code == 201 and r.json()["is_system"] is False
        dup = client.post(f"{API}/finance/categories", json={"name": "Pets", "emoji": "🐱", "type": "expense"})
        assert dup.status_code == 409
        assert "Pets" in client.get(f"{API}/finance/meta").json()["expense_categories"]

    def test_custom_category_can_be_renamed_and_deleted(self, client):
        c = client.post(f"{API}/finance/categories", json={"name": "Pets", "type": "expense"}).json()
        assert client.patch(f"{API}/finance/categories/{c['id']}", json={"name": "Pet care"}).json()["name"] == "Pet care"
        assert client.delete(f"{API}/finance/categories/{c['id']}").status_code == 204

    def test_system_category_cannot_be_deleted(self, client):
        system = next(c for c in client.get(f"{API}/finance/categories").json() if c["is_system"])
        assert client.delete(f"{API}/finance/categories/{system['id']}").status_code == 400


# ── AI insights ──────────────────────────────────────────────────────────────
class TestFinanceInsights:
    def test_no_data_returns_empty_without_calling_llm(self, client, fake_llm):
        assert client.post(f"{API}/finance/insights").json() == {"insights": [], "model": "chat"}
        assert fake_llm.calls == []

    def test_parses_numbered_list_from_llm(self, client, fake_llm):
        _txn(client)
        fake_llm.reply = "1. **Food** is your top category at 250.\n2) Savings rate looks healthy this month.\nok"
        insights = client.post(f"{API}/finance/insights").json()["insights"]
        assert insights == ["**Food** is your top category at 250.", "Savings rate looks healthy this month."]

    def test_llm_down_degrades_to_empty_list(self, client):
        _txn(client)
        r = client.post(f"{API}/finance/insights")
        assert r.status_code == 200 and r.json()["insights"] == []


# ── Multi-user isolation (cloud mode) ────────────────────────────────────────
class TestIsolation:
    def test_users_cannot_see_or_edit_each_others_transactions(self, client, user_a, user_b):
        t = _txn(client, headers=user_a)
        assert client.get(f"{API}/finance/transactions", headers=user_b).json() == []
        assert client.patch(f"{API}/finance/transactions/{t['id']}", json={"amount": 1}, headers=user_b).status_code == 404
        assert client.delete(f"{API}/finance/transactions/{t['id']}", headers=user_b).status_code == 404
        assert len(client.get(f"{API}/finance/transactions", headers=user_a).json()) == 1

    def test_signed_in_user_does_not_see_local_desktop_data(self, client, user_a):
        _txn(client)  # no token → local desktop user
        assert client.get(f"{API}/finance/transactions", headers=user_a).json() == []
