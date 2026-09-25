"""Bank-statement import, monthly reports, SMS auto-import, AI chat/insights,
analytics, and the scheduled background jobs."""
from datetime import date, timedelta

import pytest

from conftest import API

TODAY = date.today()
D = TODAY.isoformat()

HDFC_CSV = (
    "Date,Narration,Debit Amount,Credit Amount,Closing Balance\n"
    f"{TODAY.strftime('%d/%m/%Y')},UPI-SWIGGY-BANGALORE,450.00,,10000.00\n"
    f"{TODAY.strftime('%d/%m/%Y')},SALARY CREDIT ACME,,85000.00,95000.00\n"
    f"{TODAY.strftime('%d/%m/%Y')},IGST ON CARD FEE,18.00,,94982.00\n"
    f"{TODAY.strftime('%d/%m/%Y')},HDFC BANK EMI 3 OF 12 LOAN,5000.00,,89982.00\n"
).encode()


def _account(client, headers=None):
    return client.post(f"{API}/accounts", json={"type": "savings", "bank": "HDFC Bank"}, headers=headers or {}).json()


def _preview(client, content=HDFC_CSV, filename="statement.csv", headers=None, **form):
    acct = _account(client, headers)
    r = client.post(f"{API}/finance/import/preview", files={"file": (filename, content, "text/csv")},
                    data={"account_id": acct["id"], **form}, headers=headers or {})
    return acct, r


# ── Pure parsing units ───────────────────────────────────────────────────────
class TestParsers:
    def test_csv_parser_detects_hdfc_and_splits_debit_credit(self):
        from app.services.csv_parser import parse_csv

        rows, key, cols = parse_csv(HDFC_CSV)
        assert key in ("hdfc", "hdfc_alt")
        assert [(r.tx_type, r.amount) for r in rows][:2] == [("expense", 450.0), ("income", 85000.0)]
        assert rows[0].date == D and "Narration" in cols

    def test_csv_parser_unknown_format_needs_mapping(self):
        from app.services.csv_parser import parse_csv

        rows, key, _ = parse_csv(b"When,What,HowMuch\n2025-01-01,thing,5\n")
        assert rows == [] and key is None

    @pytest.mark.parametrize("desc,flag", [
        ("HDFC BANK EMI 3 OF 12 LOAN", "is_emi"),
        ("IGST ON CARD FEE", "is_tax_fee"),
        ("LATE PAYMENT FEE", "is_tax_fee"),
    ])
    def test_import_detector_flags(self, desc, flag):
        from app.services.import_detector import detect_row

        assert getattr(detect_row(desc, 100.0, "expense", [], []), flag) is True

    def test_import_detector_normal_row(self):
        from app.services.import_detector import detect_row

        d = detect_row("UPI-SWIGGY", 100.0, "expense", [], [])
        assert not (d.is_emi or d.is_tax_fee or d.is_cc_payment or d.is_investment)

    @pytest.mark.parametrize("desc,cat", [
        ("UPI/SWIGGY/ORDER", "Food & Dining"), ("UBER TRIP", "Transport"), ("AMAZON PAY", "Shopping"),
        ("APOLLO PHARMACY", "Healthcare"), ("SALARY CREDIT", "Salary"), ("ZERODHA", "Investment"),
    ])
    def test_categorizer_keyword_heuristics(self, desc, cat):
        from app.services.transaction_categorizer import _heuristic_category

        assert _heuristic_category(desc) == cat

    def test_categorizer_unknowns_fall_back_to_other_when_llm_offline(self):
        import asyncio

        from app.services.transaction_categorizer import categorize_batch

        out = asyncio.run(categorize_batch(["SWIGGY", "XYZ PVT LTD 8812"]))
        assert out == ["Food & Dining", "Other"]

    @pytest.mark.parametrize("body,typ,amount", [
        ("Rs.450.00 debited from A/c XX1234 on 23-09-26 to VPA swiggy@icici. Avl Bal Rs 9550.00", "expense", 450.0),
        ("INR 85,000.00 credited to your A/c XX1234 on 23-09-26 by NEFT from ACME CORP", "income", 85000.0),
    ])
    def test_sms_parser_bank_messages(self, body, typ, amount):
        from app.services.sms_parser import parse_sms

        p = parse_sms(body, "HDFCBK")
        assert p["ok"] is True and p["type"] == typ and p["amount"] == amount

    @pytest.mark.parametrize("body", ["Your OTP is 482913. Do not share.", "Hey, dinner at 8?", ""])
    def test_sms_parser_ignores_non_transactions(self, body):
        from app.services.sms_parser import parse_sms

        assert parse_sms(body)["ok"] is False


