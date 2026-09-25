"""Contacts, split expenses, bank/card accounts, and in-app notifications."""
from datetime import date

from conftest import API

D = date.today().isoformat()


def _txn(client, headers=None, amount=1200):
    return client.post(f"{API}/finance/transactions", json={"type": "expense", "amount": amount, "date": D, "payee": "Dinner"}, headers=headers or {}).json()


def _contact(client, name="Ravi", headers=None):
    r = client.post(f"{API}/contacts", json={"name": name, "upi_id": "ravi@okaxis"}, headers=headers or {})
    assert r.status_code == 201
    return r.json()


class TestContactsAndSplits:
    def test_contacts_sorted_and_soft_deleted(self, client):
        _contact(client, "Zara")
        c = _contact(client, "Anu")
        assert [x["name"] for x in client.get(f"{API}/contacts").json()] == ["Anu", "Zara"]
        assert client.delete(f"{API}/contacts/{c['id']}").status_code == 204
        assert [x["name"] for x in client.get(f"{API}/contacts").json()] == ["Zara"]

    def test_empty_contact_name_is_422(self, client):
        assert client.post(f"{API}/contacts", json={"name": ""}).status_code == 422

    def test_split_lifecycle(self, client):
        t, c = _txn(client), _contact(client)
        s = client.post(f"{API}/splits", json={"transaction_id": t["id"], "contact_id": c["id"], "split_amount": 400}).json()
        assert s["contact_name"] == "Ravi" and s["transaction_label"] == "Dinner" and s["status"] == "pending"
        assert client.get(f"{API}/splits/summary").json() == {"total_pending": 400, "count": 1}
        settled = client.patch(f"{API}/splits/{s['id']}/settle").json()
        assert settled["status"] == "settled" and settled["settled_at"]
        assert client.get(f"{API}/splits").json() == []
        assert len(client.get(f"{API}/splits", params={"status": "settled"}).json()) == 1
        assert client.get(f"{API}/splits/summary").json()["count"] == 0

    def test_split_delete(self, client):
        t, c = _txn(client), _contact(client)
        s = client.post(f"{API}/splits", json={"transaction_id": t["id"], "contact_id": c["id"], "split_amount": 1}).json()
        assert client.delete(f"{API}/splits/{s['id']}").status_code == 204
        assert client.get(f"{API}/splits").json() == []

    def test_split_requires_existing_txn_and_contact(self, client):
        t, c = _txn(client), _contact(client)
        assert client.post(f"{API}/splits", json={"transaction_id": "x", "contact_id": c["id"], "split_amount": 1}).status_code == 404
        assert client.post(f"{API}/splits", json={"transaction_id": t["id"], "contact_id": "x", "split_amount": 1}).status_code == 404
        assert client.post(f"{API}/splits", json={"transaction_id": t["id"], "contact_id": c["id"], "split_amount": 0}).status_code == 422

    def test_cannot_split_another_users_transaction(self, client, user_a, user_b):
        t = _txn(client, headers=user_a)
        c = _contact(client, headers=user_b)
        r = client.post(f"{API}/splits", json={"transaction_id": t["id"], "contact_id": c["id"], "split_amount": 1}, headers=user_b)
        assert r.status_code == 404


    def test_weighted_split_matches_the_dinner_example(self, client):
        t = _txn(client, amount=1000)
        c = {n: _contact(client, n)["id"] for n in ["Asha", "Bala", "Chitra", "Dev", "Esha"]}
        counts = {"Asha": 2, "Bala": 1, "Chitra": 1, "Dev": 3, "Esha": 2}
        r = client.post(f"{API}/splits/batch", json={
            "transaction_id": t["id"], "self_count": 1,
            "shares": [{"contact_id": c[n], "count": k} for n, k in counts.items()],
        })
        assert r.status_code == 201, r.text
        owed = {s["contact_name"]: (s["split_amount"], s["share_count"]) for s in r.json()}
        assert owed == {"Asha": (200, 2), "Bala": (100, 1), "Chitra": (100, 1), "Dev": (300, 3), "Esha": (200, 2)}
        assert r.json()[0]["transaction_amount"] == 1000
        assert client.get(f"{API}/splits/summary").json() == {"total_pending": 900, "count": 5}

    def test_weighted_split_rounds_to_paise(self, client):
        t, c = _txn(client, amount=100), _contact(client)
        s = client.post(f"{API}/splits/batch", json={"transaction_id": t["id"], "shares": [{"contact_id": c["id"], "count": 1}], "self_count": 2}).json()
        assert s[0]["split_amount"] == 33.33

    def test_you_can_take_no_share(self, client):
        t, c = _txn(client, amount=500), _contact(client)
        s = client.post(f"{API}/splits/batch", json={"transaction_id": t["id"], "shares": [{"contact_id": c["id"], "count": 1}], "self_count": 0}).json()
        assert s[0]["split_amount"] == 500

    def test_split_batch_validation(self, client):
        t, a = _txn(client), _contact(client, "Anu")
        post = lambda **kw: client.post(f"{API}/splits/batch", json={"transaction_id": t["id"], **kw}).status_code
        assert post(shares=[{"contact_id": a["id"], "count": 1}] * 2) == 422   # same person twice
        assert post(shares=[{"contact_id": a["id"], "count": 0}]) == 422       # count must be ≥ 1
        assert post(shares=[]) == 422
        assert post(shares=[{"contact_id": a["id"], "count": 1}, {"contact_id": "missing", "count": 1}]) == 404
        assert client.get(f"{API}/splits").json() == []                        # nothing half-saved

    def test_split_batch_is_scoped_to_the_user(self, client, user_a, user_b):
        t = _txn(client, headers=user_a)
        c = _contact(client, headers=user_b)
        r = client.post(f"{API}/splits/batch", json={"transaction_id": t["id"], "shares": [{"contact_id": c["id"], "count": 1}]}, headers=user_b)
        assert r.status_code == 404

    def test_people_view_totals_each_person_across_splits(self, client):
        asha, bala = _contact(client, "Asha"), _contact(client, "Bala")
        dinner, cab = _txn(client, amount=1000), _txn(client, amount=300)
        client.post(f"{API}/splits/batch", json={"transaction_id": dinner["id"], "shares": [
            {"contact_id": asha["id"], "count": 2}, {"contact_id": bala["id"], "count": 1}], "self_count": 2})
        client.post(f"{API}/splits/batch", json={"transaction_id": cab["id"], "shares": [
            {"contact_id": asha["id"], "count": 1}], "self_count": 2})
        v = client.get(f"{API}/splits/people").json()
        assert v["total_pending"] == 700 and v["people_count"] == 2
        assert [(p["contact_name"], p["total"], len(p["splits"])) for p in v["people"]] == [("Asha", 500, 2), ("Bala", 200, 1)]

    def test_settle_everything_for_one_person(self, client):
        asha, bala = _contact(client, "Asha"), _contact(client, "Bala")
        t = _txn(client, amount=300)
        client.post(f"{API}/splits/batch", json={"transaction_id": t["id"], "shares": [
            {"contact_id": asha["id"], "count": 1}, {"contact_id": bala["id"], "count": 1}]})
        assert client.post(f"{API}/splits/people/{asha['id']}/settle").json() == {"settled": 1, "amount": 100}
        assert [p["contact_name"] for p in client.get(f"{API}/splits/people").json()["people"]] == ["Bala"]
        assert client.post(f"{API}/splits/people/{asha['id']}/settle").status_code == 404


