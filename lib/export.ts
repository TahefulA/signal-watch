import type { Report } from "@/types";

/** RFC 4180 quoting: wrap every field, double the quotes inside. */
const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/**
 * The report's numbers as one CSV an analyst can paste into a model: the
 * forecast, every capital-structure metric, each debt instrument and the
 * maturity schedule, each with the filing it came from.
 */
export function reportCsv(report: Report): string {
  const rows: unknown[][] = [["section", "item", "value", "detail", "source"]];
  const d = report.distress;
  if (d) {
    rows.push(["forecast", "12-month bankruptcy probability", d.probability, d.band, `model ${d.modelVersion}, balance sheet ${d.periodEnd}`]);
    if (d.zScore !== null) rows.push(["forecast", "Altman Z''", d.zScore, d.zZone ?? "", ""]);
    for (const r of d.reasons) rows.push(["forecast", `raises risk: ${r.label}`, r.value ?? "", r.display, ""]);
    for (const r of d.offsets) rows.push(["forecast", `lowers risk: ${r.label}`, r.value ?? "", r.display, ""]);
  }
  const c = report.capital;
  if (c) {
    const src = `${c.sourceType} filed ${c.sourceDate} ${c.sourceUrl}`;
    for (const m of c.metrics) rows.push(["metric", m.label, m.display, m.note, src]);
    for (const i of c.instruments) {
      rows.push(["debt", i.name, i.outstanding ?? i.outstandingText ?? "", [i.kind, i.seniority, i.coupon, i.maturity ? `matures ${i.maturity}` : null].filter(Boolean).join("; "), i.citations[0]?.sourceUrl ?? src]);
    }
    for (const r of c.maturitySchedule?.rows ?? []) rows.push(["maturities", r.period, r.amount, "", src]);
  }
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
