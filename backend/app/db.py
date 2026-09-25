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
        # Phase 10 — SMS auto-import
        ("source",          "VARCHAR(20) NOT NULL DEFAULT 'manual'"),
        ("sms_id",          "VARCHAR(64)"),
        ("account_last4",   "VARCHAR(4)"),
    ]
    for col, col_type in new_cols:
        if col not in existing_cols:
            try:
                conn.execute(text(f"ALTER TABLE transactions ADD COLUMN {col} {col_type}"))
                log.info("Dev migration: added transactions.%s column", col)
            except Exception as e:
                log.warning("Could not add transactions.%s: %s", col, e)


def _dev_migrate_sms_transactions(conn) -> None:
    """Add Phase 10 sms_id column to sms_transactions if missing."""
    try:
        rows = conn.execute(text("PRAGMA table_info(sms_transactions)")).all()
    except Exception as e:
        log.debug("sms_transactions PRAGMA failed (table may not exist yet): %s", e)
        return
    existing_cols = {r[1] for r in rows}
    if "sms_id" not in existing_cols:
        try:
            conn.execute(text("ALTER TABLE sms_transactions ADD COLUMN sms_id VARCHAR(64)"))
            log.info("Dev migration: added sms_transactions.sms_id column")
        except Exception as e:
            log.warning("Could not add sms_transactions.sms_id: %s", e)


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


def _drop_indexes_on(conn, table_name: str) -> None:
    """Drop every non-autoindex on `table_name`.

    Used right after an ``ALTER TABLE ... RENAME TO`` in a table-rebuild
    migration: SQLite does NOT rename the indexes along with the table, so
    they keep their original names and stay attached to the renamed-away
    table. If the new table (created immediately after via
    ``Model.__table__.create``) declares an index with that same name,
    creation fails with "index already exists" — drop the stale ones first.
    """
    try:
        idx_rows = conn.execute(text(f"PRAGMA index_list({table_name})")).all()
    except Exception as e:
        log.warning("Could not list indexes on %s: %s", table_name, e)
        return
    for idx in idx_rows:
        idx_name = idx[1]
        if idx_name.startswith("sqlite_autoindex_"):
            continue  # implicit PK/UNIQUE index — dropped along with the table
        try:
            conn.execute(text(f"DROP INDEX IF EXISTS {idx_name}"))
        except Exception as e:
            log.warning("Could not drop index %s on %s: %s", idx_name, table_name, e)


def _dev_migrate_journal_days_identity(conn) -> None:
    """Rebuild journal_days so every user gets their own row per calendar date.

    `date` used to be the sole primary key, so every account on a shared
    server wrote to (and read) the same row for a given date — moods, tags,
    and the reflective summary leaked across users, and two users journaling
    on the same day overwrote each other. SQLite can't ALTER a PRIMARY KEY
    in place, so this rebuilds the table: synthetic `id` PK, `user_id`
    column, uniqueness moved to (user_id, date).

    Existing rows are assigned user_id="" — the local-account id (see
    auth_service.LOCAL_USER_ID) — so a single-user local/dev database keeps
    all of its history after upgrading.
    """
    try:
        rows = conn.execute(text("PRAGMA table_info(journal_days)")).all()
    except Exception as e:
        log.debug("journal_days PRAGMA failed (table may not exist yet): %s", e)
        return
    if not rows:
        return
    existing_cols = {r[1] for r in rows}
    if "id" in existing_cols:
        return  # already migrated

    log.info("Dev migration: rebuilding journal_days for per-user isolation")
    try:
        from app.models.journal import JournalDay

        old_rows = conn.execute(text(
            "SELECT date, mood_codes, tags, summary_highlights, summary_wins, "
            "summary_learnings, summary_gratitude, created_at, updated_at FROM journal_days"
        )).all()

        conn.execute(text("ALTER TABLE journal_days RENAME TO journal_days_old_pk"))
        _drop_indexes_on(conn, "journal_days_old_pk")
        JournalDay.__table__.create(bind=conn)

        import uuid as _uuid_mod

        for r in old_rows:
            conn.execute(
                text(
                    "INSERT INTO journal_days "
                    "(id, user_id, date, mood_codes, tags, summary_highlights, summary_wins, "
                    "summary_learnings, summary_gratitude, created_at, updated_at) "
                    "VALUES (:id, '', :date, :mood_codes, :tags, :sh, :sw, :sl, :sg, :ca, :ua)"
                ),
                {
                    "id": str(_uuid_mod.uuid4()),
                    "date": r[0], "mood_codes": r[1], "tags": r[2],
                    "sh": r[3], "sw": r[4], "sl": r[5], "sg": r[6],
                    "ca": r[7], "ua": r[8],
                },
            )
        conn.execute(text("DROP TABLE journal_days_old_pk"))
        log.info("Dev migration: journal_days rebuilt (%d rows preserved)", len(old_rows))
    except Exception as e:
        log.error("journal_days rebuild failed: %s", e)


