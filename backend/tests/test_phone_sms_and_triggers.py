"""The phone's SMS import, the Mac's iMessage scan, manual notification
triggers and the AI settings probes — the endpoints other suites don't reach."""
import sqlite3
import time
from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import sms as sms_router
from conftest import API

NOW_MS = int(time.time() * 1000)
TODAY = date.today().isoformat()


def _sms(**kw):
    body = {"sms_id": "sms-1", "sender": "VM-HDFCBK", "timestamp": NOW_MS, "amount": 450.0,
            "direction": "debit", "merchant": "Swiggy", "account_last4": "1234", "category": "Food & Dining"}
    body.update(kw)
    return body


def _txns(client, **params):
    return client.get(f"{API}/finance/transactions", params=params).json()


class TestPhoneSmsImport:
    def test_debit_becomes_an_sms_expense(self, client):
        r = client.post(f"{API}/sms/import", json=_sms())
        assert r.status_code == 200 and r.json()["is_duplicate"] is False
        [t] = _txns(client)
        assert (t["type"], t["amount"], t["payee"], t["category"], t["source"], t["date"]) == \
            ("expense", 450.0, "Swiggy", "Food & Dining", "sms_auto", TODAY)

    def test_credit_becomes_income_and_category_defaults_to_other(self, client):
        client.post(f"{API}/sms/import", json=_sms(direction="credit", category=None, merchant="ACME CORP"))
        [t] = _txns(client)
        assert t["type"] == "income" and t["category"] == "Other"

    def test_same_sms_twice_is_imported_once(self, client):
        first = client.post(f"{API}/sms/import", json=_sms()).json()
        again = client.post(f"{API}/sms/import", json=_sms()).json()
        assert again == {"is_duplicate": True, "transaction_id": first["transaction_id"]}
        assert len(_txns(client)) == 1

    def test_matches_an_existing_card_expense_instead_of_duplicating(self, client):
        # The manual-entry API doesn't take a card's last 4 digits, so set it
        # directly: this is the path for an expense already tied to the card.
        manual = client.post(f"{API}/finance/transactions", json={
            "type": "expense", "amount": 450, "date": TODAY, "payee": "Lunch"}).json()
        from app.db import SessionLocal
        from app.models.finance import Transaction
        with SessionLocal() as db:
            db.get(Transaction, manual["id"]).account_last4 = "1234"
            db.commit()
        r = client.post(f"{API}/sms/import", json=_sms()).json()
        assert r == {"is_duplicate": True, "transaction_id": manual["id"]}
        [t] = _txns(client)
        assert t["source"] == "sms_verified" and t["payee"] == "Lunch"  # user's own label kept

    def test_raw_sms_text_is_never_stored(self, client):
        client.post(f"{API}/sms/import", json=_sms())
        from app.db import SessionLocal
        from app.models.sms_transaction import SmsTransaction
        with SessionLocal() as db:
            [row] = db.query(SmsTransaction).all()
        assert row.raw_body.startswith("[not stored")

    def test_each_user_keeps_their_own_copy(self, client, user_a, user_b):
        client.post(f"{API}/sms/import", json=_sms(), headers=user_a)
        r = client.post(f"{API}/sms/import", json=_sms(), headers=user_b).json()
        assert r["is_duplicate"] is False

    def test_paired_phone_import_lands_on_the_mac(self, client):
        phone = TestClient(app, client=("100.101.102.103", 51000))
        code = client.post(f"{API}/pair/start").json()["code"]
        tokens = phone.post(f"{API}/pair/claim", json={"code": code, "device_name": "S21"}).json()
        auth = {"Authorization": f"Bearer {tokens['access_token']}"}
        assert phone.post(f"{API}/sms/import", json=_sms(), headers=auth).status_code == 200
        assert [t["payee"] for t in _txns(client)] == ["Swiggy"]  # visible in the Mac's own view
        assert phone.post(f"{API}/sms/import", json=_sms(sms_id="x")).status_code == 401  # unpaired → locked out


class TestIMessageScan:
    APPLE_EPOCH = 978307200

    def _chat_db(self, path, rows):
        con = sqlite3.connect(path)
        con.executescript("""
            CREATE TABLE handle (rowid INTEGER PRIMARY KEY, id TEXT, service TEXT);
            CREATE TABLE message (text TEXT, date INTEGER, handle_id INTEGER, is_from_me INTEGER);
        """)
        for i, (sender, text, when) in enumerate(rows, start=1):
            con.execute("INSERT INTO handle VALUES (?, ?, 'SMS')", (i, sender))
            apple_ns = int((when.timestamp() - self.APPLE_EPOCH) * 1_000_000_000)
            con.execute("INSERT INTO message VALUES (?, ?, ?, 0)", (text, apple_ns, i))
        con.commit()
        con.close()

    def test_missing_messages_db_reports_imsg_001(self, client, monkeypatch, tmp_path):
        monkeypatch.setattr(sms_router, "IMESSAGE_DB", tmp_path / "nope.db")
        r = client.post(f"{API}/sms/scan-imessage").json()
        assert r["scanned"] is False and r["error_code"] == "IMSG-001"

    def test_only_recent_bank_messages_are_read(self, client, monkeypatch, tmp_path):
        db = tmp_path / "chat.db"
        now = datetime.utcnow()
        self._chat_db(db, [
            ("VM-HDFCBK", "Rs.450.00 debited from A/c XX1234 on 23-09-26 to VPA swiggy@icici. Avl Bal Rs 9550.00", now),
            ("+919876543210", "Rs.450.00 debited from A/c XX1234 — forwarded by a friend, not a bank", now),
            ("VM-HDFCBK", "Rs.999.00 debited from A/c XX1234 on 01-01-26 to VPA old@icici. Avl Bal Rs 1.00", now - timedelta(days=30)),
        ])
        monkeypatch.setattr(sms_router, "IMESSAGE_DB", db)
        r = client.post(f"{API}/sms/scan-imessage", params={"days_back": 7}).json()
        assert r["scanned"] is True
        pending = client.get(f"{API}/sms/pending").json()
        assert [p["amount"] for p in pending] == [450.0]  # personal + old messages skipped


