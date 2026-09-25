"""Pair a phone with this Mac (direct access over Tailscale / LAN).

  POST   /api/v1/pair/start     (this Mac only)  → one-time 6-digit code + addresses
  POST   /api/v1/pair/claim     (phone)          → device tokens for the local owner
  GET    /api/v1/pair/devices   (this Mac only)  → paired phones
  DELETE /api/v1/pair/devices   (this Mac only)  → unpair every phone
  DELETE /api/v1/pair/devices/{id} (this Mac only) → unpair one phone
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import pairing

router = APIRouter(prefix="/api/v1/pair", tags=["pairing"])


def _this_mac_only(request: Request) -> None:
    if pairing.is_remote(request.client.host if request.client else None):
        raise HTTPException(403, "Only available on the Mac itself.")


@router.post("/start", dependencies=[Depends(_this_mac_only)])
def start(request: Request):
    return {**pairing.start_pairing(), "port": request.url.port, "addresses": pairing.local_addresses()}


class ClaimBody(BaseModel):
    code: str = Field(..., min_length=6, max_length=6)
    device_name: str = Field(default="Phone", max_length=60)


@router.post("/claim")
def claim(body: ClaimBody, db: Session = Depends(get_db)):
    tokens = pairing.claim(db, body.code, body.device_name)
    if tokens is None:
        raise HTTPException(401, "Invalid or expired pairing code.")
    return tokens


@router.get("/devices", dependencies=[Depends(_this_mac_only)])
def devices(db: Session = Depends(get_db)):
    return pairing.list_devices(db)


@router.delete("/devices", dependencies=[Depends(_this_mac_only)])
def unpair_all(db: Session = Depends(get_db)):
    pairing.unpair_all(db)
    return {"ok": True}


@router.delete("/devices/{device_id}", dependencies=[Depends(_this_mac_only)])
def unpair_device(device_id: str, db: Session = Depends(get_db)):
    if not pairing.unpair_device(db, device_id):
        raise HTTPException(404, "No paired phone with that id.")
    return {"ok": True}
