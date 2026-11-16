import { ImageResponse } from "next/og";
import { bandOf, displayName, oneIn } from "@/lib/summary-words";
import { findLatestReport, tigerEnabled } from "@/lib/tiger";

export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = "Signal Watch bankruptcy risk";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/** The link preview for a share page: company, risk band and the odds, in the site's colours. */
export default async function Image({ params }: { params: { ticker: string } }) {
  const ticker = decodeURIComponent(params.ticker).toUpperCase();
  const report = TICKER.test(ticker) && tigerEnabled() ? await findLatestReport(ticker).catch(() => null) : null;
  const d = report?.distress;
  const band = d ? bandOf(d.band) : null;
  const name = report ? displayName(report.graph.company.name) : ticker;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#09090b", color: "#fafafa", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, color: "#a1a1aa" }}>
          <div style={{ width: 14, height: 14, background: "#dc2626", borderRadius: 3 }} />
          Signal Watch
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 34, color: "#a1a1aa" }}>{`${ticker} · 12-month bankruptcy risk`}</div>
          <div style={{ fontSize: name.length > 28 ? 60 : 76, fontWeight: 700, marginTop: 12, lineHeight: 1.05 }}>{name}</div>
          {band && d ? (
            <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 36 }}>
              <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: "#fafafa", background: band.color, padding: "10px 26px", borderRadius: 6 }}>{`${band.label} risk`}</div>
              <div style={{ fontSize: 38, color: "#e4e4e7" }}>{`About ${oneIn(d.probability)} chance`}</div>
            </div>
          ) : (
            <div style={{ fontSize: 40, marginTop: 36, color: "#e4e4e7" }}>Check it free from its SEC filings</div>
          )}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#71717a" }}>
          {report ? `From SEC filings, checked ${report.generatedAt.slice(0, 10)}. Not investment advice.` : "Not investment advice."}
        </div>
      </div>
    ),
    size,
  );
}