class TestAccounts:
    def test_auto_name_from_bank_and_type(self, client):
        a = client.post(f"{API}/accounts", json={"type": "savings", "bank": "HDFC Bank"}).json()
        assert a["name"] == "HDFC Bank Savings"
        cash = client.post(f"{API}/accounts", json={"type": "cash"}).json()
        assert cash["name"] == "Cash"

    def test_deactivate_hides_from_default_list(self, client):
        a = client.post(f"{API}/accounts", json={"type": "cash"}).json()
        assert client.delete(f"{API}/accounts/{a['id']}").status_code == 204
        assert client.get(f"{API}/accounts").json() == []
        assert len(client.get(f"{API}/accounts", params={"include_inactive": True}).json()) == 1

    def test_patch_bank_regenerates_name(self, client):
        a = client.post(f"{API}/accounts", json={"type": "debit_card", "bank": "SBI"}).json()
        out = client.patch(f"{API}/accounts/{a['id']}", json={"bank": "Axis Bank"}).json()
        assert out["name"] == "Axis Bank Debit Card"

    def test_catalog_endpoints(self, client):
        banks = client.get(f"{API}/accounts/banks").json()
        assert banks["banks"] and banks["wallets"]
        catalog = client.get(f"{API}/accounts/catalog").json()
        some_bank = next(iter(catalog))
        assert client.get(f"{API}/accounts/catalog/{some_bank}").json() == catalog[some_bank]
        assert client.get(f"{API}/accounts/catalog/NoSuchBank").json() == {"credit": [], "debit": []}

    def test_card_tip_recommends_higher_cashback_card(self, client):
        client.post(f"{API}/accounts", json={"type": "credit_card", "bank": "Kotak Mahindra Bank", "nickname": "Basic",
                                               "benefits_json": '{"cashback": {"Food & Dining": 1}}'})
        client.post(f"{API}/accounts", json={"type": "credit_card", "bank": "Axis Bank", "nickname": "Foodie",
                                               "benefits_json": '{"cashback": {"Food & Dining": 5}}'})
        tip = client.post(f"{API}/accounts/card-tip", json={"category": "Food & Dining", "account": "Basic", "amount": 1000}).json()
        assert tip["better_card"] == "Foodie" and tip["cashback_rate"] == 5 and tip["current_rate"] == 1
        assert "₹40" in tip["tip"]

    def test_card_tip_none_when_already_best(self, client):
        client.post(f"{API}/accounts", json={"type": "credit_card", "bank": "Axis Bank", "nickname": "Foodie",
                                               "benefits_json": '{"cashback": {"Food & Dining": 5}}'})
        tip = client.post(f"{API}/accounts/card-tip", json={"category": "Food & Dining", "account": "Foodie", "amount": 1000}).json()
        assert tip["tip"] is None

    def test_other_user_cannot_read_edit_or_deactivate_account(self, client, user_a, user_b):
        """Regression: get/patch/delete looked accounts up by id only (IDOR)."""
        a = client.post(f"{API}/accounts", json={"type": "savings", "bank": "HDFC Bank"}, headers=user_a).json()
        assert client.get(f"{API}/accounts/{a['id']}", headers=user_b).status_code == 404
        assert client.patch(f"{API}/accounts/{a['id']}", json={"nickname": "pwned"}, headers=user_b).status_code == 404
        assert client.delete(f"{API}/accounts/{a['id']}", headers=user_b).status_code == 404
        mine = client.get(f"{API}/accounts/{a['id']}", headers=user_a).json()
        assert mine["is_active"] is True and mine["nickname"] is None

    def test_card_tip_never_suggests_another_users_card(self, client, user_a, user_b):
        """Regression: card-tip scanned every user's credit cards."""
        client.post(f"{API}/accounts", json={"type": "credit_card", "bank": "X", "nickname": "Alice Platinum",
                                               "benefits_json": '{"cashback": {"Travel": 10}}'}, headers=user_a)
        tip = client.post(f"{API}/accounts/card-tip", json={"category": "Travel", "account": "Cash", "amount": 100}, headers=user_b).json()
        assert tip["better_card"] is None


