"""Phone ↔ Mac pairing for direct access over Tailscale / the LAN.

The desktop backend has a single local owner (user_id ""), so a phone must act
as that user rather than as a separate account. The desktop UI asks for a
short-lived 6-digit code; the phone trades it for a long-lived device token.

Revocation: every device token carries `pv` (pairing version) and `dev`
(device id). "Unpair all devices" bumps the stored version, which invalidates
every outstanding token; removing one phone drops its id from the device list,
which invalidates only that phone's tokens.
"""
from __future__ import annotations

import json
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt
from sqlalchemy.orm import Session

from app.models.setting import Setting
from app.services.auth_service import JWT_ALGORITHM, JWT_SECRET, LOCAL_USER_ID

CODE_TTL_SECONDS = 10 * 60
MAX_ATTEMPTS = 5
DEVICE_REFRESH_DAYS = 180
DEVICE_ACCESS_MINUTES = 60

_KEY_VERSION = "pair.version"
_KEY_DEVICES = "pair.devices"

# One active code at a time, kept in memory only — a restart simply expires it.
_active: dict | None = None


def _get(db: Session, key: str) -> str | None:
    row = db.query(Setting).filter(Setting.key == key, Setting.user_id == LOCAL_USER_ID).first()
    return row.value if row else None


def _set(db: Session, key: str, value: str) -> None:
    row = db.query(Setting).filter(Setting.key == key, Setting.user_id == LOCAL_USER_ID).first()
    if row is None:
        db.add(Setting(key=key, user_id=LOCAL_USER_ID, value=value))
    else:
        row.value = value


def current_version(db: Session) -> int:
    return int(_get(db, _KEY_VERSION) or "1")


def start_pairing() -> dict:
    global _active
    code = f"{secrets.randbelow(1_000_000):06d}"
    _active = {"code": code, "expires": time.time() + CODE_TTL_SECONDS, "attempts": 0}
    return {"code": code, "expires_in": CODE_TTL_SECONDS}


def _tokens(device_id: str, pv: int) -> dict:
    now = datetime.now(timezone.utc)
    base = {"sub": LOCAL_USER_ID, "dev": device_id, "pv": pv}
    return {
        "access_token": jwt.encode({**base, "type": "access", "exp": now + timedelta(minutes=DEVICE_ACCESS_MINUTES)},
                                   JWT_SECRET, algorithm=JWT_ALGORITHM),
        "refresh_token": jwt.encode({**base, "type": "refresh", "exp": now + timedelta(days=DEVICE_REFRESH_DAYS)},
                                    JWT_SECRET, algorithm=JWT_ALGORITHM),
        "token_type": "bearer",
    }


def claim(db: Session, code: str, device_name: str) -> dict | None:
    """Exchange a pairing code for device tokens. Returns None if invalid."""
    global _active
    if _active is None or time.time() > _active["expires"]:
        _active = None
        return None
    if not secrets.compare_digest(code.strip(), _active["code"]):
        _active["attempts"] += 1
        if _active["attempts"] >= MAX_ATTEMPTS:
            _active = None  # brute-force guard: burn the code
        return None
    _active = None  # one-time use

    from app.services.auth_service import _get_or_create_local_user

    _get_or_create_local_user(db)
    device_id = str(uuid.uuid4())
    devices = list_devices(db)
    devices.append({"id": device_id, "name": device_name[:60] or "Phone",
                    "paired_at": datetime.now(timezone.utc).isoformat()})
    _set(db, _KEY_DEVICES, json.dumps(devices))
    db.commit()
    return _tokens(device_id, current_version(db))


def refresh(db: Session, payload: dict) -> dict | None:
    """Re-issue device tokens if the refresh token's pairing is still valid."""
    if not _device_is_paired(db, payload):
        return None
    return _tokens(payload.get("dev", ""), current_version(db))


def list_devices(db: Session) -> list[dict]:
    try:
        return json.loads(_get(db, _KEY_DEVICES) or "[]")
    except json.JSONDecodeError:
        return []


def unpair_device(db: Session, device_id: str) -> bool:
    """Revoke one phone. Returns False if no such device is paired."""
    devices = list_devices(db)
    remaining = [d for d in devices if d.get("id") != device_id]
    if len(remaining) == len(devices):
        return False
    _set(db, _KEY_DEVICES, json.dumps(remaining))
    db.commit()
    return True


def unpair_all(db: Session) -> None:
    _set(db, _KEY_VERSION, str(current_version(db) + 1))
    _set(db, _KEY_DEVICES, "[]")
    db.commit()


def is_remote(host: str | None) -> bool:
    """True for a real non-loopback IP (phone over Tailscale/LAN). Non-IP
    hosts only occur with in-process clients (e.g. tests), never over TCP."""
    import ipaddress

    try:
        return not ipaddress.ip_address(host or "").is_loopback
    except ValueError:
        return False


def local_addresses() -> list[dict]:
    """IPv4 addresses the phone could use, Tailscale (100.64.0.0/10) first."""
    import ipaddress
    import re
    import subprocess

    try:
        out = subprocess.run(["ifconfig"], capture_output=True, text=True, timeout=3).stdout
    except Exception:
        return []
    tailnet = ipaddress.ip_network("100.64.0.0/10")
    found = []
    for ip in re.findall(r"inet (\d+\.\d+\.\d+\.\d+)", out):
        addr = ipaddress.ip_address(ip)
        if addr.is_loopback or addr.is_link_local:
            continue
        found.append({"ip": ip, "kind": "tailscale" if addr in tailnet else "lan"})
    return sorted(found, key=lambda a: a["kind"] != "tailscale")


def _device_is_paired(db: Session, payload: dict) -> bool:
    return payload.get("pv") == current_version(db) and any(
        d.get("id") == payload.get("dev") for d in list_devices(db)
    )


def token_is_current(db: Session, payload: dict) -> bool:
    """Device tokens must match the current pairing version and a still-paired
    device; ordinary (cloud/login) tokens carry no `pv` and are judged elsewhere."""
    return "pv" not in payload or _device_is_paired(db, payload)
