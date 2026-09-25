"""Phone ↔ Mac pairing and the remote-access guard (direct access over Tailscale/LAN)."""
import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import pairing
from conftest import API

D = date.today().isoformat()
PHONE_IP = ("100.101.102.103", 51000)  # a Tailscale (CGNAT) address


@pytest.fixture
def phone(client):
    # Separate client whose requests arrive from a non-loopback address.
    return TestClient(app, client=PHONE_IP)


def _pair(client, phone) -> dict:
    code = client.post(f"{API}/pair/start").json()["code"]
    r = phone.post(f"{API}/pair/claim", json={"code": code, "device_name": "Pixel"})
    assert r.status_code == 200, r.text
    return r.json()


def _auth(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


class TestGuard:
    def test_unpaired_phone_is_locked_out_of_data(self, phone):
        for path in ("/finance/transactions", "/habits", "/journal/days/" + D, "/goals/", "/settings"):
            assert phone.get(f"{API}{path}").status_code == 401, path

    def test_unpaired_phone_cannot_register_or_start_pairing(self, phone):
        assert phone.post(f"{API}/auth/register", json={"name": "x", "email": "x@x.com", "password": "p", "invite_code": "test-invite"}).status_code == 401
        assert phone.post(f"{API}/pair/start").status_code == 401

    def test_ping_stays_open_for_reachability_checks(self, phone):
        assert phone.get(f"{API}/ping").json() == {"ok": True}

    def test_mac_itself_needs_no_login(self, client):
        assert client.get(f"{API}/finance/transactions").status_code == 200

    def test_cloud_style_login_tokens_are_not_accepted_remotely(self, client, phone, user_a):
        assert phone.get(f"{API}/finance/transactions", headers=user_a).status_code == 401

    def test_browser_preflight_allowed_and_401s_carry_cors_headers(self, phone):
        pre = phone.options(f"{API}/habits", headers={"Origin": "http://x", "Access-Control-Request-Method": "GET"})
        assert pre.status_code == 200
        r = phone.get(f"{API}/habits", headers={"Origin": "http://x"})
        assert r.status_code == 401 and r.headers.get("access-control-allow-origin")

    def test_forged_token_rejected(self, phone):
        r = phone.get(f"{API}/habits", headers={"Authorization": "Bearer not.a.jwt"})
        assert r.status_code == 401


class TestPairing:
    def test_paired_phone_sees_the_macs_own_data(self, client, phone):
        client.post(f"{API}/finance/transactions", json={"type": "expense", "amount": 42, "date": D, "payee": "Mac entry"})
        tokens = _pair(client, phone)
        rows = phone.get(f"{API}/finance/transactions", headers=_auth(tokens)).json()
        assert [t["payee"] for t in rows] == ["Mac entry"]

    def test_phone_writes_land_in_the_macs_data(self, client, phone):
        tokens = _pair(client, phone)
        phone.post(f"{API}/habits", json={"name": "From phone"}, headers=_auth(tokens))
        assert [h["name"] for h in client.get(f"{API}/habits").json()] == ["From phone"]

    def test_code_is_single_use(self, client, phone):
        code = client.post(f"{API}/pair/start").json()["code"]
        assert phone.post(f"{API}/pair/claim", json={"code": code}).status_code == 200
        assert phone.post(f"{API}/pair/claim", json={"code": code}).status_code == 401

    def test_wrong_code_attempts_burn_the_code(self, client, phone):
        code = client.post(f"{API}/pair/start").json()["code"]
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(pairing.MAX_ATTEMPTS):
            assert phone.post(f"{API}/pair/claim", json={"code": wrong}).status_code == 401
        assert phone.post(f"{API}/pair/claim", json={"code": code}).status_code == 401

    def test_expired_code_rejected(self, client, phone, monkeypatch):
        code = client.post(f"{API}/pair/start").json()["code"]
        monkeypatch.setattr(pairing.time, "time", lambda: 10**12)
        assert phone.post(f"{API}/pair/claim", json={"code": code}).status_code == 401

    def test_start_returns_port_and_addresses(self, client):
        body = client.post(f"{API}/pair/start").json()
        assert len(body["code"]) == 6 and body["code"].isdigit()
        assert "addresses" in body and body["expires_in"] == pairing.CODE_TTL_SECONDS

    def test_refresh_keeps_device_access(self, client, phone):
        tokens = _pair(client, phone)
        new = phone.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        assert new.status_code == 200
        assert phone.get(f"{API}/habits", headers=_auth(new.json())).status_code == 200

    def test_unpair_all_revokes_access_and_refresh(self, client, phone):
        tokens = _pair(client, phone)
        assert [d["name"] for d in client.get(f"{API}/pair/devices").json()] == ["Pixel"]
        client.delete(f"{API}/pair/devices")
        assert phone.get(f"{API}/habits", headers=_auth(tokens)).status_code == 401
        assert phone.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401
        assert client.get(f"{API}/pair/devices").json() == []

    def test_unpair_one_device_keeps_the_others(self, client, phone):
        pixel = _pair(client, phone)
        code = client.post(f"{API}/pair/start").json()["code"]
        tablet = phone.post(f"{API}/pair/claim", json={"code": code, "device_name": "Tablet"}).json()
        devices = client.get(f"{API}/pair/devices").json()
        pixel_id = next(d["id"] for d in devices if d["name"] == "Pixel")

        assert client.delete(f"{API}/pair/devices/{pixel_id}").status_code == 200
        assert [d["name"] for d in client.get(f"{API}/pair/devices").json()] == ["Tablet"]
        assert phone.get(f"{API}/habits", headers=_auth(pixel)).status_code == 401
        assert phone.post(f"{API}/auth/refresh", json={"refresh_token": pixel["refresh_token"]}).status_code == 401
        assert phone.get(f"{API}/habits", headers=_auth(tablet)).status_code == 200
        assert phone.post(f"{API}/auth/refresh", json={"refresh_token": tablet["refresh_token"]}).status_code == 200

    def test_unpair_unknown_device_is_404(self, client):
        assert client.delete(f"{API}/pair/devices/nope").status_code == 404

    def test_phone_cannot_list_or_unpair_devices(self, client, phone):
        tokens = _pair(client, phone)
        assert phone.get(f"{API}/pair/devices", headers=_auth(tokens)).status_code == 403
        assert phone.delete(f"{API}/pair/devices", headers=_auth(tokens)).status_code == 403
        dev_id = client.get(f"{API}/pair/devices").json()[0]["id"]
        assert phone.delete(f"{API}/pair/devices/{dev_id}", headers=_auth(tokens)).status_code == 403

    @pytest.mark.parametrize("host,remote", [
        ("127.0.0.1", False), ("::1", False), ("testclient", False),
        ("100.101.102.103", True), ("192.168.1.20", True),
    ])
    def test_is_remote(self, host, remote):
        assert pairing.is_remote(host) is remote


class TestReplaySafeCreates:
    """The phone's outbox may resend a create after a timeout — it must not duplicate."""

    def test_transaction_with_client_id_is_idempotent(self, client):
        tid = str(uuid.uuid4())
        body = {"id": tid, "type": "expense", "amount": 99, "date": D, "payee": "Chai"}
        assert client.post(f"{API}/finance/transactions", json=body).json()["id"] == tid
        assert client.post(f"{API}/finance/transactions", json=body).json()["id"] == tid
        assert len(client.get(f"{API}/finance/transactions").json()) == 1

    def test_transaction_id_owned_by_someone_else_is_409(self, client, user_a, user_b):
        tid = str(uuid.uuid4())
        client.post(f"{API}/finance/transactions", json={"id": tid, "amount": 1, "date": D}, headers=user_a)
        assert client.post(f"{API}/finance/transactions", json={"id": tid, "amount": 1, "date": D}, headers=user_b).status_code == 409

    def test_journal_entry_with_client_id_is_idempotent(self, client):
        eid = str(uuid.uuid4())
        body = {"id": eid, "content_text": "Quick note from the phone"}
        client.post(f"{API}/journal/days/{D}/entries", json=body)
        client.post(f"{API}/journal/days/{D}/entries", json=body)
        assert [e["id"] for e in client.get(f"{API}/journal/days/{D}").json()["entries"]] == [eid]

    def test_habit_tick_replay_is_harmless(self, client):
        h = client.post(f"{API}/habits", json={"name": "Run"}).json()
        for _ in range(3):
            assert client.put(f"{API}/habits/{h['id']}/checkins/{D}").status_code == 200
        assert client.get(f"{API}/habits/today").json()["habits"][0]["done"] is True
