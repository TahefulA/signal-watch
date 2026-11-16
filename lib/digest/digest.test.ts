import assert from "node:assert/strict";
import { test } from "node:test";
import { type Change, compose } from "./digest";

const change = (ticker: string, userId: string | null, lines: string[]): Change => ({
  sub: { token: `tok-${ticker}`, email: "a@example.com", ticker, user_id: userId, last_prob: 0.01, last_event: "2026-11-01", created_at: "2026-11-01" },
  name: `${ticker} Inc.`,
  lines,
  prob: 0.02,
  newest: "2026-11-15",
});

test("one change reads as one company, with its own stop link", () => {
  const { subject, text } = compose([change("CIFR", null, ["12-month bankruptcy odds: 2.0%, up from 1.0%."])], "https://x.test");
  assert.equal(subject, "Signal Watch: CIFR odds moved");
  assert.match(text, /Open it: https:\/\/x\.test\/c\/CIFR/);
  assert.match(text, /Stop emails about CIFR: https:\/\/x\.test\/api\/alerts\/unsubscribe\?token=tok-CIFR/);
  assert.match(text, /Not investment advice\.$/);
});

test("several changes go in one email; watchlist ones share one stop link", () => {
  const { subject, text } = compose(
    [change("CIFR", "u1", ["- Filed an 8-K (2026-11-15)"]), change("WULF", "u1", ["- New debt (2026-11-14)"]), change("AAPL", null, ["- Auditor change (2026-11-13)"])],
    "https://x.test",
  );
  assert.equal(subject, "Signal Watch: 3 companies you watch changed (CIFR, WULF, AAPL)");
  assert.equal(text.match(/Stop watchlist emails/g)?.length, 1);
  assert.match(text, /Stop emails about AAPL/);
  assert.doesNotMatch(text, /Stop emails about CIFR/);
});

test("a filing-only change says so in the subject", () => {
  assert.equal(compose([change("F", null, ["- Filed an 8-K (2026-11-15)"])], "https://x.test").subject, "Signal Watch: F filed something new");
});