# ── Import API ───────────────────────────────────────────────────────────────
class TestImportApi:
    def test_preview_detects_bank_categorises_and_flags(self, client):
        _, r = _preview(client)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["bank_detected"] == "HDFC Bank" and body["total_rows"] == 4
        cats = {row["description"]: row for row in body["rows"]}
        assert cats["UPI-SWIGGY-BANGALORE"]["suggested_category"] == "Food & Dining"
        assert cats["SALARY CREDIT ACME"]["suggested_category"] == "Salary"
        assert cats["IGST ON CARD FEE"]["suggested_category"] == "Taxes & Fees"
        assert cats["HDFC BANK EMI 3 OF 12 LOAN"]["is_emi"] is True

    def test_empty_file_and_bad_mapping_json(self, client):
        assert _preview(client, content=b"")[1].status_code == 400
        assert _preview(client, column_mapping="{not json")[1].status_code == 400

    def test_unknown_format_asks_for_column_mapping(self, client):
        _, r = _preview(client, content=b"When,What,HowMuch\n2025-01-01,thing,5\n")
        assert r.json()["needs_column_mapping"] is True and "HowMuch" in r.json()["available_columns"]

    def test_confirm_imports_included_rows_and_then_flags_duplicates(self, client):
        acct, r = _preview(client)
        rows = [{"row_index": x["row_index"], "date": x["date"], "description": x["description"], "amount": x["amount"],
                 "tx_type": x["tx_type"], "category": x["suggested_category"], "include": i < 2}
                for i, x in enumerate(r.json()["rows"])]
        out = client.post(f"{API}/finance/import/confirm", json={"account_id": acct["id"], "account_name": acct["name"], "rows": rows}).json()
        assert out == {"imported": 2, "skipped": 2}
        assert len(client.get(f"{API}/finance/transactions").json()) == 2
        again = client.post(f"{API}/finance/import/preview", files={"file": ("s.csv", HDFC_CSV, "text/csv")}, data={"account_id": acct["id"]}).json()
        assert again["duplicate_count"] == 2

    def test_confirm_emi_row_pays_down_linked_debt(self, client):
        debt = client.post(f"{API}/finance/debt", json={"name": "Loan", "principal": 60000, "outstanding": 60000, "emi_amount": 5000}).json()
        acct = _account(client)
        row = {"row_index": 0, "date": D, "description": "EMI", "amount": 5000, "tx_type": "expense",
               "category": "EMI/Loan", "include": True, "debt_id": debt["id"]}
        client.post(f"{API}/finance/import/confirm", json={"account_id": acct["id"], "account_name": acct["name"], "rows": [row]})
        assert client.get(f"{API}/finance/debt/{debt['id']}").json()["outstanding"] == 55000

    def test_import_cannot_pay_down_another_users_debt(self, client, user_a, user_b):
        """Regression: import confirm looked debts up by id only."""
        debt = client.post(f"{API}/finance/debt", json={"name": "Loan", "principal": 100, "outstanding": 100}, headers=user_a).json()
        acct = _account(client, headers=user_b)
        row = {"row_index": 0, "date": D, "description": "x", "amount": 100, "tx_type": "expense", "include": True, "debt_id": debt["id"]}
        client.post(f"{API}/finance/import/confirm", json={"account_id": acct["id"], "account_name": acct["name"], "rows": [row]}, headers=user_b)
        assert client.get(f"{API}/finance/debt/{debt['id']}", headers=user_a).json()["outstanding"] == 100

    def test_duplicate_check_ignores_other_users(self, client, user_a, user_b):
        """Regression: duplicate detection matched other users' transactions (and leaked their ids)."""
        acct_a, r = _preview(client, headers=user_a)
        rows = [{"row_index": x["row_index"], "date": x["date"], "description": x["description"], "amount": x["amount"],
                 "tx_type": x["tx_type"], "include": True} for x in r.json()["rows"]]
        client.post(f"{API}/finance/import/confirm", json={"account_id": acct_a["id"], "account_name": acct_a["name"], "rows": rows}, headers=user_a)
        _, rb = _preview(client, headers=user_b)
        assert rb.json()["duplicate_count"] == 0

    def test_bank_list(self, client):
        assert any(b["key"] == "hdfc" for b in client.get(f"{API}/finance/import/banks").json()["banks"])


