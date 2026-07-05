"""One-off cleanup: archive duplicate habits on the cloud backend.

Likely cause: migrate_to_cloud.py was run more than once before it had
idempotency checks, so each habit name was created twice.

This keeps the OLDEST habit per name (lowest created_at), merges any
check-ins recorded against the duplicates onto the kept habit (so no streak
data is lost even if check-ins were split across both), then archives the
duplicates via the existing soft-delete endpoint (DELETE /habits/{id}) —
nothing is permanently deleted, and any of them can be restored via
POST /habits/{id}/restore if this picks the wrong one to keep.

Usage:
  python dedupe_cloud_habits.py \
    --server https://north-mobile-production.up.railway.app \
    --email jeevanraj2705@gmail.com \
    --password YOUR_PASSWORD \
    --dry-run   # preview only, no changes made
"""
import argparse
import sys
from collections import defaultdict

import requests


def login(server: str, email: str, password: str) -> str:
    r = requests.post(f"{server}/api/v1/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        print(f"Login failed: {r.status_code} {r.text}")
        sys.exit(1)
    return r.json()["access_token"]


def main():
    parser = argparse.ArgumentParser(description="Archive duplicate habits on the cloud account")
    parser.add_argument("--server", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--dry-run", action="store_true", help="Preview only, don't archive anything")
    args = parser.parse_args()

    server = args.server.rstrip("/")
    token = login(server, args.email, args.password)
    h = {"Authorization": f"Bearer {token}"}

    habits = requests.get(f"{server}/api/v1/habits", headers=h).json()
    print(f"Found {len(habits)} active habits\n")

    by_name = defaultdict(list)
    for habit in habits:
        by_name[habit["name"]].append(habit)

    duplicate_groups = {name: group for name, group in by_name.items() if len(group) > 1}
    for name, group in duplicate_groups.items():
        group.sort(key=lambda x: x["created_at"])
        keep, dupes = group[0], group[1:]
        print(f"'{name}': keeping {keep['id']} (created {keep['created_at']}), "
              f"archiving {len(dupes)} duplicate(s)")

    if not duplicate_groups:
        print("No duplicates found.")
        return

    total_dupes = sum(len(g) - 1 for g in duplicate_groups.values())
    print(f"\n{total_dupes} habit(s) to archive.")
    if args.dry_run:
        print("Dry run — nothing changed. Re-run without --dry-run to apply.")
        return

    for name, group in duplicate_groups.items():
        keep, dupes = group[0], group[1:]  # already sorted above

        kept_days = {
            c["day_date"]
            for c in requests.get(f"{server}/api/v1/habits/{keep['id']}/checkins", headers=h).json()
        }
        for dupe in dupes:
            dupe_checkins = requests.get(f"{server}/api/v1/habits/{dupe['id']}/checkins", headers=h).json()
            merged = 0
            for c in dupe_checkins:
                if c["day_date"] in kept_days:
                    continue
                r = requests.put(
                    f"{server}/api/v1/habits/{keep['id']}/checkins/{c['day_date']}",
                    json={"value": c["value"], "note": c["note"]} if c["note"] else {"value": c["value"]},
                    headers=h,
                )
                if r.status_code in (200, 201):
                    kept_days.add(c["day_date"])
                    merged += 1
            if merged:
                print(f"    merged {merged} check-in(s) from duplicate {dupe['id']} onto {keep['id']}")

            r = requests.delete(f"{server}/api/v1/habits/{dupe['id']}", headers=h)
            status = "archived" if r.status_code == 200 else f"FAILED ({r.status_code})"
            print(f"  {dupe['name']} ({dupe['id']}): {status}")

    print("\nDone.")


if __name__ == "__main__":
    main()
