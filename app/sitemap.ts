import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/email";
import { queryRows, tigerEnabled } from "@/lib/tiger";

export const revalidate = 86400;

/** The main pages, and one share page per company with a saved report. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const pages = ["", "/proof", "/about", "/contagion", "/privacy", "/terms", "/changelog"].map((p) => ({ url: `${base}${p}` }));
  if (!tigerEnabled()) return pages;
  const rows = await queryRows<{ ticker: string; last: string }>(
    "SELECT ticker, MAX(generated_at)::text AS last FROM reports WHERE as_of IS NULL GROUP BY ticker ORDER BY ticker",
  ).catch(() => []);
  return [...pages, ...rows.map((r) => ({ url: `${base}/c/${encodeURIComponent(r.ticker)}`, lastModified: new Date(r.last) }))];
}
