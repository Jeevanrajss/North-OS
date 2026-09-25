"""FastAPI entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jose import JWTError, jwt

from app.config import get_settings
from app.db import SessionLocal, init_db
from app.routers import accounts, ai, analytics, app_logs, auth, data, debt, finance, finance_advisor, financial_goals, goals, habit, health, health_tracking, investments, journal, settings, subscription, notifications
from app.routers import import_router, sms, contacts, splits, insights, pairing
from app.services import pairing as pairing_service
from app.services.auth_service import JWT_ALGORITHM, JWT_SECRET

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
log = logging.getLogger("north-os")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Booting North OS backend")
    init_db()
    if get_settings().app_env in ("dev", "desktop"):
        # Create the single local owner up front so the UI's burst of parallel
        # first requests can't race to insert it.
        from app.services.auth_service import _get_or_create_local_user
        with SessionLocal() as _db:
            _get_or_create_local_user(_db)
    log.info("DB ready")

    # Backfill analytics snapshots on startup (idempotent — upserts existing rows).
    # Runs once per active user — a snapshot is now scoped to (user_id, date),
    # so a single anonymous backfill would only ever populate the local account.
    from app.services.analytics_engine import backfill_snapshots
    from app.models.user import User
    with SessionLocal() as _db:
        try:
            users = _db.query(User).filter(User.is_active == True).all()
            for _user in users:
                backfill_snapshots(_db, days=90, user_id=_user.id)
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
        redirect_slashes=False,
    )

    # Desktop backend reachable from a paired phone (Tailscale/LAN): anything
    # not from this Mac must carry a current device token. Loopback requests
    # (Electron UI, Vite proxy) keep the no-login local-owner behaviour.
    _remote_open = {"/api/v1/ping", "/api/v1/pair/claim", "/api/v1/auth/refresh"}

    @app.middleware("http")
    async def guard_remote(request: Request, call_next):
        if (
            get_settings().app_env in ("dev", "desktop")
            and pairing_service.is_remote(request.client.host if request.client else None)
            and request.url.path.startswith("/api/")
            and request.url.path not in _remote_open
            and request.method != "OPTIONS"  # CORS preflight carries no data or credentials
        ):
            auth_header = request.headers.get("authorization", "")
            allowed = False
            if auth_header.lower().startswith("bearer "):
                try:
                    payload = jwt.decode(auth_header[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
                    if payload.get("type") == "access" and "pv" in payload:
                        with SessionLocal() as db:
                            allowed = pairing_service.token_is_current(db, payload)
                except JWTError:
                    allowed = False
            if not allowed:
                return JSONResponse({"detail": "Pair this device with the Mac first."}, status_code=401)
        return await call_next(request)

    # Added after the guard so CORS is the outer layer and even the guard's
    # 401s carry CORS headers. Auth is via Bearer tokens, not cookies.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(pairing.router)
    app.include_router(auth.router)
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
    app.include_router(debt.router)
    app.include_router(investments.router)
    app.include_router(financial_goals.router)
    app.include_router(finance_advisor.router)
    app.include_router(data.router)
    app.include_router(contacts.router)
    app.include_router(splits.router)
    app.include_router(insights.router)

    # Version endpoint — used by Electron to check running version
    @app.get("/api/v1/app-version")
    def app_version():
        return {"version": cfg.app_version, "channel": cfg.app_channel}

    if cfg.app_env in ("production", "desktop"):
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
