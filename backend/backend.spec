# PyInstaller spec — Personal OS backend
# Build with:  pyinstaller backend.spec
# Output:      dist/personal-os-backend/   (the whole folder is what Electron ships)

import sys
import os
from pathlib import Path
import sqlite_vec

# ── Paths ─────────────────────────────────────────────────────────────────────
SPEC_DIR      = Path(SPECPATH)                        # backend/
PROJECT_ROOT  = SPEC_DIR.parent                        # personal-os/
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"    # React build output

# sqlite_vec native extension(s)
VEC_PKG_DIR = Path(sqlite_vec.__file__).parent
vec_binaries = []
for ext in ("*.dylib", "*.so", "*.dll", "*.pyd"):
    for f in VEC_PKG_DIR.glob(ext):
        vec_binaries.append((str(f), "sqlite_vec"))

# ── Analysis ──────────────────────────────────────────────────────────────────
a = Analysis(
    [str(SPEC_DIR / "run.py")],
    pathex=[str(SPEC_DIR)],
    binaries=vec_binaries,
    datas=[
        # Bundle the React build so the backend can serve it
        (str(FRONTEND_DIST), "frontend_dist"),
        # Include the app package (templates, etc. if any)
        (str(SPEC_DIR / "app"), "app"),
    ],
    hiddenimports=[
        # Uvicorn internals (not always auto-detected)
        "uvicorn",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        # FastAPI / Starlette — include all middleware + internals
        "fastapi",
        "fastapi.middleware",
        "fastapi.middleware.cors",
        "fastapi.middleware.trustedhost",
        "fastapi.staticfiles",
        "fastapi.responses",
        "fastapi.routing",
        "starlette",
        "starlette.middleware",
        "starlette.middleware.cors",
        "starlette.middleware.base",
        "starlette.staticfiles",
        "starlette.routing",
        "starlette.responses",
        "starlette.requests",
        "starlette.background",
        "starlette.concurrency",
        "starlette.exceptions",
        "starlette.types",
        "starlette.datastructures",
        "aiofiles",
        "aiofiles.os",
        "aiofiles.threadpool",
        "anyio",
        "anyio._backends._asyncio",
        "anyio.abc",
        "sniffio",
        "h11",
        "h11._connection",
        "h11._events",
        # SQLAlchemy dialects
        "sqlalchemy.dialects.sqlite",
        # App routers (dynamic imports may not be detected)
        "app.routers.health",
        "app.routers.ai",
        "app.routers.journal",
        "app.routers.habit",
        "app.routers.subscription",
        "app.routers.finance",
        "app.routers.accounts",
        "app.routers.settings",
        "app.routers.import_router",
        "app.routers.sms",
        "app.routers.notifications",
        # App services
        "app.services.notification_service",
        "app.services.llm_client",
        "app.services.csv_parser",
        "app.services.sms_parser",
        "app.services.seed",
        "app.services.report_generator",
        "app.services.habit_insights",
        "app.services.transaction_categorizer",
        # App models
        "app.models.account",
        "app.models.budget",
        "app.models.finance",
        "app.models.finance_category",
        "app.models.habit",
        "app.models.journal",
        "app.models.notification",
        "app.models.setting",
        "app.models.subscription",
        "app.models.sms_transaction",
        "app.models.user",
        # Pydantic
        "pydantic",
        "pydantic_settings",
        # APScheduler
        "apscheduler",
        "apscheduler.schedulers.background",
        "apscheduler.triggers.cron",
        # Other deps
        "httpx",
        "pandas",
        "fpdf",
        "sqlite_vec",
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="personal-os-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,   # Keep console visible for debugging; set False for release
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="personal-os-backend",
)
