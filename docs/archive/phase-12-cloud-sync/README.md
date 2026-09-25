# Phase 12 cloud sync (retired 2026-09-24)

Two-way Mac ⇄ Railway ⇄ phone sync, never shipped. Replaced by direct phone ↔ Mac
access over Tailscale (see `backend/app/services/pairing.py` and the mobile outbox in
`mobile/lib/core/offline/`): the Mac is the only database, so there is nothing to merge.

Kept for reference only — these files are not imported anywhere. Known issues when it
was retired: natural-key collisions (journal_days, habit_checkins) broke pushes, and
second-precision `updated_at` could drop rows at the pull cursor.

The soft-delete (`deleted_at`) columns and global query filter it introduced are still
in use.
