# North OS — Phase 12 Implementation Spec
## Two-Way Sync (Mac home base ⇄ Cloud relay ⇄ Mobile)
**Date:** July 2026 | **Builds on:** Phase 11 (complete)

---

## Goal

Make the Mac the primary "home base" — full local database, local LM Studio AI,
works offline — while keeping it in step with the phone. Concretely:

- Edit something on the phone → it lands in the cloud → it shows up on the Mac
  the next time the Mac app is opened.
- Edit something on the Mac → it syncs up to the cloud → the phone sees it on
  its next refresh.
- The Mac never has to be in "cloud mode." It keeps using its local backend and
  LM Studio; a background sync worker reconciles the local DB with the cloud.

### Why the cloud stays in the loop
The Mac and the phone are different devices on different networks, and the Mac
isn't always awake. They cannot reach each other directly. The cloud (Railway)
is the always-on relay both sides check in with. **Accepted tradeoff:** the
cloud holds a synced mirror of the data. The Mac remains the primary copy.

```
   Mac app  ⇄  Cloud (Railway)  ⇄  Mobile app
 local DB +     sync hub /          reads + writes
 LM Studio      always on           cloud live
      └──────── never talk directly ────────┘
```

---

## Design Principles

1. **Every synced row already has a global UUID `id`.** A row created on the
   phone and one created on the Mac can never collide. This is the foundation
   that makes offline-first sync viable — no server round-trip needed to mint IDs.
2. **Last-write-wins (LWW) by `updated_at`.** This is a single-user,
   multi-device system — *you* are the only editor. True concurrent conflicts
   (same record edited on two devices before either syncs) are rare, and
   "newest edit wins" is the correct, simple resolution. No CRDTs, no vector
   clocks.
3. **Tombstones for deletes.** A hard-deleted row that simply vanishes is
   indistinguishable from "not yet synced" — it would silently reappear on the
   next pull. Every synced table gets a `deleted_at` column; deletes become soft
   deletes that propagate.
4. **The cloud is the merge authority for ordering, not a source of truth.**
   Both sides push and pull; the cloud just stores the latest version of each
   row and serves "everything changed since timestamp T."

---

## Table Coverage

### Synced (user data, has `user_id` + UUID `id`)

| Table | `updated_at` today | Action |
|---|---|---|
| accounts | ✓ | add `deleted_at` |
| budgets | ✓ | add `deleted_at` |
| contacts | ✗ | **add `updated_at`** + `deleted_at` |
| debt_payments | ✗ | **add `updated_at`** + `deleted_at` |
| debts | ✓ | add `deleted_at` |
| financial_goals | ✓ | add `deleted_at` |
| goals | ✓ (+archived_at) | add `deleted_at` |
| habit_checkins | ✗ | **add `updated_at`** + `deleted_at` |
| habits | ✓ (+archived_at) | add `deleted_at` |
| health_logs | ✓ | add `deleted_at` |
| investment_entries | ✗ | **add `updated_at`** + `deleted_at` |
| investments | ✓ | add `deleted_at` |
| journal_days | ✓ | add `deleted_at` |
| journal_entries | ✓ | add `deleted_at` |
| splits | ✗ | **add `updated_at`** + `deleted_at` |
| subscriptions | ✓ (+cancelled_at) | add `deleted_at` |
| transactions | ✓ | add `deleted_at` |
| sms_transactions | ✗ | **add `updated_at`** + `deleted_at` (low priority) |

> Note: `archived_at` / `cancelled_at` are *domain states* (a subscription is
> cancelled, a habit is archived) — they are NOT sync tombstones. `deleted_at`
> is separate and means "this row was removed; propagate the removal."

### NOT synced — and why

| Table | Reason |
|---|---|
| **settings** | **Holds the AI-provider config.** Syncing it would overwrite the Mac's local LM Studio address (`127.0.0.1:1234`) with the cloud's, and vice versa — the exact breakage from the connection-mode confusion. Device-local by design. |
| notifications | Device-local, ephemeral; each device schedules its own (Phase 11a). |
| analytics_snapshots | Derived data — recomputed locally by the analytics engine. |
| embeddings | Vector index — rebuilt locally from source rows. |
| users | Auth/identity — managed by the login flow, not synced as data. |
| finance_categories, mood_codes, tags | Reference/lookup data, no `user_id`. |

---

## Schema Changes (backend, via existing `_dev_migrate_*` pattern in db.py)

For every synced table:
```sql
ALTER TABLE <t> ADD COLUMN deleted_at DATETIME NULL;
-- for the 6 tables missing it:
ALTER TABLE <t> ADD COLUMN updated_at DATETIME NULL;  -- backfill to created_at
```
- `updated_at` must be set on every write (SQLAlchemy `onupdate=func.now()` where
  models allow; the column already behaves this way on the 12 tables that have it).
- Deletes across the app switch from `db.delete(row)` → `row.deleted_at = now()`.
  Read queries add `.filter(Model.deleted_at.is_(None))` so soft-deleted rows stay
  hidden from the UI. This is a broad but mechanical change; each router's list/get
  endpoints get the filter.

---

## Sync Protocol (new endpoints)

Two endpoints on the cloud backend, both scoped to `current_user.id`:

```
GET  /api/v1/sync/pull?since=<iso8601>
     → { server_time, tables: { transactions: [...changed rows...], habits: [...], ... } }
     Returns every row (including tombstoned ones) with updated_at > since,
     across all synced tables, for this user.

POST /api/v1/sync/push
     body: { tables: { transactions: [...rows...], habits: [...], ... } }
     → { server_time, applied, conflicts_resolved }
     Upserts each row: if incoming.updated_at >= existing.updated_at → apply,
     else keep existing (LWW). deleted_at rows tombstone the target.
```