class TestManualNotificationTriggers:
    @pytest.fixture(autouse=True)
    def _daytime(self, monkeypatch):
        from app.services import notification_service as ns
        monkeypatch.setattr(ns, "_is_quiet_hours", lambda db, user_id="": False)

    def test_habit_check_nudges_about_open_habits(self, client):
        client.post(f"{API}/habits", json={"name": "Read"})
        assert client.post(f"{API}/notifications/trigger/habit-check").json()["created"] >= 1
        assert client.get(f"{API}/notifications/unread-count").json()["count"] >= 1

    def test_subscription_check_warns_before_renewal(self, client):
        r = client.post(f"{API}/subscriptions", json={
            "name": "Netflix", "amount": 649, "billing_cycle": "monthly",
            "next_billing_date": (date.today() + timedelta(days=1)).isoformat()})
        assert r.status_code == 201, r.text
        assert client.post(f"{API}/notifications/trigger/sub-check").json()["created"] >= 1

    def test_budget_check_runs(self, client):
        assert "created" in client.post(f"{API}/notifications/trigger/budget-check").json()

    def test_morning_briefing_is_replaced_not_duplicated(self, client, fake_llm):
        client.post(f"{API}/notifications/trigger/morning-briefing")
        client.post(f"{API}/notifications/trigger/morning-briefing")
        briefings = [n for n in client.get(f"{API}/notifications/").json() if n["type"] == "morning_briefing"]
        assert len(briefings) == 1

    def test_weekly_review_uses_the_llm(self, client, fake_llm):
        fake_llm.reply = "Solid week — 5 of 7 habit days."
        r = client.post(f"{API}/notifications/trigger/weekly-review").json()
        assert r["created"] is True and "Solid week" in r["body"]

    def test_manual_trigger_delivers_during_quiet_hours_but_the_schedule_does_not(self, client, monkeypatch):
        from app.services import notification_service as ns
        monkeypatch.setattr(ns, "_is_quiet_hours", lambda db, user_id="": True)
        client.post(f"{API}/habits", json={"name": "Read"})
        from app.db import SessionLocal
        with SessionLocal() as db:
            assert ns.check_habit_reminders(db, force=False) == 0  # 9 pm job stays quiet …
        assert client.get(f"{API}/notifications/unread-count").json()["count"] == 0
        assert client.post(f"{API}/notifications/trigger/habit-check").json()["created"] == 1  # … a tap doesn't
        assert client.get(f"{API}/notifications/unread-count").json()["count"] == 1

    def test_suppressed_notification_is_not_counted_as_created(self, client, monkeypatch):
        from app.services import notification_service as ns
        monkeypatch.setattr(ns, "_is_quiet_hours", lambda db, user_id="": True)
        client.post(f"{API}/habits", json={"name": "Read"})
        from app.db import SessionLocal
        with SessionLocal() as db:
            assert ns.check_habit_reminders(db) == 0

    def test_today_means_the_local_day_not_the_utc_day(self, client):
        """created_at is UTC; 'today' is the Mac's local date. Rows stored just
        after local midnight (still yesterday in UTC for India) count as today."""
        from datetime import time as time_t, timezone
        from app.db import SessionLocal
        from app.models.notification import Notification
        from app.services.notification_service import _created_today
        local_midnight_utc = datetime.combine(date.today(), time_t.min).astimezone(timezone.utc).replace(tzinfo=None)
        with SessionLocal() as db:
            db.add_all([
                Notification(type="t", title="just after midnight", body="b", created_at=local_midnight_utc + timedelta(minutes=5)),
                Notification(type="t", title="yesterday evening", body="b", created_at=local_midnight_utc - timedelta(minutes=5)),
            ])
            db.commit()
            today = [n.title for n in db.query(Notification).filter(*_created_today()).all()]
        assert today == ["just after midnight"]

    def test_reschedule_is_harmless(self, client):
        assert client.post(f"{API}/notifications/reschedule").json() == {"ok": True}


class TestAiSettingsProbes:
    def test_health_reports_unreachable_llm_without_erroring(self, client):
        r = client.get(f"{API}/settings/health")
        assert r.status_code == 200 and r.json()["ok"] is False

    def test_model_list_degrades_to_empty(self, client):
        r = client.get(f"{API}/settings/models").json()
        assert r["models"] == [] and r["error"]

    def test_finance_advisor_answers_with_the_llm(self, client, fake_llm):
        client.post(f"{API}/finance/transactions", json={"type": "expense", "amount": 500, "date": TODAY, "category": "Food & Dining"})
        fake_llm.reply = "Cut food delivery by 20%."
        r = client.post(f"{API}/finance/advisor", json={"question": "How can I save more?"})
        assert r.status_code == 200, r.text
        assert "Cut food delivery" in str(r.json())
