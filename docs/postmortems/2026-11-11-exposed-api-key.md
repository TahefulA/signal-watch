# Gemini API key exposed outside the repo

- **Date:** 2026-11-11
- **Severity:** High
- **Detected by:** me

## What happened
A Gemini API key was shared in plain text outside the codebase. It was never committed: a full-history `gitleaks` scan (106 commits, 2026-11-14) found no secrets.

## Risk
Anyone holding the key could run up usage on the project's Google account.

## Fix
- [ ] Revoke the key in Google AI Studio, create a new one, and update it in Vercel's environment variables and `.env.local`.
- Keys live only in environment variables; `.env*` is git-ignored.

## Prevention
- `gitleaks` runs on every commit (`.githooks/pre-commit`) and on every PR in CI.
- A custom rule covers Google's newer `AQ.` key format, which the default rules miss.
- [ ] Set a budget alert and a spend cap on the Google Cloud project.

## Lessons
A secret pasted anywhere (chat, a screenshot, an issue) counts as leaked: rotate it first, investigate second.
