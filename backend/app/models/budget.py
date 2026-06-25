"""Budget model — overall and per-category monthly spending targets."""
from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, DateTime, Float, Integer, String

from app.db import Base


class Budget(Base):
    __tablename__ = "budgets"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(36), nullable=False, index=True, default="")
    # NULL year / NULL month → recurring (applies every month)
    # specific year+month → overrides recurring for that period
    year = Column(Integer, nullable=True)
    month = Column(Integer, nullable=True)
    # NULL category → overall spending budget
    category = Column(String(60), nullable=True)
    amount = Column(Float, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
