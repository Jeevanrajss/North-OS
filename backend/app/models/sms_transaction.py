"""
SmsTransaction — stores every inbound bank SMS and its parsed result.
status:  pending | confirmed | dismissed
source:  android | imessage
"""
from datetime import datetime
import uuid
from sqlalchemy import Column, String, Float, DateTime, Boolean, Text
from app.db import Base


class SmsTransaction(Base):
    __tablename__ = "sms_transactions"

    id            = Column(String,  primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id       = Column(String(36),  nullable=False, index=True, default="")
    source        = Column(String(20),  nullable=False)          # "android" | "imessage"
    # Client-supplied SMS content-provider id — set only by the mobile app's
    # POST /sms/import flow (Phase 10). Null for the iMessage/webhook flows,
    # which dedup on raw_body instead. Used to short-circuit re-import of
    # the exact same device SMS across app restarts.
    sms_id        = Column(String(64),  nullable=True, index=True)
    sender        = Column(String(100), nullable=True)           # e.g. "HDFCBK"
    raw_body      = Column(Text,        nullable=False)
    received_at   = Column(DateTime,    nullable=False, default=datetime.utcnow)

    # Parsed fields (null = parse failed)
    parsed_ok     = Column(Boolean,     nullable=False, default=False)
    txn_type      = Column(String(10),  nullable=True)           # "expense" | "income"
    amount        = Column(Float,       nullable=True)
    currency      = Column(String(5),   nullable=True, default="INR")
    payee         = Column(String(200), nullable=True)
    account       = Column(String(100), nullable=True)
    balance       = Column(Float,       nullable=True)
    txn_date      = Column(String(10),  nullable=True)           # YYYY-MM-DD

    status        = Column(String(20),  nullable=False, default="pending")  # pending|confirmed|dismissed
    transaction_id = Column(String,     nullable=True)           # FK to finance.Transaction after confirm