def _dev_migrate_journal_entries_drop_fk(conn) -> None:
    """Rebuild journal_entries without its old FK to journal_days.date.

    That FK stopped making sense once journal_days.date is no longer unique
    on its own (see _dev_migrate_journal_days_identity) — the column it
    pointed at isn't the parent table's key anymore. SQLite can't ALTER
    TABLE DROP CONSTRAINT, so the table has to be recreated. Also folds in
    the user_id backfill for this table so it isn't done twice.
    """
    try:
        sql_row = conn.execute(
            text("SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_entries'")
        ).first()
    except Exception as e:
        log.debug("journal_entries lookup failed (table may not exist yet): %s", e)
        return
    if not sql_row or "REFERENCES" not in (sql_row[0] or "").upper():
        return  # table doesn't exist yet, or already rebuilt

    log.info("Dev migration: rebuilding journal_entries to drop stale FK")
    try:
        from app.models.journal import JournalEntry

        rows = conn.execute(text("PRAGMA table_info(journal_entries)")).all()
        existing_cols = {r[1] for r in rows}
        has_user_id = "user_id" in existing_cols

        select_cols = "id, day_date, content_json, content_text, created_at, updated_at"
        old_rows = conn.execute(text(
            f"SELECT {select_cols}{', user_id' if has_user_id else ''} FROM journal_entries"
        )).all()

        conn.execute(text("ALTER TABLE journal_entries RENAME TO journal_entries_old_fk"))
        _drop_indexes_on(conn, "journal_entries_old_fk")
        JournalEntry.__table__.create(bind=conn)

        for r in old_rows:
            uid = (r[6] if has_user_id else "") or ""
            conn.execute(
                text(
                    "INSERT INTO journal_entries "
                    "(id, user_id, day_date, content_json, content_text, created_at, updated_at) "
                    "VALUES (:id, :uid, :dd, :cj, :ct, :ca, :ua)"
                ),
                {"id": r[0], "uid": uid, "dd": r[1], "cj": r[2], "ct": r[3], "ca": r[4], "ua": r[5]},
            )
        conn.execute(text("DROP TABLE journal_entries_old_fk"))
        log.info("Dev migration: journal_entries rebuilt (%d rows preserved)", len(old_rows))
    except Exception as e:
        log.error("journal_entries rebuild failed: %s", e)


def _dev_migrate_analytics_snapshots_identity(conn) -> None:
    """Rebuild analytics_snapshots to drop the column-level UNIQUE on
    computed_date and replace it with a (user_id, computed_date) constraint.

    The original `unique=True` on computed_date meant the whole server
    shared one snapshot row per calendar date: a second user's scheduled
    job would crash outright with a UNIQUE constraint violation the moment
    it tried to compute a snapshot for a date the first user already had.
    SQLite can't ALTER a column-level UNIQUE away, so the table has to be
    rebuilt. Existing rows are assigned user_id="" (the local-account id),
    consistent with the other per-user rebuilds in this file.
    """
    try:
        table_rows = conn.execute(text("PRAGMA table_info(analytics_snapshots)")).all()
    except Exception as e:
        log.debug("analytics_snapshots lookup failed (table may not exist yet): %s", e)
        return
    if not table_rows:
        return

    # Inspect indexes: a UNIQUE index covering *only* computed_date means
    # this is still the old single-column-unique schema and must be rebuilt.
    # A UNIQUE index covering (user_id, computed_date) means it's already
    # been migrated — nothing to do.
    try:
        needs_rebuild = False
        for idx in conn.execute(text("PRAGMA index_list(analytics_snapshots)")).all():
            idx_name, is_unique = idx[1], idx[2]
            if not is_unique:
                continue
            cols = [r[2] for r in conn.execute(text(f"PRAGMA index_info({idx_name})")).all()]
            if cols == ["computed_date"]:
                needs_rebuild = True
    except Exception as e:
        log.warning("Could not inspect analytics_snapshots indexes: %s", e)
        return
    if not needs_rebuild:
        return

    log.info("Dev migration: rebuilding analytics_snapshots for per-user isolation")
    try:
        from app.models.analytics import AnalyticsSnapshot

        rows = conn.execute(text("PRAGMA table_info(analytics_snapshots)")).all()
        existing_cols = {r[1] for r in rows}
        has_user_id = "user_id" in existing_cols

        cols = [
            "id", "computed_date", "habit_completion_rate", "mood_score",
            "daily_expense", "daily_income", "habits_done_count", "habits_scheduled_count",
            "journal_written", "journal_word_count", "sleep_hours", "energy_level",
            "exercise_minutes", "mood_codes_json", "expense_categories_json",
            "habit_detail_json", "created_at", "updated_at",
        ]
        select_cols = ", ".join(cols) + (", user_id" if has_user_id else "")
        old_rows = conn.execute(text(f"SELECT {select_cols} FROM analytics_snapshots")).all()

        conn.execute(text("ALTER TABLE analytics_snapshots RENAME TO analytics_snapshots_old_pk"))
        _drop_indexes_on(conn, "analytics_snapshots_old_pk")
        AnalyticsSnapshot.__table__.create(bind=conn)

        insert_cols = cols + ["user_id"]
        placeholders = ", ".join(f":{c}" for c in insert_cols)
        insert_sql = text(f"INSERT INTO analytics_snapshots ({', '.join(insert_cols)}) VALUES ({placeholders})")
        for r in old_rows:
            params = dict(zip(cols, r[: len(cols)]))
            params["user_id"] = (r[len(cols)] if has_user_id else "") or ""
            conn.execute(insert_sql, params)

        conn.execute(text("DROP TABLE analytics_snapshots_old_pk"))
        log.info("Dev migration: analytics_snapshots rebuilt (%d rows preserved)", len(old_rows))
    except Exception as e:
        log.error("analytics_snapshots rebuild failed: %s", e)


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


