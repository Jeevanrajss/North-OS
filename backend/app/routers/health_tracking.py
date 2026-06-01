"""Health tracking router — daily sleep, energy, exercise logs."""
from __future__ import annotations

import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.health_log import HealthLog

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/health-log", tags=["health"])


class HealthLogIn(BaseModel):
    sleep_hours: float | None = Field(default=None, ge=0, le=24)
    energy_level: int | None = Field(default=None, ge=1, le=5)
    exercise_minutes: int | None = Field(default=None, ge=0, le=480)
    exercise_type: str | None = Field(default=None, max_length=100)
    water_glasses: int | None = Field(default=None, ge=0, le=30)
    notes: str | None = Field(default=None, max_length=500)


class HealthLogOut(BaseModel):
    id: str
    log_date: date
    sleep_hours: float | None
    energy_level: int | None
    exercise_minutes: int | None
    exercise_type: str | None
    water_glasses: int | None
    notes: str | None

    model_config = {"from_attributes": True}


class HealthStatsOut(BaseModel):
    days_with_data: int
    avg_sleep_hours: float | None
    avg_energy_level: float | None
    avg_exercise_minutes: float | None
    exercise_days: int
    total_water_glasses: int


@router.get("/stats", response_model=HealthStatsOut)
def health_stats(
    days: int = 30,
    db: Session = Depends(get_db),
):
    cutoff = date.today() - timedelta(days=days - 1)
    logs = db.query(HealthLog).filter(HealthLog.log_date >= cutoff).all()

    sleep_vals   = [l.sleep_hours for l in logs if l.sleep_hours is not None]
    energy_vals  = [l.energy_level for l in logs if l.energy_level is not None]
    exercise_vals= [l.exercise_minutes for l in logs if l.exercise_minutes and l.exercise_minutes > 0]

    return HealthStatsOut(
        days_with_data=len(logs),
        avg_sleep_hours=round(sum(sleep_vals)/len(sleep_vals), 1) if sleep_vals else None,
        avg_energy_level=round(sum(energy_vals)/len(energy_vals), 1) if energy_vals else None,
        avg_exercise_minutes=round(sum(exercise_vals)/len(exercise_vals), 0) if exercise_vals else None,
        exercise_days=len(exercise_vals),
        total_water_glasses=sum(l.water_glasses or 0 for l in logs),
    )


@router.get("/", response_model=list[HealthLogOut])
def list_logs(days: int = 30, db: Session = Depends(get_db)):
    cutoff = date.today() - timedelta(days=days - 1)
    return (
        db.query(HealthLog)
        .filter(HealthLog.log_date >= cutoff)
        .order_by(HealthLog.log_date.asc())
        .all()
    )


@router.get("/{log_date}", response_model=HealthLogOut)
def get_log(log_date: date, db: Session = Depends(get_db)):
    row = db.query(HealthLog).filter(HealthLog.log_date == log_date).first()
    if not row:
        raise HTTPException(status_code=404, detail="No log for this date")
    return row


@router.put("/{log_date}", response_model=HealthLogOut)
def upsert_log(log_date: date, body: HealthLogIn, db: Session = Depends(get_db)):
    today = date.today()
    if log_date > today + timedelta(days=1):
        raise HTTPException(status_code=422, detail="Cannot log health data for a future date.")
    if log_date < today - timedelta(days=365):
        raise HTTPException(status_code=422, detail="Date is too far in the past.")

    row = db.query(HealthLog).filter(HealthLog.log_date == log_date).first()
    if row is None:
        row = HealthLog(log_date=log_date)
        db.add(row)

    # Additive — only overwrite fields that were explicitly provided
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)

    db.commit()
    db.refresh(row)

    # Update analytics snapshot for this date (non-fatal)
    try:
        from app.services.analytics_engine import compute_snapshot_for_date
        compute_snapshot_for_date(db, log_date)
    except Exception as e:
        log.debug("Analytics snapshot update skipped: %s", e)

    return row


@router.delete("/{log_date}", status_code=204)
def delete_log(log_date: date, db: Session = Depends(get_db)):
    row = db.query(HealthLog).filter(HealthLog.log_date == log_date).first()
    if row:
        db.delete(row)
        db.commit()
