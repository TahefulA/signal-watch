/**
 * Debt facts from a filing's inline XBRL: the tags the company attaches to
 * numbers in its own document, grouped by the debt instrument they describe.
 * Used to fill coupons, face amounts and maturities that the footnote text
 * extraction missed, and as the instrument list when the text gives too little.
 */

export interface XbrlInstrument {
  /** QName of the DebtInstrumentAxis (or debt type) member, e.g. "wulf:A7.750SeniorSecuredNotesDue2030Member". */
  member: string;
  /** "7.750 Senior Secured Notes Due 2030". */
  name: string;
  /** Stated interest rate in percent, e.g. 7.75. */
  couponPercent: number | null;
  /** Face (principal) amount in dollars, only when the filing tags one value; several values usually mean add-on tranches. */
  faceAmount: number | null;
  /** Carrying amount in dollars at the balance sheet date, when tagged. */
  carrying: number | null;
  /** YYYY-MM-DD. */
  maturity: string | null;
  /** The balance sheet or event date of the amount used. */
  asOf: string | null;
}

const AXES = ["us-gaap:DebtInstrumentAxis", "us-gaap:LongtermDebtTypeAxis", "us-gaap:ShorttermDebtTypeAxis", "us-gaap:LineOfCreditFacilityAxis"];

/** Generic type members that do not identify one instrument. */
const GENERIC = /^us-gaap:(SeniorNotes|ConvertibleDebt|ConvertibleNotesPayable|LineOfCredit|RevolvingCreditFacility|SecuredDebt|UnsecuredDebt|LoansPayable|NotesPayable|SubordinatedDebt|MediumTermNotes|CommercialPaper|LongTermDebt)Member$/;

interface Context {
  member: string | null;
  date: string | null;
}

function humanize(member: string): string {
  return member
    .replace(/^[a-z-]+:/, "")
    .replace(/Member$/, "")
    .replace(/^A(?=\d)/, "")
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .trim();
}

function contexts(html: string): Map<string, Context> {
  const out = new Map<string, Context>();
  for (const m of html.matchAll(/<xbrli:context id="([^"]+)">([\s\S]*?)<\/xbrli:context>/g)) {
    const body = m[2];
    const members = Array.from(body.matchAll(/dimension="([^"]+)">\s*([^<\s]+)\s*</g)).map((x) => ({ axis: x[1], member: x[2] }));
    // Prefer the specific instrument axis; a context with other dimensions (e.g. fair value level) is skipped.
    if (members.some((x) => !AXES.includes(x.axis))) continue;
    const specific = members.find((x) => x.axis === "us-gaap:DebtInstrumentAxis" && !GENERIC.test(x.member)) ?? members.find((x) => !GENERIC.test(x.member));
    const date = body.match(/<xbrli:(?:instant|endDate)>([^<]+)</)?.[1] ?? null;
    out.set(m[1], { member: specific?.member ?? null, date });
  }
  return out;
}

function numeric(tag: string, inner: string): number | null {
  const text = inner.replace(/<[^>]+>/g, "").trim();
  if (/fixed-zero/.test(tag) || text === "—" || text === "-") return 0;
  const n = Number(text.replace(/[,\s$]/g, ""));
  if (!Number.isFinite(n)) return null;
  const scale = Number(tag.match(/scale="(-?\d+)"/)?.[1] ?? 0);
  const sign = /sign="-"/.test(tag) ? -1 : 1;
  return sign * n * 10 ** scale;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function isoDate(text: string): string | null {
  const t = text.replace(/<[^>]+>/g, "").trim().toLowerCase();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return t;
  const m = t.match(/([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  const month = m ? MONTHS.indexOf(m[1]) : -1;
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

/** Debt instruments tagged in the document, one per instrument member. */
export function debtFromInlineXbrl(html: string): XbrlInstrument[] {
  const ctx = contexts(html);
  const byMember = new Map<string, XbrlInstrument>();
  const faces = new Map<string, Set<number>>();
  const get = (member: string) => {
    let i = byMember.get(member);
    if (!i) {
      i = { member, name: humanize(member), couponPercent: null, faceAmount: null, carrying: null, maturity: null, asOf: null };
      byMember.set(member, i);
    }
    return i;
  };
  for (const m of html.matchAll(/<ix:(nonFraction|nonNumeric)([^>]*)>([\s\S]*?)<\/ix:\1>/g)) {
    const tag = m[2];
    const name = tag.match(/name="([^"]+)"/)?.[1];
    const c = ctx.get(tag.match(/contextRef="([^"]+)"/)?.[1] ?? "");
    if (!name || !c?.member) continue;
    const later = (date: string | null, current: string | null) => !current || (date !== null && date > current);
    if (name === "us-gaap:DebtInstrumentInterestRateStatedPercentage") {
      const v = numeric(tag, m[3]);
      if (v !== null && v > 0 && v < 0.5) get(c.member).couponPercent = Math.round(v * 1e6) / 1e4;
    } else if (name === "us-gaap:DebtInstrumentFaceAmount") {
      const v = numeric(tag, m[3]);
      const i = get(c.member);
      if (v !== null && v > 0) faces.set(c.member, (faces.get(c.member) ?? new Set()).add(v));
      if (v !== null && v > 0 && later(c.date, i.asOf)) {
        i.faceAmount = v;
        i.asOf = c.date;
      }
    } else if (/^us-gaap:(LongTermDebt|DebtInstrumentCarryingAmount|ConvertibleDebt|LongTermDebtNoncurrent)$/.test(name)) {
      const v = numeric(tag, m[3]);
      if (v !== null && v > 0) get(c.member).carrying = v;
    } else if (name === "us-gaap:DebtInstrumentMaturityDate") {
      const d = isoDate(m[3]);
      if (d) get(c.member).maturity = d;
    }
  }
  for (const [member, values] of faces) if (values.size > 1) get(member).faceAmount = null;
  return Array.from(byMember.values()).filter((i) => i.couponPercent !== null || i.faceAmount !== null || i.maturity !== null);
}
