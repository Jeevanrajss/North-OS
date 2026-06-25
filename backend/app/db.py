"""Database engine + session. SQLCipher is wired on by default.

If sqlcipher3 is not available (e.g. fresh Windows machine), we fall back to
plain sqlite3 with a loud warning, so the app still boots while you sort the
install. Flip DB_ENCRYPTION=false in .env to suppress.

We also load the `sqlite-vec` extension on every connection so the vector
virtual table `vec_embeddings` works.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, event, text
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


# sqlite-vec extension loader. Imported lazily so boot still works if the
# wheel isn't installed (we log a warning instead of crashing).
try:
    import sqlite_vec  # type: ignore

    _HAVE_VEC = True
except ImportError:
    _HAVE_VEC = False
    log.warning(
        "sqlite-vec not installed — vector search disabled. "
        "Install with: pip install sqlite-vec"
    )


# Ensure data dir exists
Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{settings.db_path}",
    module=_dbapi,
    connect_args={"check_same_thread": False},
    future=True,
)


@event.listens_for(engine, "connect")
def _on_connect(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    if _use_cipher:
        # Key must be applied on every fresh connection.
        cursor.execute(f"PRAGMA key = '{settings.db_passphrase}'")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

    # Load sqlite-vec extension on every connection.
    if _HAVE_VEC:
        try:
            dbapi_connection.enable_load_extension(True)
            sqlite_vec.load(dbapi_connection)
            dbapi_connection.enable_load_extension(False)
        except Exception as e:  # pragma: no cover
            log.warning("sqlite-vec load failed on this connection: %s", e)


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    """SQLAlchemy declarative base."""


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Vector table DDL (sqlite-vec virtual table)
# ---------------------------------------------------------------------------
VEC_EMBEDDING_DIM = 768  # nomic-embed-text-v1.5 default


def _ensure_vec_table(conn) -> None:
    if not _HAVE_VEC:
        return
    try:
        conn.execute(
            text(
                f"CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings "
                f"USING vec0(embedding float[{VEC_EMBEDDING_DIM}])"
            )
        )
    except Exception as e:  # pragma: no cover
        log.warning("Could not create vec_embeddings virtual table: %s", e)


def _dev_migrate_habits(conn) -> None:
    """Tiny in-place migration for the habits table.

    We're still pre-Alembic, so new columns added after someone's already
    created a database don't get applied by ``create_all``. Until the
    schema stabilizes, we do best-effort ``ALTER TABLE`` on boot so local
    devs don't have to nuke their SQLite file each time.

    Safe to run repeatedly — introspect PRAGMA table_info first.
    """
    try:
        rows = conn.execute(text("PRAGMA table_info(habits)")).all()
    except Exception as e:  # pragma: no cover — table not yet created
        log.debug("habits PRAGMA failed (table may not exist yet): %s", e)
        return
    existing_cols = {r[1] for r in rows}
    if "weekdays" not in existing_cols:
        try:
            conn.execute(text("ALTER TABLE habits ADD COLUMN weekdays VARCHAR(32)"))
            log.info("Dev migration: added habits.weekdays column")
        except Exception as e:  # pragma: no cover
            log.warning("Could not add habits.weekdays: %s", e)


def _dev_migrate_transactions(conn) -> None:
    """Add import_batch_id + Phase 7 columns to transactions table if missing."""
    try:
        rows = conn.execute(text("PRAGMA table_info(transactions)")).all()
    except Exception as e:
        log.debug("transactions PRAGMA failed (table may not exist yet): %s", e)
        return
    existing_cols = {r[1] for r in rows}
    new_cols = [
        ("import_batch_id", "VARCHAR(36)"),
        ("tax_amount",      "REAL"),
        ("debt_id",         "VARCHAR(36)"),
        ("investment_id",   "VARCHAR(36)"),
    ]
    for col, col_type in new_cols:
        if col not in existing_cols:
            try:
                conn.execute(text(f"ALTER TABLE transactions ADD COLUMN {col} {col_type}"))
                log.info("Dev migration: added transactions.%s column", col)
            except Exception as e:
                log.warning("Could not add transactions.%s: %s", col, e)


def _dev_migrate_accounts(conn) -> None:
    """Add nickname + card_variant columns to accounts table if they don't exist."""
    try:
        rows = conn.execute(text("PRAGMA table_info(accounts)")).all()
    except Exception as e:
        log.debug("accounts PRAGMA failed (table may not exist yet): %s", e)
        return
    existing_cols = {r[1] for r in rows}
    new_cols = [
        ("nickname", "VARCHAR(100)"),
        ("card_variant", "VARCHAR(100)"),
    ]
    for col, col_type in new_cols:
        if col not in existing_cols:
            try:
                conn.execute(text(f"ALTER TABLE accounts ADD COLUMN {col} {col_type}"))
                log.info("Dev migration: added accounts.%s column", col)
            except Exception as e:
                log.warning("Could not add accounts.%s: %s", col, e)


