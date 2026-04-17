"""One-shot backup. Copies the encrypted DB to data/backups/YYYY-MM-DD-HHMM.db.

Usage: python scripts/backup.py
Hook into cron/launchd/Task Scheduler for daily auto-backup.
"""
from __future__ import annotations

import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "personal-os.db"
DST_DIR = ROOT / "data" / "backups"


def main() -> int:
    if not SRC.exists():
        print(f"[backup] source not found: {SRC}")
        return 1
    DST_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d-%H%M")
    dst = DST_DIR / f"{stamp}.db"
    shutil.copy2(SRC, dst)
    print(f"[backup] wrote {dst} ({dst.stat().st_size / 1024:.1f} KiB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
