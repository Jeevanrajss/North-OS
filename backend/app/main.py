"""FastAPI entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers import ai, habit, health, journal, subscription

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
log = logging.getLogger("personal-os")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Booting Personal OS backend")
    init_db()
    log.info("DB ready")
    yield
    log.info("Shutting down")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS — local dev allows Vite on 5173. Tighten in prod.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            f"http://{settings.app_host}:{settings.app_port}",
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

    @app.get("/")
    def root():
        return {
            "app": settings.app_name,
            "docs": "/docs",
            "health": "/api/v1/health",
        }

    return app


app = create_app()
