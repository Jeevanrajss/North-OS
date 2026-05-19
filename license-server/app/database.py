from __future__ import annotations

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Use DATABASE_URL env var if set (Railway explicit config), otherwise
# create /data dir (Railway volume) and use it, falling back to local file.
if not os.getenv("DATABASE_URL"):
    _data_dir = "/data"
    try:
        os.makedirs(_data_dir, exist_ok=True)
        _default_db = f"sqlite:///{_data_dir}/license.db"
    except OSError:
        _default_db = "sqlite:///./license.db"
else:
    _default_db = os.getenv("DATABASE_URL", "sqlite:///./license.db")

DATABASE_URL = os.getenv("DATABASE_URL", _default_db)

# SQLite needs check_same_thread=False for FastAPI's async handling
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    import logging
    logging.basicConfig(level=logging.INFO)
    logging.getLogger(__name__).info("DATABASE_URL in use: %s", DATABASE_URL)
    from app import models  # noqa: F401 — registers models with Base
    Base.metadata.create_all(bind=engine)
