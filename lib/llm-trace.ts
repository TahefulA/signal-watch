import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { describe, recordError } from "./errors";
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
  /** Set once an error is recorded, so a 500 that follows is not counted twice. */
  errored?: boolean;
}

const store = new AsyncLocalStorage<Trace>();

/**
 * Inside a traced route, console.error also lands in app_errors with the
 * route and trace id: every route already logs its failures that way, so this
 * catches them without touching each one. Installed once per instance.
 */
function captureConsoleErrors(): void {
  const g = globalThis as { __swErrorCapture?: boolean };
  if (g.__swErrorCapture) return;
  g.__swErrorCapture = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    const t = store.getStore();
    if (!t) return;
    t.errored = true;
    const { message, stack } = describe(args);
    void recordError({ source: "server", where: t.route, message, stack, traceId: t.id });
  };
}

/** Wraps a route handler so every model call inside it, streamed work included, carries the route's name and one trace id. Thrown errors and 5xx answers are recorded. */
export function traced<A extends unknown[], R>(route: string, handler: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  captureConsoleErrors();
  return (...args: A) => {
    const trace: Trace = { id: randomUUID(), route };
    return store.run(trace, async () => {
      try {
        const result = await handler(...args);
        if (result instanceof Response && result.status >= 500 && !trace.errored) {
          void recordError({ source: "server", where: route, message: `HTTP ${result.status}`, traceId: trace.id, status: result.status });
        }
        return result;
      } catch (error) {
        const { message, stack } = describe([error]);
        await recordError({ source: "server", where: route, message: `Unhandled: ${message}`, stack, traceId: trace.id, status: 500 });
        throw error;
      }
    });
  };
}

/** The current trace's id, for logs that want to point at it. */
export function currentTraceId(): string | null {
  return store.getStore()?.id ?? null;
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
  /** First 12 hex of the system prompt's SHA-256. */
  promptHash?: string;
}

export async function recordCall(c: CallRecord): Promise<void> {
  if (!tigerEnabled() || process.env.LLM_TRACE === "off") return;
  const t = store.getStore();
  const input = c.inputTokens ?? 0;
  // Gemini bills thinking tokens as output.
  const output = (c.outputTokens ?? 0) + (c.thinkingTokens ?? 0);
  try {
    await queryRows(
      `INSERT INTO llm_calls (trace_id, route, task, model, attempt, outcome, ms, input_tokens, output_tokens, thinking_tokens, cost_usd, finish_reason, own_key, prompt_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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
        c.promptHash ?? null,
      ],
    );
  } catch (error) {
    console.warn("llm_calls insert failed", error instanceof Error ? error.message : error);
  }
}