### Client sync cycle (runs on the Mac, and reused by mobile)
```
1. push:  send all local rows with updated_at > last_push_at
2. pull:  fetch all cloud rows with updated_at > last_pull_at
3. merge: for each pulled row, LWW upsert into local DB (respect deleted_at)
4. store: last_push_at = last_pull_at = server_time (use SERVER clock, not device)
```
Push before pull so the server has your latest before you ask for its latest —
minimizes the window where a just-pushed row bounces back.

---

## Where Sync Runs

### Desktop (new — the core of this phase)
- A sync worker in the Electron main process (or a FastAPI background task in the
  bundled local backend) that:
  - Runs once on app open (after the local backend is healthy).
  - Runs on an interval while the app is open (e.g. every 15 min).
  - Requires the user to be signed into their cloud account (reuse the existing
    `CloudConnectionSection` login in Settings — but sign-in no longer *switches*
    the app to cloud mode; it just enables background sync while staying local).
- Desktop Settings gains a "Sync" section: last-synced time + "Sync now" button
  (mirror of the mobile Phase 11c indicator).

### Mobile (extend existing)
- Phase 11c already has `background_sync.dart` + a 24h WorkManager task and a
  last-synced indicator. Extend its callback to run the full push/pull cycle
  above instead of just pulling `/insights/daily`.

### Cloud (Railway)
- Hosts the `/sync/pull` and `/sync/push` endpoints. No scheduled job needed —
  it's passive; clients drive the sync.

---

## Conflict Resolution

- **Same row edited on two devices** → newest `updated_at` wins. The older edit
  is discarded (logged, not surfaced — real conflicts are near-zero for one user).
- **Edited on one device, deleted on another** → whichever has the newer
  timestamp wins. If the delete is newer, the row stays tombstoned; if the edit
  is newer, `deleted_at` is cleared (edit "revives" it). Document this so it's
  not surprising.
- **Clock skew** → always stamp `last_pull_at`/`last_push_at` from the
  `server_time` in the response, never the device clock. The server clock is the
  single reference for "since when."

---

## Edge Cases

1. **First sync / bootstrap.** On the very first sync of an already-populated
   Mac + already-populated cloud (today's state — they've diverged since the
   one-time `migrate_to_cloud.py`), `since` is null → pull *everything*. LWW
   merges the two sides by timestamp. Expect this first run to be the messy one;
   everything after is incremental. A dry-run/preview mode for the first sync is
   worth building.
2. **Large first payload.** Full-table pull could be big. Paginate `/sync/pull`
   by table + cursor if any table exceeds a few thousand rows.
3. **Offline.** If the Mac can't reach the cloud, the sync worker no-ops and
   retries next interval. Local edits keep accumulating with fresh `updated_at`
   and flush on the next successful sync. No queue needed — `updated_at > last_push_at`
   *is* the queue.
4. **Partial push failure.** Push is idempotent (UUID upsert). A failed/retried
   push re-sends the same rows harmlessly.
5. **habit_checkins are effectively immutable** (presence = done). They only ever
   get created or deleted, never edited — so `updated_at = created_at` at insert,
   and `deleted_at` handles un-checking.

---

## Build Order

### Phase 12a — Schema + soft-delete foundation
1. `_dev_migrate_*` additions: `deleted_at` on all synced tables, `updated_at` on
   the 6 missing ones (backfilled to `created_at`).
2. Convert hard deletes → soft deletes across routers; add `deleted_at IS NULL`
   filters to all list/get queries.
3. Verify no existing feature regresses (delete still "disappears" the row in UI).

### Phase 12b — Sync endpoints
4. `GET /sync/pull` + `POST /sync/push` with LWW upsert + tombstone handling.
5. Unit-test the merge logic: newer-wins, delete-vs-edit, first-sync bootstrap.
6. Live two-device simulation against a scratch DB copy.

### Phase 12c — Desktop sync worker
7. Sign-in-for-sync (decouple cloud login from cloud *mode*).
8. Background sync worker (on open + interval) + "Sync now" + last-synced UI.

### Phase 12d — Mobile sync
9. Extend `background_sync.dart` callback to run the full push/pull cycle.
10. Wire the existing last-synced indicator to real sync results.

### Phase 12e — First-sync reconciliation
11. Guided/preview first sync to safely merge the currently-diverged Mac and
    cloud databases without data loss. Back up both DBs before the first real run.

---

## Testing Checklist

### Merge correctness
- [ ] Edit a transaction on device A, sync both → device B shows the edit
- [ ] Edit the *same* transaction on both before syncing → newer timestamp wins
- [ ] Delete a habit on device A → after sync it's gone on device B, stays gone
- [ ] Delete on A + edit on B → newer wins (delete sticks, or edit revives)
- [ ] First sync of two populated, diverged DBs loses nothing (row counts reconcile)

### Isolation / safety
- [ ] `settings` never syncs — Mac keeps LM Studio, cloud keeps its own AI config
- [ ] Soft-deleted rows never appear in any list/detail screen
- [ ] Offline Mac keeps working; edits flush on next successful sync
- [ ] Sync requires cloud sign-in; signed-out Mac works fully local, no sync attempts

### No regressions
- [ ] Local AI (LM Studio) still works on the Mac regardless of sync state
- [ ] Backend boots clean; `flutter analyze` 0 errors; packaged binary passes

---

## Out of Scope (explicitly)

- Real-time / push sync (websockets). This is poll-based; good enough for personal use.
- Multi-user collaboration or sharing. Single user, multiple devices only.
- Field-level merge / CRDTs. Row-level LWW only.
- Syncing derived/reference data (analytics snapshots, embeddings, categories).
- Making the Mac publicly reachable so the phone talks to it directly (rejected:
  fragile + insecure; the cloud relay is the accepted design).
