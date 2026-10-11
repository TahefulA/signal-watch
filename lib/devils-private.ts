import type { CaseEvent, CaseTheme, CoverageItem, DevilsAdvocate, Exhibit, Report } from "@/types";
import { THEME_LABELS, generateDevilsAdvocate } from "./devils-advocate";
import { type PatternContext, filingText } from "./devils-advocate-patterns";
import type { Evidence } from "./devils-evidence";
import { type Schema, extractFigures, generateJson } from "./gemini";

/**
 * The Devil's Advocate for a private company: no SEC filings, so the evidence
 * is the documents the user uploads (credit agreement, lender report, offering
 * memorandum). The text checks run on them as they do on filings; checks that
 * need public data are marked not evaluated. Gemini first lists the key figures
 * and dated events in the documents; a row is kept only when its value, or its
 * date as written, is found in the document it names. Nothing is saved.
 */

export interface PrivateDocument {
  name: string;
  text: string;
}

export interface PrivateCaseInput {
  company: string;
  /** "Q2 2026" or "LTM June 2026", as the user describes the period. */
  period: string | null;
  /** The thesis or memo the case argues against. */
  thesis: string;
  documents: PrivateDocument[];
}

export const PRIVATE_LIMITS = { documents: 8, characters: 1_500_000, thesis: 20_000 };

const EXTRACT_THEMES: CaseTheme[] = ["earnings", "liquidity", "debt", "counterparties", "changes", "behavior"];

const EXTRACT_SYSTEM = `You read documents about a private company for a credit analyst. List the figures and dated events that matter for its credit.

figures: 10 to 40 rows. theme is one of earnings, liquidity, debt, counterparties, changes, behavior. measure names the figure (for example "Adjusted EBITDA", "Add-backs to EBITDA", "Revolver availability", "Term loan B outstanding", "Maximum net leverage covenant", "Largest customer share of revenue", "Receivables sold under factoring"). period is the date or period the document gives for it, as written. value is copied EXACTLY as written in the document, with its units. document is the document number, for example 1.
Cover, where the documents state them: revenue, EBITDA and adjusted EBITDA with add-backs, margins, cash, liquidity and availability under facilities, each debt facility's amount, rate and maturity, covenant levels and the actual ratios, guarantees and their conditions, customer and supplier concentration, receivables sold or factored, supplier finance, inventory, capital spending, related-party payments.

events: up to 15 dated events: date_as_written exactly as the document writes it, text describing the event in a few words, document number.

Only what the documents state. Never calculate.`;

const EXTRACT_SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    figures: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          theme: { type: "STRING", enum: EXTRACT_THEMES },
          measure: { type: "STRING" },
          period: { type: "STRING" },
          value: { type: "STRING" },
          document: { type: "NUMBER" },
        },
        required: ["theme", "measure", "period", "value", "document"],
      },
    },
    events: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { date_as_written: { type: "STRING" }, text: { type: "STRING" }, document: { type: "NUMBER" } },
        required: ["date_as_written", "text", "document"],
      },
    },
  },
  required: ["figures", "events"],
};

const squash = (t: string) => t.replace(/\s+/g, " ").toLowerCase();

/** A value is found when every figure in it is in the document, or, with no figures, when its words are. */
function found(value: string, doc: string, docFigures: Set<string>): boolean {
  const figures = extractFigures(value);
  if (figures.length) return figures.every((f) => docFigures.has(f));
  return value.trim().length > 0 && squash(doc).includes(squash(value));
}

function isoOf(written: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(written)) return written;
  const t = Date.parse(written);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

const EXCERPT_BUDGET = 90_000;

