# Any visitor could edit the shared watchlist

- **Date:** 2026-11-14
- **Severity:** High
- **Detected by:** me, reviewing the app before sharing it publicly

## What users saw
Nothing yet. Before public launch there was one global watchlist: any visitor could add or remove companies for everyone.

## Cause
The watchlist was built for a single user. The API routes had no notion of who was calling.

## Fix
Commit `4715245`:
- Each visitor gets an anonymous HttpOnly cookie (`sw_vid`).
- Watchlists are stored per visitor in `visitor_watchlist`.
- A new visitor's list is seeded from the shared defaults.

Verified on production: one visitor's remove did not affect another's list.

## Prevention
Every route that changes data takes the visitor from the cookie, never from the request body.

## Lessons
Before anything goes public, list every write path and ask whose data it touches.