class TestNotifications:
    def test_renew_creates_unread_then_mark_read(self, client):
        s = client.post(f"{API}/subscriptions", json={"name": "Spotify", "amount": 119, "next_billing_date": D}).json()
        client.post(f"{API}/subscriptions/{s['id']}/renew")
        assert client.get(f"{API}/notifications/unread-count").json() == {"count": 1}
        n = client.get(f"{API}/notifications/").json()[0]
        assert n["created_at"].endswith("Z")
        client.post(f"{API}/notifications/{n['id']}/read")
        assert client.get(f"{API}/notifications/unread-count").json() == {"count": 0}
        client.delete(f"{API}/notifications/clear-read")
        assert client.get(f"{API}/notifications/").json() == []

    def test_read_all_and_delete(self, client):
        s = client.post(f"{API}/subscriptions", json={"name": "Spotify", "amount": 119, "next_billing_date": D}).json()
        client.post(f"{API}/subscriptions/{s['id']}/renew")
        client.post(f"{API}/subscriptions/{s['id']}/renew")
        client.post(f"{API}/notifications/read-all")
        assert client.get(f"{API}/notifications/unread-count").json()["count"] == 0
        nid = client.get(f"{API}/notifications/").json()[0]["id"]
        assert client.delete(f"{API}/notifications/{nid}").json() == {"ok": True}
        assert client.delete(f"{API}/notifications/{nid}").status_code == 404

    def test_triggers_run_without_llm(self, client):
        h = client.post(f"{API}/habits", json={"name": "Floss"}).json()
        assert h
        for path in ("habit-check", "sub-check", "budget-check", "morning-briefing"):
            r = client.post(f"{API}/notifications/trigger/{path}")
            assert r.status_code == 200 and "created" in r.json(), path

    def test_finance_advisor_trigger_with_fake_llm(self, client, fake_llm):
        fake_llm.reply = "You spent less on food this week — nice."
        r = client.post(f"{API}/notifications/trigger/finance-advisor").json()
        assert r["created"] is True and "food" in r["advice"]
        assert client.get(f"{API}/notifications/").json()[0]["type"] == "finance_advisor"

    def test_finance_advisor_trigger_llm_offline(self, client):
        r = client.post(f"{API}/notifications/trigger/finance-advisor").json()
        assert r["created"] is False and r["reason"]

    def test_other_user_cannot_read_or_delete_notification(self, client, user_a, user_b):
        """Regression: mark-read/delete looked notifications up by id only."""
        s = client.post(f"{API}/subscriptions", json={"name": "Spotify", "amount": 119, "next_billing_date": D}, headers=user_a).json()
        client.post(f"{API}/subscriptions/{s['id']}/renew", headers=user_a)
        nid = client.get(f"{API}/notifications/", headers=user_a).json()[0]["id"]
        assert client.post(f"{API}/notifications/{nid}/read", headers=user_b).status_code == 404
        assert client.delete(f"{API}/notifications/{nid}", headers=user_b).status_code == 404
        assert client.get(f"{API}/notifications/unread-count", headers=user_a).json()["count"] == 1


def test_migration_adds_share_count_to_existing_splits(tmp_path):
    import sqlite3

    from sqlalchemy import create_engine

    from app.db import _dev_migrate_splits_share_count

    path = tmp_path / "legacy.db"
    raw = sqlite3.connect(path)
    raw.executescript("CREATE TABLE splits (id VARCHAR(36) PRIMARY KEY, split_amount FLOAT); INSERT INTO splits VALUES ('a', 50);")
    raw.close()
    with create_engine(f"sqlite:///{path}").begin() as conn:
        _dev_migrate_splits_share_count(conn)
        _dev_migrate_splits_share_count(conn)  # idempotent
    assert sqlite3.connect(path).execute("SELECT split_amount, share_count FROM splits").fetchone() == (50, None)