def _dev_migrate_health_logs_per_user_unique(conn) -> None:
    """health_logs.log_date used to be UNIQUE across all users, so a second
    account could never log a date someone else had. Swap that index for a
    UNIQUE(user_id, log_date) one. Existing rows can't conflict: dates were
    globally unique before."""
    try:
        indexes = conn.execute(text("PRAGMA index_list(health_logs)")).all()
    except Exception as e:
        log.debug("PRAGMA failed for health_logs: %s", e)
        return
    by_name = {r[1]: bool(r[2]) for r in indexes}
    if by_name.get("ix_health_logs_log_date"):
        conn.execute(text("DROP INDEX ix_health_logs_log_date"))
        conn.execute(text("CREATE INDEX ix_health_logs_log_date ON health_logs (log_date)"))
        log.info("Dev migration: health_logs.log_date no longer globally unique")
    if "uq_health_log_user_date" not in by_name:
        conn.execute(text("CREATE UNIQUE INDEX uq_health_log_user_date ON health_logs (user_id, log_date)"))


def _dev_migrate_splits_share_count(conn) -> None:
    """Weighted splits — how many shares each person takes."""
    rows = conn.execute(text("PRAGMA table_info(splits)")).all()
    if rows and "share_count" not in {r[1] for r in rows}:
        conn.execute(text("ALTER TABLE splits ADD COLUMN share_count INTEGER"))
        log.info("Dev migration: added splits.share_count column")


def _dev_migrate_add_deleted_at(conn, table_name: str) -> None:
    """Phase 12a — add deleted_at DATETIME NULL for sync tombstones.

    Soft-delete marker: a non-null deleted_at means the row was removed and
    the removal should propagate on sync. Distinct from domain states like
    archived_at / cancelled_at.
    """
    try:
        rows = conn.execute(text(f"PRAGMA table_info({table_name})")).all()
    except Exception as e:
        log.debug("PRAGMA failed for %s: %s", table_name, e)
        return
    if "deleted_at" not in {r[1] for r in rows}:
        try:
            conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN deleted_at DATETIME"))
            log.info("Dev migration: added %s.deleted_at column", table_name)
        except Exception as e:
            log.warning("Could not add %s.deleted_at: %s", table_name, e)


def _dev_migrate_add_updated_at(conn, table_name: str) -> None:
    """Phase 12a — add updated_at DATETIME for sync last-write-wins, backfilled
    to created_at (or now) so existing rows have a stable baseline timestamp."""
    try:
        rows = conn.execute(text(f"PRAGMA table_info({table_name})")).all()
    except Exception as e:
        log.debug("PRAGMA failed for %s: %s", table_name, e)
        return
    existing = {r[1] for r in rows}
    if "updated_at" not in existing:
        try:
            conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN updated_at DATETIME"))
            if "created_at" in existing:
                conn.execute(text(f"UPDATE {table_name} SET updated_at = created_at WHERE updated_at IS NULL"))
            else:
                conn.execute(text(f"UPDATE {table_name} SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL"))
            log.info("Dev migration: added %s.updated_at column (backfilled)", table_name)
        except Exception as e:
            log.warning("Could not add %s.updated_at: %s", table_name, e)


_soft_delete_filter_installed = False