class TestReports:
    def test_monthly_report_json(self, client):
        client.post(f"{API}/finance/transactions", json={"type": "expense", "amount": 300, "date": D, "category": "Transport"})
        r = client.get(f"{API}/finance/report/{TODAY.year}/{TODAY.month}").json()
        assert r["total_expense"] == 300

    @pytest.mark.parametrize("fmt,ctype", [("csv", "text/csv"), ("pdf", "application/pdf")])
    def test_report_export_downloads(self, client, fmt, ctype):
        """Regression: export called monthly_report without the user and crashed on every download."""
        client.post(f"{API}/finance/transactions", json={"type": "expense", "amount": 300, "date": D, "category": "Transport"})
        r = client.get(f"{API}/finance/report/{TODAY.year}/{TODAY.month}/export", params={"format": fmt})
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith(ctype) and len(r.content) > 50

    def test_pdf_export_survives_non_latin_text(self, client):
        client.post(f"{API}/finance/transactions", json={"type": "expense", "amount": 80, "date": D,
                                                           "category": "Food & Dining", "account": "पेटीएम 💳", "payee": "चाय ☕"})
        r = client.get(f"{API}/finance/report/{TODAY.year}/{TODAY.month}/export", params={"format": "pdf"})
        assert r.status_code == 200 and r.content.startswith(b"%PDF")

    def test_report_export_rejects_unknown_format(self, client):
        assert client.get(f"{API}/finance/report/2025/1/export", params={"format": "xml"}).status_code == 400

    def test_report_uses_only_own_budgets(self, client, user_a, user_b):
        client.post(f"{API}/finance/budgets", json={"category": None, "amount": 1234}, headers=user_a)
        r = client.get(f"{API}/finance/report/{TODAY.year}/{TODAY.month}", headers=user_b).json()
        assert r["budget_overall"] is None


# ── SMS API ──────────────────────────────────────────────────────────────────
SMS = "Rs.450.00 debited from A/c XX1234 on 23-09-26 to VPA swiggy@icici. Avl Bal Rs 9550.00"


class TestSmsApi:
    def test_status_endpoint_works(self, client):
        """Regression: /sms/status crashed with a composite-primary-key lookup."""
        r = client.get(f"{API}/sms/status")
        assert r.status_code == 200 and "imessage_available" in r.json()

    def test_third_party_httpsms_endpoints_removed(self, client):
        """SMS now comes only from the phone itself (parsed on-device) or iMessage."""
        assert client.post(f"{API}/sms/sync-httpsms").status_code == 404
        assert client.get(f"{API}/sms/debug").status_code == 404
        assert "httpsms_configured" not in client.get(f"{API}/sms/status").json()

    def test_inbound_creates_pending_and_dedups(self, client):
        first = client.post(f"{API}/sms/inbound", json={"body": SMS, "sender": "HDFCBK"}).json()
        assert first["status"] == "ok" and first["parsed"] is True
        assert client.post(f"{API}/sms/inbound", json={"body": SMS, "sender": "HDFCBK"}).json()["status"] == "duplicate_or_skipped"
        assert client.post(f"{API}/sms/inbound", json={"body": "hello there"}).json()["status"] == "duplicate_or_skipped"
        pending = client.get(f"{API}/sms/pending").json()
        assert len(pending) == 1 and pending[0]["amount"] == 450

    def test_confirm_creates_transaction_once(self, client):
        sms_id = client.post(f"{API}/sms/inbound", json={"body": SMS, "sender": "HDFCBK"}).json()["id"]
        out = client.post(f"{API}/sms/pending/{sms_id}/confirm", json={"category": "Food & Dining"})
        assert out.status_code == 201 and out.json()["transaction"]["category"] == "Food & Dining"
        assert client.post(f"{API}/sms/pending/{sms_id}/confirm", json={}).status_code == 400
        assert client.get(f"{API}/sms/pending").json() == []
        assert len(client.get(f"{API}/finance/transactions").json()) == 1

    def test_dismiss(self, client):
        sms_id = client.post(f"{API}/sms/inbound", json={"body": SMS}).json()["id"]
        assert client.post(f"{API}/sms/pending/{sms_id}/dismiss").json() == {"status": "dismissed"}
        assert client.get(f"{API}/sms/pending").json() == []
        assert client.post(f"{API}/sms/pending/nope/dismiss").status_code == 404

    def test_other_user_cannot_confirm_my_sms(self, client, user_a, user_b):
        sms_id = client.post(f"{API}/sms/inbound", json={"body": SMS}, headers=user_a).json()["id"]
        assert client.post(f"{API}/sms/pending/{sms_id}/confirm", json={}, headers=user_b).status_code == 404


