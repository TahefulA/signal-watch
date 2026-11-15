# Gemini output truncated on large filings

- **Date:** 2026-10-10
- **Severity:** Medium
- **Detected by:** me, testing companies with long debt footnotes

## What users saw
Some companies produced a near-empty credit map: a handful of entities, missing debt instruments, no error.

## Cause
The extraction call's output token limit was lower than the JSON a large filing needs. Gemini stopped mid-object (`finishReason: MAX_TOKENS`); the partial result was treated as a success.

## Fix
Raised the output limit, logged model, finish reason, length and time for every call, and treated an extraction with fewer than four entities as failed instead of rendering it (commit `30a65b7`).

## Prevention
- The finish reason is logged on every call, so truncation shows in the logs.
- A minimum-size check rejects implausibly small extractions.

## Lessons
A model response that parses is not a correct response. Check the finish reason and sanity-check the size.
