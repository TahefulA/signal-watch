import type { ClauseStatus, CreditDocument, LmeScan, Trapdoor, TrapdoorClause, TrapdoorRisk, TrapdoorVerdict } from "@/types";
import { fullTextSearch, hitUrl, htmlToText, secFetch, type SearchHit } from "./edgar";
import { generateJson, type Schema } from "./gemini";
import { TRAPDOOR_LABELS, TRAPDOOR_MOVES } from "./lme-labels";
import { locateQuote } from "./quotes";

/**
 * The liability-management scanner. Code finds the borrower's indentures and
 * credit agreements on EDGAR and cuts out the clauses that matter; Gemini
 * reads those clauses for the three known trapdoors and their blockers; code
 * keeps a clause only if its quote is found in the document, and decides the
 * risk from the clauses that survive.
 */

export { TRAPDOOR_LABELS, TRAPDOOR_MOVES };

const LOOKBACK_YEARS = 6;
const MAX_CANDIDATES = 40;
const MAX_DOCUMENTS = 2;
/** Base agreements run to hundreds of thousands of characters; supplements and joinders are short. */
const MIN_CHARS = 120_000;
const WINDOW_BEFORE = 300;
const WINDOW_AFTER = 1_100;
const WINDOWS_PER_TOPIC = 12;
/** Per trapdoor: each is read in its own call. */
const EXCERPT_BUDGET = 30_000;

const KIND = /\b(INDENTURE|CREDIT AGREEMENT|LOAN AGREEMENT|LOAN AND SECURITY AGREEMENT|CREDIT AND GUARANTY AGREEMENT)\b/i;
const NOT_BASE = /(\bFORM OF\b|\bSUPPLEMENTAL INDENTURE|INTERCREDITOR|RESTRUCTURING SUPPORT|AMENDMENT NO\.|JOINDER|PURCHASE AGREEMENT\b(?! AND))/i;

/** What each trapdoor's clauses say, so code can cut them out before any model reads them. */
const TOPICS: Record<Trapdoor, RegExp> = {
  jcrew: /Joint Venture|Unrestricted Subsidiar|Material Intellectual Property|Intellectual Property|Investments? in (?:any )?(?:Non-Guarantor|Unrestricted|Restricted)|Permitted Investment|designat\w+ .{0,40}Unrestricted/gi,
  chewy: /cease[sd]? to be a (?:Wholly[- ]Owned )?(?:Restricted )?Subsidiar|(?:be|been|is|are) (?:automatically )?released|release of (?:any |such |a )?(?:Subsidiary )?Guarant|no longer (?:a )?(?:Wholly[- ]Owned )?Subsidiar/gi,
  serta: /open market purchase|pro rata shar|ratabl|directly and adversely affected|each (?:Lender|Holder) (?:directly )?affected|subordinat\w+ (?:the |any )?(?:Liens?|Obligations|payment)|Dutch auction|non-pro rata|66 ?(?:2\/3|⅔)%|two-thirds in|release (?:of )?(?:all or substantially all|any) of the Collateral|Required Lenders/gi,
};

interface Excerpt {
  id: string;
  doc: number;
  start: number;
  end: number;
  section: string | null;
}

