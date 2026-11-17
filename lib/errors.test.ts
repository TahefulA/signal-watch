import assert from "node:assert/strict";
import { test } from "node:test";
import { fingerprint, isControlFlow } from "./errors";

test("Next.js control-flow throws are not errors", () => {
  const dynamic = Object.assign(new Error("Dynamic server usage: Route /api/timeline couldn't be rendered statically"), { digest: "DYNAMIC_SERVER_USAGE" });
  assert.equal(isControlFlow(dynamic), true);
  assert.equal(isControlFlow(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/;307;" })), true);
  assert.equal(isControlFlow(new TypeError("Cannot read properties of undefined")), false);
  assert.equal(isControlFlow(null), false);
});

test("the same failure on different tickers and ids is one group", () => {
  const a = fingerprint("server", "analyze", "Save failed for CIFR at 12:01, id 3c50a0df-69c0-4fac-87b6-c09de4b8255f");
  const b = fingerprint("server", "analyze", "Save failed for WULF at 09:44, id 11111111-1111-4111-8111-111111111111");
  assert.equal(a, b);
  assert.notEqual(a, fingerprint("server", "watchlist", "Save failed for CIFR at 12:01"));
});
