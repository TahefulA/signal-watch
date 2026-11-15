import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { costUsd } from "./llm-pricing";
import { queryRows, tigerEnabled } from "./tiger";

/**
 * Telemetry for every Gemini call: which user action it served, tokens,
 * latency, cost and outcome, one row per attempt in llm_calls. A trace groups
 * the calls of one request, so "cost of one analysis" is a sum over a trace.
 * Logging never fails the call it describes.
 */

interface Trace {
  id: string;
  route: string;
}

const store = new AsyncLocalStorage<Trace>();

/** Wraps a route handler so every model call inside it, streamed work included, carries the route's name and one trace id. */
export function traced<A extends unknown[], R>(route: string, handler: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args: A) => store.run({ id: randomUUID(), route }, () => handler(...args));
}

export interface CallRecord {
  task: string;
  model: string;
  attempt: number;
  /** "ok", an HTTP status such as "429", "timeout", "network" or "parse". */
  outcome: string;
  ms: number;
  inputTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  finishReason?: string | null;
  /** Billed to the visitor's own key, not the site's. */
  ownKey: boolean;
}

export async function recordCall(c: CallRecord): Promise<void> {
  if (!tigerEnabled() || process.env.LLM_TRACE === "off") return;
  const t = store.getStore();
  const input = c.inputTokens ?? 0;
  // Gemini bills thinking tokens as output.
  const output = (c.outputTokens ?? 0) + (c.thinkingTokens ?? 0);
  try {
    await queryRows(
      `INSERT INTO llm_calls (trace_id, route, task, model, attempt, outcome, ms, input_tokens, output_tokens, thinking_tokens, cost_usd, finish_reason, own_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        t?.id ?? null,
        t?.route ?? "script",
        c.task,
        c.model,
        c.attempt,
        c.outcome,
        Math.round(c.ms),
        c.inputTokens ?? null,
        c.outputTokens ?? null,
        c.thinkingTokens ?? null,
        c.outcome === "ok" || c.inputTokens ? costUsd(c.model, input, output) : 0,
        c.finishReason ?? null,
        c.ownKey,
      ],
    );
  } catch (error) {
    console.warn("llm_calls insert failed", error instanceof Error ? error.message : error);
  }
}
