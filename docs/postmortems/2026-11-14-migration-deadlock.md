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
