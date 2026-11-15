# Schema migration deadlocked against the running app

- **Date:** 2026-11-14
- **Severity:** Low
- **Detected by:** the migration script's error

## What happened
`scripts/migrate.ts` failed with a Postgres deadlock while adding tables.

## Cause
A dev server was holding locks on the same tables through its own startup schema check, and the two transactions waited on each other.

## Fix
Stopped the dev server and re-ran the migration, which is idempotent (`CREATE ... IF NOT EXISTS`).

## Prevention
- Run migrations with no app connected, or add a retry when Postgres reports a deadlock (40P01).
- Next step: move to numbered, versioned migration files so each change runs exactly once.

## Lessons
Idempotent migrations made the retry safe. Keep them that way.

## Update, 2026-11-15
It happened again with no dev server running, which disproved the first cause. The real one: `getPool()` starts its own schema check when the pool is created, and `migrate()` then ran the same DDL on a second connection at the same moment. The two transactions deadlocked on each other.

Fix: `migrate()` now waits for the pool's own schema check instead of starting a second one, and retries on a deadlock (40P01) with backoff, in case a running app instance is checking the schema at the same time.

Lesson: the first explanation fitted the evidence but was never tested. A cause should be confirmed by reproducing the failure, not just by the fix appearing to work.
