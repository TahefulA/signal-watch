import { type Schema, generateJson } from "../gemini";
import { type AlertRule, type Clause, METRICS, type Test, validate } from "./predicate";
import { ALERT_COMPILE_SYSTEM as SYSTEM } from "../prompts/alert-compile";

/**
 * Compiles a live question into an AlertRule. The model fills a flat schema
 * (Gemini's structured output has no tagged unions), code turns it into the
 * rule type, and validate() decides whether it may run. A rule that fails is
 * sent back once with the validator's own error messages; a second failure
 * is reported, never patched by guesswork. A question the language cannot
 * express (news, a different market, a price on another venue) is refused
 * with the model's reason rather than approximated.
 */

/** Every field is required: Gemini tends to leave optional numbers out, so 0 stands for "does not apply to this test". */
const FLAT_CLAUSE: Schema = {
  type: "OBJECT",
  properties: {
    metric: { type: "STRING", enum: METRICS },
    test: { type: "STRING", enum: ["level", "change", "drift", "outlier"] },
    op: { type: "STRING", enum: ["above", "below", "none"] },
    direction: { type: "STRING", enum: ["up", "down", "either", "none"] },
    value: { type: "NUMBER" },
    amount: { type: "NUMBER" },
    seconds: { type: "NUMBER" },
    h: { type: "NUMBER" },
    z: { type: "NUMBER" },
    window: { type: "NUMBER" },
  },
  required: ["metric", "test", "op", "direction", "value", "amount", "seconds", "h", "z", "window"],
};

const SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    supported: { type: "BOOLEAN" },
    reason: { type: "STRING", nullable: true },
    name: { type: "STRING", nullable: true },
    clauses: { type: "ARRAY", items: FLAT_CLAUSE },
    persistence: { type: "NUMBER" },
    cooldown_sec: { type: "NUMBER" },
  },
  required: ["supported", "clauses", "persistence", "cooldown_sec"],
};

type Flat = { metric?: string; test?: string; op?: string | null; direction?: string | null; value?: number | null; amount?: number | null; seconds?: number | null; h?: number | null; z?: number | null; window?: number | null };
type Raw = { supported?: boolean; reason?: string | null; name?: string | null; clauses?: Flat[]; persistence?: number | null; cooldown_sec?: number | null };

/** Turns the model's flat clause into the rule type; fields that do not apply to the test are dropped, missing ones are left for validate() to report. */
function toClause(f: Flat): Clause {
  const n = (x: number | null | undefined) => (typeof x === "number" ? x : (undefined as unknown as number));
  let test: Test;
  switch (f.test) {
    case "level":
      test = { kind: "level", op: f.op as "above" | "below", value: n(f.value) };
      break;
    case "change":
      test = { kind: "change", direction: f.direction as "up" | "down", amount: n(f.amount), seconds: n(f.seconds) };
      break;
    case "drift":
      test = { kind: "drift", direction: f.direction as "up" | "down", h: n(f.h), window: n(f.window) };
      break;
    default:
      test = { kind: "outlier", direction: (f.direction ?? "either") as "up" | "down" | "either", z: n(f.z), window: n(f.window) };
  }
  return { metric: f.metric as Clause["metric"], test };
}

function toRule(raw: Raw): AlertRule {
  return {
    name: (raw.name ?? "").trim().slice(0, 80) || "Live question",
    clauses: (raw.clauses ?? []).map(toClause),
    persistence: typeof raw.persistence === "number" ? Math.round(raw.persistence) : 1,
    cooldownSec: typeof raw.cooldown_sec === "number" ? raw.cooldown_sec : 120,
  };
}

export type CompileResult =
  | { ok: true; rule: AlertRule; attempts: number; ms: number }
  | { ok: false; unsupported: boolean; reason: string; errors: string[]; attempts: number; ms: number };

export async function compileQuestion(question: string): Promise<CompileResult> {
  const started = Date.now();
  let prompt = `Question: "${question.slice(0, 400)}"`;
  let errors: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = (await generateJson(SYSTEM, prompt, SCHEMA, { task: "alert-compile", fast: true, thinking: "low", timeoutMs: 30_000 })) as Raw;
    if (raw.supported === false) return { ok: false, unsupported: true, reason: raw.reason?.trim() || "The alert language cannot express this question.", errors: [], attempts: attempt, ms: Date.now() - started };
    const rule = toRule(raw);
    errors = validate(rule);
    if (!errors.length) return { ok: true, rule, attempts: attempt, ms: Date.now() - started };
    prompt = `Question: "${question.slice(0, 400)}"\n\nYour previous rule was rejected by the validator:\n- ${errors.join("\n- ")}\nReturn a corrected rule.`;
  }
  return { ok: false, unsupported: false, reason: "The compiled rule failed validation twice.", errors, attempts: 2, ms: Date.now() - started };
}
