"""Subscription CRUD + stats endpoints."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.subscription import Subscription
from app.schemas.subscription import (
    MONTHLY_MULT,
    SubscriptionIn,
    SubscriptionOut,
    SubscriptionPatch,
    SubscriptionStatsResponse,
    UpcomingRenewal,
)

router = APIRouter(prefix="/api/v1/subscriptions", tags=["subscriptions"])


# /stats MUST be defined before /{sub_id} so FastAPI does not treat the
# literal string "stats" as a path parameter.
@router.get("/stats", response_model=SubscriptionStatsResponse)
def get_stats(db: Session = Depends(get_db)):
    today = date.today()
    subs = db.query(Subscription).filter(Subscription.cancelled_at.is_(None)).all()
    monthly_total = sum(s.amount * MONTHLY_MULT.get(s.billing_cycle, 1.0) for s in subs)
    cutoff = today + timedelta(days=30)
    upcoming = [
        UpcomingRenewal(
            subscription=SubscriptionOut.model_validate(s),
            days_until=(s.next_billing_date - today).days,
        )
        for s in subs
        if s.next_billing_date <= cutoff
    ]
    upcoming.sort(key=lambda x: x.days_until)
    return SubscriptionStatsResponse(
        active_count=len(subs),
        monthly_total=round(monthly_total, 2),
        yearly_total=round(monthly_total * 12, 2),
        upcoming_30d=upcoming,
    )


@router.get("", response_model=list[SubscriptionOut])
def list_subscriptions(
    include_cancelled: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(Subscription)
    if not include_cancelled:
        q = q.filter(Subscription.cancelled_at.is_(None))
    return q.order_by(Subscription.next_billing_date).all()


@router.post("", response_model=SubscriptionOut, status_code=201)
def create_subscription(body: SubscriptionIn, db: Session = Depends(get_db)):
    sub = Subscription(id=str(uuid.uuid4()), **body.model_dump())
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


@router.get("/{sub_id}", response_model=SubscriptionOut)
def get_subscription(sub_id: str, db: Session = Depends(get_db)):
    sub = db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return sub


@router.patch("/{sub_id}", response_model=SubscriptionOut)
def patch_subscription(sub_id: str, body: SubscriptionPatch, db: Session = Depends(get_db)):
    sub = db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(sub, k, v)
    db.commit()
    db.refresh(sub)
    return sub


@router.delete("/{sub_id}", response_model=SubscriptionOut)
def cancel_subscription(sub_id: str, db: Session = Depends(get_db)):
    sub = db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.cancelled_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(sub)
    return sub


@router.post("/{sub_id}/restore", response_model=SubscriptionOut)
def restore_subscription(sub_id: str, db: Session = Depends(get_db)):
    sub = db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.cancelled_at = None
    db.commit()
    db.refresh(sub)
    return sub


@router.post("/{sub_id}/pause", response_model=SubscriptionOut)
def pause_subscription(sub_id: str, db: Session = Depends(get_db)):
    sub = db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if sub.paused_at is None:
        sub.paused_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(sub)
    return sub


@router.post("/{sub_id}/unpause", response_model=SubscriptionOut)
def unpause_subscription(sub_id: str, db: Session = Depends(get_db)):
    sub = db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.paused_at = None
    db.commit()
    db.refresh(sub)
    return sub