async function extractEvidence(input: PrivateCaseInput, today: string) {
  const total = input.documents.reduce((n, d) => n + d.text.length, 0) || 1;
  const prompt = input.documents
    .map((d, i) => `Document ${i + 1}, ${d.name}:\n${d.text.slice(0, Math.max(4_000, Math.floor((EXCERPT_BUDGET * d.text.length) / total)))}`)
    .join("\n\n");
  const figuresOf = input.documents.map((d) => new Set(extractFigures(d.text)));
  let raw: unknown = null;
  try {
    raw = await generateJson(EXTRACT_SYSTEM, prompt, EXTRACT_SCHEMA, { thinking: "low", timeoutMs: 90_000 });
  } catch (error) {
    console.warn("Private figure extraction failed", error);
  }
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as { figures?: unknown; events?: unknown };
  const docAt = (n: unknown) => (typeof n === "number" && n >= 1 && n <= input.documents.length ? Math.floor(n) - 1 : -1);

  const rows: { theme: CaseTheme; row: string[] }[] = [];
  let dropped = 0;
  for (const f of Array.isArray(r.figures) ? r.figures : []) {
    if (typeof f !== "object" || f === null) continue;
    const x = f as Record<string, unknown>;
    const i = docAt(x.document);
    const theme = EXTRACT_THEMES.find((t) => t === x.theme);
    const value = typeof x.value === "string" ? x.value.trim() : "";
    if (i < 0 || !theme || !value || !found(value, input.documents[i].text, figuresOf[i])) {
      dropped++;
      continue;
    }
    rows.push({ theme, row: [String(x.measure ?? ""), String(x.period ?? ""), value, input.documents[i].name] });
  }

  const events: CaseEvent[] = [];
  for (const e of Array.isArray(r.events) ? r.events : []) {
    if (typeof e !== "object" || e === null) continue;
    const x = e as Record<string, unknown>;
    const i = docAt(x.document);
    const written = typeof x.date_as_written === "string" ? x.date_as_written.trim() : "";
    const date = isoOf(written);
    if (i < 0 || !date || !squash(input.documents[i].text).includes(squash(written))) continue;
    events.push({ date, kind: date > today ? "maturity" : "filing", text: `${String(x.text ?? "")} (${input.documents[i].name})` });
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  return { rows, dropped, events };
}

export async function generatePrivateCase(input: PrivateCaseInput, today: string): Promise<DevilsAdvocate> {
  const { rows, dropped, events } = await extractEvidence(input, today);

  const exhibits = Object.fromEntries(
    (["earnings", "liquidity", "debt", "counterparties", "changes", "behavior", "peers", "market"] as CaseTheme[]).map((theme) => {
      const mine = rows.filter((x) => x.theme === theme).map((x) => x.row);
      const exhibit: Exhibit = {
        title: `Figures from the documents: ${THEME_LABELS[theme].toLowerCase()}`,
        columns: ["Measure", "Period", "Value as written", "Document"],
        rows: mine,
        note: "Each value was found, as written, in the document named.",
      };
      return [theme, mine.length ? [exhibit] : []];
    }),
  ) as Record<CaseTheme, Exhibit[]>;

  const coverage: CoverageItem[] = [
    ...input.documents.map((d) => ({
      label: d.name,
      detail: `${d.text.split(/\s+/).filter(Boolean).length.toLocaleString("en-US")} words read`,
      read: true,
    })),
    {
      label: "Figures from the documents",
      detail: `${rows.length} kept${dropped ? `, ${dropped} dropped because the value was not found in the document named` : ""}`,
      read: rows.length > 0,
    },
    { label: "SEC filings, XBRL figures, Form 4s and 8-Ks", detail: "A private company publishes none of these", read: false },
    { label: "Stock market data", detail: "No listed shares", read: false },
    { label: "Entity map and capital structure tabs", detail: "Not built in private mode; the case reads the documents directly", read: false },
  ];

  const sources: Evidence["sources"] = Object.fromEntries(
    input.documents.map((d, i) => [`doc${i + 1}`, { label: d.name, url: null }]),
  );
  sources.filing = { label: input.documents[0]?.name ?? "Documents", url: null };

  const evidence: Evidence = {
    period: {
      quarter: input.period,
      periodEnd: null,
      form: `${input.documents.length} uploaded document${input.documents.length === 1 ? "" : "s"}`,
      filed: null,
      url: null,
      daysSinceFiling: null,
      writtenOn: today,
      historySpan: null,
    },
    exhibits,
    events,
    coverage,
    sources,
    facts: [
      `Reporting period, as the user describes it: ${input.period ?? "not stated"}. Today is ${today}.`,
      ...Object.entries(exhibits).flatMap(([theme, list]) =>
        list.map((x) => `Exhibit (${theme}) ${x.title}:\n${x.columns.join(" | ")}\n${x.rows.map((row) => row.join(" | ")).join("\n")}`),
      ),
      `Dated events:\n${events.map((e) => `- ${e.date}: ${e.text}`).join("\n") || "- none"}`,
    ].join("\n\n"),
  };

  const report: Report = {
    id: `private-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    graph: { company: { ticker: "PRIVATE", name: input.company, cik: "" }, nodes: [], edges: [] },
    memo: { sections: [{ key: "thesis", title: "Thesis", spans: [{ text: input.thesis }] }] },
    market: null,
    sources: [],
    filingsAnalyzed: input.documents.length,
    newsAnalyzed: 0,
    notes: [],
  };
  const ctx: PatternContext = {
    report,
    book: null,
    filings: input.documents.map((d) => filingText("Document", today, d.name, "", d.text)),
    prior: null,
    eightKs: [],
    insiders: null,
    today,
    privateMode: true,
  };
  const devil = await generateDevilsAdvocate(report, ctx, [], { evidence, privateMode: true });
  const patterns = devil.patterns.length;
  const fired = devil.patterns.filter((p) => p.status === "fired").length;
  const clear = devil.patterns.filter((p) => p.status === "clear").length;
  return {
    ...devil,
    coverage: [
      ...coverage,
      { label: "Contradiction patterns", detail: `${patterns} checked: ${fired} fired, ${clear} clear, ${patterns - fired - clear} not evaluated`, read: true },
    ],
  };
}
