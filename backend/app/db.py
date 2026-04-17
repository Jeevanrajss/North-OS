"""Database engine + session. SQLCipher is wired on by default.

If sqlcipher3 is not available (e.g. fresh Windows machine), we fall back to
plain sqlite3 with a loud warning, so the app still boots while you sort the
install. Flip DB_ENCRYPTION=false in .env to suppress.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings

log = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Resolve DB driver: SQLCipher if available + enabled, else fall back.
# ---------------------------------------------------------------------------
_dbapi: Any
_use_cipher = False
try:
    if settings.db_encryption:
        import sqlcipher3 as _dbapi  # type: ignore

        _use_cipher = True
    else:
        import sqlite3 as _dbapi  # type: ignore
except ImportError:
    log.warning(
        "sqlcipher3 not installed — falling back to unencrypted sqlite. "
        "Install with: pip install sqlcipher3-binary  (or set DB_ENCRYPTION=false)"
    )
    import sqlite3 as _dbapi  # type: ignore


# Ensure data dir exists
Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{settings.db_path}",
    module=_dbapi,
    connect_args={"check_same_thread": False},
    future=True,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    if _use_cipher:
        # Key must be applied on every fresh connection.
        cursor.execute(f"PRAGMA key = '{settings.db_passphrase}'")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    """SQLAlchemy declarative base."""


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables from registered models. Week 1 uses this directly;
    we'll switch to Alembic migrations from Week 2 onwards."""
    # Import models so they register with Base.metadata
    from app.models import user  # noqa: F401

    Base.metadata.create_all(bind=engine)