# ── AI chat & insights ───────────────────────────────────────────────────────
class TestAi:
    def test_chat_grounds_answer_in_user_data(self, client, fake_llm):
        client.post(f"{API}/finance/transactions", json={"type": "expense", "amount": 999, "date": D, "payee": "Zomato"})
        fake_llm.reply = lambda payload: "You spent 999 on Zomato."
        r = client.post(f"{API}/ai/chat", json={"messages": [{"role": "user", "content": "What did I spend on food?"}]})
        assert r.json()["response"] == "You spent 999 on Zomato."
        system = fake_llm.calls[0]["messages"][0]["content"]
        assert "Zomato" in system

    def test_chat_never_leaks_other_users_data_into_prompt(self, client, fake_llm, user_a, user_b):
        client.post(f"{API}/finance/transactions", json={"type": "expense", "amount": 5, "date": D, "payee": "AliceSecretShop"}, headers=user_a)
        client.post(f"{API}/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]}, headers=user_b)
        assert "AliceSecretShop" not in fake_llm.calls[0]["messages"][0]["content"]

    def test_chat_keeps_only_last_12_turns(self, client, fake_llm):
        msgs = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"m{i}"} for i in range(20)]
        client.post(f"{API}/ai/chat", json={"messages": msgs})
        assert len(fake_llm.calls[0]["messages"]) == 1 + 12  # system + last 12

    def test_chat_offline_is_503(self, client):
        assert client.post(f"{API}/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]}).status_code == 503

    def test_ping_offline_is_503(self, client):
        assert client.post(f"{API}/ai/ping", json={}).status_code == 503

    @pytest.mark.parametrize("path", ["/ai/habit-insights", "/ai/subscription-insights"])
    def test_insight_endpoints_degrade_to_empty(self, client, path):
        r = client.post(f"{API}{path}")
        assert r.status_code == 200 and r.json()["insights"] == []

    def test_finance_advisor(self, client, fake_llm):
        fake_llm.reply = "Cut back on dining out; you're 20% over last month."
        r = client.post(f"{API}/finance/advisor")
        assert r.status_code == 200 and "dining" in str(r.json())

    def test_finance_advisor_offline_is_503(self, client):
        assert client.post(f"{API}/finance/advisor").status_code == 503

    def test_daily_insight_and_weekly_summary(self, client):
        h = client.post(f"{API}/habits", json={"name": "Read"}).json()
        client.put(f"{API}/habits/{h['id']}/checkins/{D}")
        assert client.get(f"{API}/insights/daily").status_code == 200
        assert client.get(f"{API}/insights/weekly-summary").status_code == 200


class TestAnalytics:
    def test_compute_today_and_snapshots(self, client):
        client.put(f"{API}/health-log/{D}", json={"sleep_hours": 8, "energy_level": 4})
        assert client.post(f"{API}/analytics/compute-today").status_code == 200
        snaps = client.get(f"{API}/analytics/snapshots", params={"from_date": D, "to_date": D}).json()
        assert snaps

    def test_backfill_correlations_daily_summary(self, client):
        assert client.post(f"{API}/analytics/backfill", params={"days": 7}).status_code == 200
        assert client.get(f"{API}/analytics/correlations").status_code == 200
        assert client.get(f"{API}/analytics/daily-summary").status_code == 200


class TestScheduledJobs:
    @pytest.mark.parametrize("job", [
        "_run_morning_briefing", "_run_habit_reminders", "_run_subscription_alerts", "_run_budget_warnings",
        "_run_analytics_snapshot", "_run_daily_insight", "_run_weekly_review",
    ])
    def test_job_runs_without_crashing_with_llm_offline(self, client, job):
        import app.scheduler as scheduler

        client.post(f"{API}/habits", json={"name": "Read"})
        client.post(f"{API}/subscriptions", json={"name": "Netflix", "amount": 649, "next_billing_date": D})
        getattr(scheduler, job)()

    def test_subscription_alert_fires_for_renewal_tomorrow(self, client):
        from app.services.notification_service import check_subscription_alerts
        from app.db import SessionLocal

        client.post(f"{API}/subscriptions", json={"name": "Netflix", "amount": 649, "next_billing_date": (TODAY + timedelta(days=1)).isoformat()})
        with SessionLocal() as db:
            assert check_subscription_alerts(db, force=True, user_id="") >= 1


@pytest.mark.parametrize("sms", [
    "OTP for your transaction of Rs.1,250.00 at AMAZON is 482913. Do not share it with anyone.",
    "123456 is your one time password for payment of INR 999 on Flipkart",
    "Rs.5,000 will be debited from A/c XX1234 on 05-10-26 towards EMI",
    "Your credit card bill of Rs 12,430 is due on 28-09-26. Pay now to avoid charges.",
    "Ravi has requested money of Rs 300 on UPI. Approve in your app.",
    "Get flat Rs.500 cashback on your next recharge! Offer valid till Sunday.",
])
def test_parser_ignores_sms_that_are_not_completed_transactions(sms):
    from app.services.sms_parser import parse_sms
    assert parse_sms(sms, "VM-HDFCBK")["ok"] is False