/** The nearest section heading before a position: "Section 2.14 Purchase and Cancellation". */
function sectionAt(text: string, at: number): string | null {
  const head = text.slice(Math.max(0, at - 60_000), at);
  const matches = Array.from(head.matchAll(/(?:^|\n|\s)(?:Section|SECTION)\s+(\d{1,2}\.\d{1,2}[a-z]?)\.?\s+(?!Section\b|SECTION\b)([A-Z][^.;:“"]{2,70}?)\./g));
  const last = matches[matches.length - 1];
  return last ? `Section ${last[1]} ${last[2].replace(/\s+/g, " ").trim()}` : null;
}

function titleOf(text: string, hit: SearchHit): string {
  const head = text.slice(0, 2_500).replace(/\s+/g, " ");
  const kind = head.match(KIND)?.[1] ?? hit.description ?? hit.fileType;
  // An indenture is named by its notes: "6.75% Senior Spectrum Secured Exchange Notes due 2030".
  const notes = head.match(/\d{1,2}(?:\.\d+)?% [A-Za-z ]{3,60}?(?:NOTES|DEBENTURES)(?: DUE \d{4})?/i)?.[0];
  const cap = (t: string) => t.toLowerCase().replace(/(^|\s)([a-z])/g, (_, sp: string, c: string) => sp + c.toUpperCase()).replace(/\bDue\b/, "due");
  const title = notes ? `${cap(notes)}: ${kind.toLowerCase()}` : cap(kind);
  return title.length > 110 ? `${title.slice(0, 107)}...` : title;
}

/** The borrower's most recent base indentures and credit agreements, by full-text search of its exhibits. */
export async function findCreditDocuments(cik: string, today: string): Promise<{ doc: CreditDocument; text: string }[]> {
  const from = `${Number(today.slice(0, 4)) - LOOKBACK_YEARS}${today.slice(4)}`;
  const hits = new Map<string, SearchHit>();
  for (const q of ['"indenture"', '"credit agreement"', '"loan agreement"']) {
    const found = await fullTextSearch(cik, q, from, today).catch(() => [] as SearchHit[]);
    for (const h of found) if (/^EX-(4|10)/.test(h.fileType)) hits.set(h.id, h);
  }
  const candidates = Array.from(hits.values())
    .sort((a, b) => b.filed.localeCompare(a.filed))
    .slice(0, MAX_CANDIDATES);
  const out: { doc: CreditDocument; text: string }[] = [];
  const titles = new Set<string>();
  for (const hit of candidates) {
    if (out.length >= MAX_DOCUMENTS) break;
    const url = hitUrl(cik, hit);
    const text = await secFetch(url)
      .then(htmlToText)
      .catch(() => "");
    const head = text.slice(0, 1_500);
    if (text.length < MIN_CHARS || !KIND.test(head) || NOT_BASE.test(head.slice(0, 600))) continue;
    const title = titleOf(text, hit);
    // A company often files the same form of indenture for several series: read one.
    const key = title.replace(/[\d.%]+/g, "").toLowerCase();
    if (titles.has(key)) continue;
    titles.add(key);
    out.push({ doc: { title, form: hit.form, exhibit: hit.fileType, filed: hit.filed, url, chars: text.length }, text });
  }
  return out;
}

/** Cuts out the passages around each trapdoor's terms, merged and capped, each labelled with its section. */
function excerpts(texts: string[], re: RegExp, prefix: string): Excerpt[] {
  const spans: { doc: number; start: number; end: number }[] = [];
  texts.forEach((text, doc) => {
    {
      const hits = Array.from(text.matchAll(re)).map((m) => m.index ?? 0);
      // Spread the windows across the document rather than taking the first few.
      const step = Math.max(1, Math.ceil(hits.length / WINDOWS_PER_TOPIC));
      for (let i = 0; i < hits.length; i += step) spans.push({ doc, start: Math.max(0, hits[i] - WINDOW_BEFORE), end: Math.min(text.length, hits[i] + WINDOW_AFTER) });
    }
  });
  spans.sort((a, b) => a.doc - b.doc || a.start - b.start);
  const merged: typeof spans = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && last.doc === s.doc && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  const out: Excerpt[] = [];
  let budget = EXCERPT_BUDGET;
  // Interleave documents so the second one is read even when the first is long.
  const byDoc = texts.map((_, d) => merged.filter((m) => m.doc === d));
  for (let i = 0; budget > 0 && byDoc.some((list) => i < list.length); i++) {
    for (const list of byDoc) {
      const s = list[i];
      if (!s || budget <= 0) continue;
      budget -= s.end - s.start;
      out.push({ id: `${prefix}${out.length + 1}`, ...s, section: sectionAt(texts[s.doc], s.start) });
    }
  }
  return out;
}

const DEFINITIONS: Record<Trapdoor, string> = {
  jcrew: `J.Crew: the document lets the borrower move valuable assets, often intellectual property, out of the lenders' collateral, for example through investments in or designation of unrestricted or non-guarantor subsidiaries, or a release of collateral when assets go to an affiliate, joint venture or unrestricted entity. A blocker forbids transferring material intellectual property or other key assets to unrestricted subsidiaries or affiliates, or caps such investments tightly.`,
  chewy: `Chewy: a subsidiary guarantor is released from its guarantee automatically when it ceases to be wholly owned, so selling a small stake releases it. A blocker releases a guarantor only when it ceases to be a subsidiary at all, or bars releases in transactions with affiliates or without a bona fide business purpose. A clause that only says what else is released once a guarantee is released is neither.`,
  serta: `Serta: some creditors can be put ahead of others without every affected creditor agreeing. In a loan: an "open market purchase" or similar exception to pro rata sharing lets the borrower buy back loans from chosen lenders, or Required Lenders may amend pro rata sharing or the payment waterfall. In a loan or an indenture: less than all affected holders (for example a majority or 66 2/3%) may release all or substantially all of the collateral or guarantees, or subordinate the liens or payment. A blocker requires each affected lender's or holder's consent for those changes, or limits buybacks to offers made pro rata to all. A plain right to repurchase notes in the open market or by tender, found in almost every indenture, is not a Serta door on its own: do not report it.`,
};

const system = (t: Trapdoor) => `You read excerpts of a borrower's indentures and credit agreements for one known liability-management trapdoor, and the blockers that close it.

${DEFINITIONS[t]}

Rules:
- Report only clauses that are in the excerpts and match the definition above. If none do, return an empty list.
- door_open means the clause lets the borrower make the move. blocker means the clause stops or narrows it. If a clause does neither, leave it out.
- The quote is copied character for character from one excerpt, at most 60 words. Never paraphrase or stitch excerpts together.
- "why" says in at most 35 plain words what the clause lets the borrower do, or stops it doing. No advice, no ratings.
- At most two clauses per status.`;

const SCHEMA: Schema = {
  type: "OBJECT",
  properties: {
    clauses: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          status: { type: "STRING", enum: ["door_open", "blocker"] },
          excerpt: { type: "STRING", description: "The excerpt id, e.g. E3." },
          quote: { type: "STRING" },
          why: { type: "STRING" },
        },
        required: ["status", "excerpt", "quote", "why"],
      },
    },
  },
  required: ["clauses"],
};

interface RawClause {
  trapdoor: Trapdoor;
  status: ClauseStatus;
  excerpt: string;
  quote: string;
  why: string;
}

/**
 * A vote below unanimity that can release the collateral or subordinate the
 * debt is an open door however the model read it: the holdouts can be primed.
 * Returns the reason when the rule applies.
 */
export function voteRule(trapdoor: Trapdoor, quote: string): string | null {
  if (trapdoor !== "serta") return null;
  const vote = quote.match(/(?:at least|not less than|more than)\s+(\d{2}(?:\s?2\/3|\.\d+)?)\s?%/i) ?? quote.match(/\b(majority|two-thirds)\b/i);
  if (!vote || !/release|subordinat/i.test(quote)) return null;
  const share = /^\d/.test(vote[1]) ? `${vote[1].replace(/\s/g, " ")}%` : `a ${vote[1].toLowerCase()}`;
  return `Holders of ${share}, not every holder, can approve releasing or subordinating the collateral, so a group that size can act without the rest. Read by code from the vote threshold.`;
}

/** A found clause must use the trapdoor's own terms; the model sometimes files a clause under the wrong one. */
const ON_TOPIC: Record<Trapdoor, (q: string) => boolean> = {
  jcrew: (q) => /Unrestricted|Intellectual Property|Joint Venture|Affiliate|Investment|Non-Guarantor|designat/i.test(q),
  chewy: (q) => /Guarant/i.test(q) && /Wholly|cease|no longer|Subsidiar/i.test(q),
  serta: (q) => /open market|pro rata|ratabl|subordinat|release|consent|Required Lenders|each (?:Lender|Holder)/i.test(q),
};

/** The same clause in two indentures of one family is one finding: kept once, with the other documents listed. */
function merge(clauses: TrapdoorClause[]): TrapdoorClause[] {
  const out: TrapdoorClause[] = [];
  for (const c of clauses) {
    const twin = c.verified ? out.find((o) => o.verified && o.trapdoor === c.trapdoor && o.status === c.status && o.section === c.section && o.section !== null) : undefined;
    if (!twin) out.push(c);
    else if (twin.documentUrl !== c.documentUrl && !twin.alsoIn?.includes(c.documentUrl)) twin.alsoIn = [...(twin.alsoIn ?? []), c.documentUrl];
  }
  return out;
}

/** Decided by code from the clauses whose quotes were found. */
export function verdicts(clauses: TrapdoorClause[]): TrapdoorVerdict[] {
  return (Object.keys(TRAPDOOR_LABELS) as Trapdoor[]).map((t) => {
    const ok = clauses.filter((c) => c.trapdoor === t && c.verified);
    const open = ok.filter((c) => c.status === "door_open").length;
    const blocks = ok.filter((c) => c.status === "blocker").length;
    const risk: TrapdoorRisk = open && !blocks ? "high" : open ? "medium" : blocks ? "low" : "not_found";
    const basis =
      risk === "high"
        ? `${open} verified clause${open === 1 ? "" : "s"} leave${open === 1 ? "s" : ""} the door open; no blocker found.`
        : risk === "medium"
          ? `${open} verified clause${open === 1 ? " opens" : "s open"} the door and ${blocks} limit${blocks === 1 ? "s" : ""} it.`
          : risk === "low"
            ? `${blocks} verified blocker${blocks === 1 ? "" : "s"}; no clause found that opens the door.`
            : "Not addressed in the passages read.";
    return { trapdoor: t, risk, basis };
  });
}

/** Reads the borrower's credit documents for J.Crew, Chewy and Serta trapdoors. Null when none are on EDGAR. */
export async function scanCreditDocuments(cik: string, today: string, trace: (text: string) => void = () => undefined): Promise<LmeScan | null> {
  trace("Searching EDGAR for indentures and credit agreements");
  const found = await findCreditDocuments(cik, today);
  if (!found.length) return null;
  const texts = found.map((f) => f.text);
  const trapdoors = Object.keys(TOPICS) as Trapdoor[];
  const parts = trapdoors.flatMap((t) => excerpts(texts, TOPICS[t], `${t[0].toUpperCase()}`).map((p) => ({ ...p, trapdoor: t })));
  trace(`Reading ${parts.length} passages from ${found.length} document${found.length === 1 ? "" : "s"}`);
  const read = await Promise.all(
    trapdoors.map(async (t) => {
      const mine = parts.filter((p) => p.trapdoor === t);
      if (!mine.length) return [] as RawClause[];
      const prompt = mine
        .map((p) => `[${p.id}] ${found[p.doc].doc.title}${p.section ? `, ${p.section}` : ""}\n${texts[p.doc].slice(p.start, p.end).replace(/\s+/g, " ")}`)
        .join("\n\n");
      const out = (await generateJson(system(t), prompt, SCHEMA, { timeoutMs: 90_000 })) as { clauses?: Omit<RawClause, "trapdoor">[] };
      return (out.clauses ?? []).map((c) => ({ ...c, trapdoor: t }));
    }),
  );
  const raw = { clauses: read.flat() };

  trace("Checking every quote against the documents");
  const byId = new Map(parts.map((p) => [p.id, p]));
  const clauses: TrapdoorClause[] = (raw.clauses ?? []).map((c) => {
    const part = byId.get(c.excerpt.trim()) ?? null;
    // Search the cited document first, then the others: the model sometimes cites the wrong excerpt.
    const order = part ? [part.doc, ...texts.map((_, i) => i).filter((i) => i !== part.doc)] : texts.map((_, i) => i);
    for (const d of order) {
      const at = locateQuote(c.quote, texts[d]);
      if (!at) continue;
      const quote = texts[d].slice(at.start, at.end).replace(/\s+/g, " ").trim();
      const override = voteRule(c.trapdoor, quote);
      return {
        trapdoor: c.trapdoor,
        status: override ? "door_open" : c.status,
        quote,
        claimed: c.quote,
        section: sectionAt(texts[d], at.start),
        why: override ?? c.why,
        documentUrl: found[d].doc.url,
        verified: true,
      };
    }
    return { trapdoor: c.trapdoor, status: c.status, quote: null, claimed: c.quote, section: part?.section ?? null, why: c.why, documentUrl: part ? found[part.doc].doc.url : found[0].doc.url, verified: false };
  });

  const kept = merge(clauses.filter((c) => !c.verified || ON_TOPIC[c.trapdoor](c.quote ?? "")));
  return {
    documents: found.map((f) => f.doc),
    clauses: kept,
    verdicts: verdicts(kept),
    struck: kept.filter((c) => !c.verified).length,
    offTopic: clauses.filter((c) => c.verified && !ON_TOPIC[c.trapdoor](c.quote ?? "")).length,
    scannedAt: new Date().toISOString(),
    note: null,
  };
}
