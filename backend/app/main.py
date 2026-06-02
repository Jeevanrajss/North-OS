"""FastAPI entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers import accounts, ai, analytics, app_logs, data, finance, goals, habit, health, health_tracking, journal, settings, subscription, notifications
from app.routers import import_router, sms

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
log = logging.getLogger("north-os")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Booting North OS backend")
    init_db()
    log.info("DB ready")

    # Backfill analytics snapshots on startup (idempotent — upserts existing rows)
    from app.services.analytics_engine import backfill_snapshots
    from app.db import SessionLocal
    with SessionLocal() as _db:
        try:
            backfill_snapshots(_db, days=90)
        except Exception as _e:
            log.warning("Analytics backfill failed on startup (non-fatal): %s", _e)

    from app.scheduler import start_scheduler
    start_scheduler()
    yield
    from app.scheduler import stop_scheduler
    stop_scheduler()
    log.info("Shutting down")


def create_app() -> FastAPI:
    cfg = get_settings()
    app = FastAPI(
        title=cfg.app_name,
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS — local dev allows Vite on 5173. Tighten in prod.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            f"http://{cfg.app_host}:{cfg.app_port}",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(ai.router)
    app.include_router(journal.router)
    app.include_router(habit.router)
    app.include_router(subscription.router)
    app.include_router(finance.router)
    app.include_router(accounts.router)
    app.include_router(settings.router)
    app.include_router(import_router.router)
    app.include_router(sms.router)
    app.include_router(notifications.router)
    app.include_router(analytics.router)
    app.include_router(goals.router)
    app.include_router(health_tracking.router)
    app.include_router(app_logs.router)
    app.include_router(data.router)

    # Version endpoint — used by Electron to check running version
    @app.get("/api/v1/app-version")
    def app_version():
        return {"version": cfg.app_version}

    if cfg.app_env == "production":
        # Packaged app: serve the built React frontend at "/"
        # Mount AFTER all API routers so /api/* routes take precedence
        dist_path = Path(cfg.frontend_dist) if cfg.frontend_dist else None
        if dist_path and dist_path.exists():
            from fastapi.staticfiles import StaticFiles
            app.mount("/", StaticFiles(directory=str(dist_path), html=True), name="static")
            log.info("Serving frontend from %s", dist_path)
        else:
            log.warning("Production mode but FRONTEND_DIST not set or missing: %s", dist_path)
    else:
        # Dev mode: simple root redirect
        @app.get("/")
        def root():
            return {
                "app": cfg.app_name,
                "docs": "/docs",
                "health": "/api/v1/health",
            }

    return app


app = create_app()