def _install_soft_delete_filter() -> None:
    """Phase 12a — globally exclude soft-deleted rows from every ORM SELECT.

    Any query touching a synced model automatically gets `deleted_at IS NULL`
    appended (including relationship loads), so soft-deleted rows vanish from
    every list/detail view without editing each query. The sync PULL endpoint
    opts back in with `.execution_options(include_deleted=True)` because it
    must see tombstones to propagate deletions to other devices.
    """
    global _soft_delete_filter_installed
    if _soft_delete_filter_installed:
        return

    from sqlalchemy.orm import with_loader_criteria
    from app.models.account import Account
    from app.models.budget import Budget
    from app.models.contact import Contact
    from app.models.debt import Debt
    from app.models.debt_payment import DebtPayment
    from app.models.finance import Transaction
    from app.models.financial_goal import FinancialGoal
    from app.models.goal import Goal
    from app.models.habit import Habit, HabitCheckin
    from app.models.health_log import HealthLog
    from app.models.investment import Investment
    from app.models.investment_entry import InvestmentEntry
    from app.models.journal import JournalDay, JournalEntry
    from app.models.split import Split
    from app.models.sms_transaction import SmsTransaction
    from app.models.subscription import Subscription

    models = [
        Account, Budget, Contact, Debt, DebtPayment, Transaction,
        FinancialGoal, Goal, Habit, HabitCheckin, HealthLog, Investment,
        InvestmentEntry, JournalDay, JournalEntry, Split, Subscription,
        SmsTransaction,
    ]

    @event.listens_for(SessionLocal, "do_orm_execute")
    def _exclude_soft_deleted(state):  # noqa: ANN001
        if not state.is_select:
            return
        if state.execution_options.get("include_deleted", False):
            return
        for model in models:
            state.statement = state.statement.options(
                with_loader_criteria(
                    model,
                    lambda cls: cls.deleted_at.is_(None),
                    include_aliases=True,
                )
            )

    _soft_delete_filter_installed = True
    log.info("Soft-delete query filter installed for %d synced models", len(models))


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
    from app.models.contact import Contact  # noqa: F401
    from app.models.split import Split  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # Phase 12a — install the global soft-delete read filter once models exist.
    _install_soft_delete_filter()

    # Vector table + seed data.
    from app.services.seed import seed_all  # local import to avoid circulars

    with engine.begin() as conn:
        _ensure_vec_table(conn)
        _dev_migrate_habits(conn)
        _dev_migrate_subscriptions(conn)
        _dev_migrate_accounts(conn)
        _dev_migrate_transactions(conn)
        _dev_migrate_sms_transactions(conn)
        _dev_migrate_users(conn)
        # journal_entries must be rebuilt (dropping its FK to journal_days)
        # BEFORE journal_days is touched. journal_days's old table carries an
        # ON DELETE CASCADE from journal_entries; dropping it while that FK
        # still exists cascades and silently wipes every journal entry.
        _dev_migrate_journal_entries_drop_fk(conn)
        _dev_migrate_journal_days_identity(conn)
        _dev_migrate_analytics_snapshots_identity(conn)

        _tables_needing_user_id = [
            "transactions", "budgets", "habits", "habit_checkins",
            "subscriptions", "goals", "health_logs",
            "notifications", "debts", "debt_payments",
            "investments", "investment_entries", "financial_goals",
            "settings", "sms_transactions", "accounts",
        ]
        for t in _tables_needing_user_id:
            _dev_migrate_add_user_id(conn, t)

        # Phase 12a — sync foundation. Every synced (user-data) table gets a
        # deleted_at tombstone column; the 6 that lack updated_at get one
        # (backfilled to created_at) so last-write-wins has a baseline.
        # NOTE: `settings` is intentionally EXCLUDED — it holds device-local AI
        # provider config that must never sync (see PHASE_12_SPEC.md).
        _synced_tables = [
            "accounts", "budgets", "contacts", "debt_payments", "debts",
            "financial_goals", "goals", "habit_checkins", "habits",
            "health_logs", "investment_entries", "investments",
            "journal_days", "journal_entries", "splits", "subscriptions",
            "transactions", "sms_transactions",
        ]
        _tables_needing_updated_at = [
            "contacts", "debt_payments", "habit_checkins",
            "investment_entries", "splits", "sms_transactions",
        ]
        for t in _tables_needing_updated_at:
            _dev_migrate_add_updated_at(conn, t)
        for t in _synced_tables:
            _dev_migrate_add_deleted_at(conn, t)

        _dev_migrate_health_logs_per_user_unique(conn)
        _dev_migrate_splits_share_count(conn)

    with SessionLocal() as session:
        seed_all(session)