def _dev_migrate_users(conn) -> None:
    """Add Phase 8 columns to users table if missing."""
    try:
        rows = conn.execute(text("PRAGMA table_info(users)")).all()
    except Exception as e:
        log.debug("users PRAGMA failed: %s", e)
        return
    existing_cols = {r[1] for r in rows}
    new_cols = [
        ("password_hash",    "VARCHAR(255) NOT NULL DEFAULT ''"),
        ("invite_code_used", "VARCHAR(100)"),
        ("is_active",        "BOOLEAN NOT NULL DEFAULT 1"),
        ("last_login_at",    "DATETIME"),
    ]
    for col, col_type in new_cols:
        if col not in existing_cols:
            try:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {col_type}"))
                log.info("Dev migration: added users.%s column", col)
            except Exception as e:
                log.warning("Could not add users.%s: %s", col, e)


def _dev_migrate_subscriptions(conn) -> None:
    """Add payment_type and account_name to subscriptions if missing."""
    try:
        rows = conn.execute(text("PRAGMA table_info(subscriptions)")).all()
    except Exception as e:
        log.debug("subscriptions PRAGMA failed (table may not exist yet): %s", e)
        return
    existing_cols = {r[1] for r in rows}
    new_cols = [
        ("payment_type", "VARCHAR(20)"),
        ("account_name", "VARCHAR(60)"),
        ("paused_at", "DATETIME"),
        ("trial_end_date", "DATE"),
        ("post_trial_amount", "REAL"),
        ("is_autopay", "BOOLEAN NOT NULL DEFAULT 0"),
        ("last_renewed_at", "DATE"),
    ]
    for col, col_type in new_cols:
        if col not in existing_cols:
            try:
                conn.execute(text(f"ALTER TABLE subscriptions ADD COLUMN {col} {col_type}"))
                log.info("Dev migration: added subscriptions.%s column", col)
            except Exception as e:
                log.warning("Could not add subscriptions.%s: %s", col, e)


def _dev_migrate_add_user_id(conn, table_name: str) -> None:
    """Generic helper — add user_id VARCHAR(36) to any table if missing."""
    try:
        rows = conn.execute(text(f"PRAGMA table_info({table_name})")).all()
    except Exception as e:
        log.debug("PRAGMA failed for %s: %s", table_name, e)
        return
    existing_cols = {r[1] for r in rows}
    if "user_id" not in existing_cols:
        try:
            conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN user_id VARCHAR(36) NOT NULL DEFAULT ''"))
            log.info("Dev migration: added %s.user_id column", table_name)
        except Exception as e:
            log.warning("Could not add %s.user_id: %s", table_name, e)


def init_db() -> None:
    """Create tables from registered models + seed reference data.

    Week 2: still using `create_all`. Alembic baseline will land when the
    schema stabilizes.
    """
    # Import models so they register with Base.metadata.
    from app.models import account, budget, finance, finance_category, habit, journal, setting, subscription, user, sms_transaction, notification  # noqa: F401
    from app.models import analytics  # noqa: F401
    from app.models import goal  # noqa: F401
    from app.models import health_log  # noqa: F401
    from app.models.debt import Debt  # noqa: F401
    from app.models.debt_payment import DebtPayment  # noqa: F401
    from app.models.investment import Investment  # noqa: F401
    from app.models.investment_entry import InvestmentEntry  # noqa: F401
    from app.models.financial_goal import FinancialGoal  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # Vector table + seed data.
    from app.services.seed import seed_all  # local import to avoid circulars

    with engine.begin() as conn:
        _ensure_vec_table(conn)
        _dev_migrate_habits(conn)
        _dev_migrate_subscriptions(conn)
        _dev_migrate_accounts(conn)
        _dev_migrate_transactions(conn)
        _dev_migrate_users(conn)

        _tables_needing_user_id = [
            "transactions", "budgets", "habits", "habit_checkins",
            "journal_entries", "subscriptions", "goals", "health_logs",
            "notifications", "analytics_snapshots", "debts", "debt_payments",
            "investments", "investment_entries", "financial_goals",
            "settings", "sms_transactions", "accounts",
        ]
        for t in _tables_needing_user_id:
            _dev_migrate_add_user_id(conn, t)

    with SessionLocal() as session:
        seed_all(session)
