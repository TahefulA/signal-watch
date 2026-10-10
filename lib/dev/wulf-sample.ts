/**
 * Development sample for building the map before live extraction is wired.
 * Quotes are verbatim from TeraWulf's 10-K (filed 2026-02-27) and 10-Q (filed 2026-08-05).
 * Removed once /api/analyze returns live reports.
 */
import type { Entity, EntityEdge, EntityGraph } from "@/types";

const Q = "https://www.sec.gov/Archives/edgar/data/1083301/000108330126000166/wulf-20260630.htm";
const K = "https://www.sec.gov/Archives/edgar/data/1083301/000108330126000031/wulf-20251231.htm";

type Seed = Omit<Entity, "id" | "sourceUrl" | "sourceDate" | "sourceLabel"> & { doc: "Q" | "K" };

const SEEDS: Seed[] = [
  { name: "Fluidstack", type: "company", relationship: "HPC tenant", severity: "high", sourceType: "10-Q", doc: "Q",
    sourceQuote: "As of June 30, 2026, all of the Core42 HPC Leases have commenced and one of the Fluidstack HPC Leases has partially commenced and the remaining Fluidstack HPC Leases are expected to commence in the second half of 2026 as well as in early 2027." },
  { name: "Google backstop", type: "financial", relationship: "Credit enhancement", severity: "high", sourceType: "10-K", doc: "K",
    sourceQuote: "The Abernathy HPC Campus reflects the extension of the Company’s relationship with Fluidstack, also supported by credit enhancement from Google, to an additional site in Texas." },
  { name: "2030 Senior Secured Notes", type: "financial", relationship: "Secured debt", severity: "high", sourceType: "10-K", doc: "K",
    sourceQuote: "Google entered into this pledge agreement with the Company and Wilmington Trust, National Association, as collateral agent, in connection with the Company’s $ 3200.0 million 2030 Senior Secured Notes financing in October 2025 (see Note 10)." },
  { name: "Core42", type: "company", relationship: "HPC tenant", severity: "medium", sourceType: "10-K", doc: "K",
    sourceQuote: "In December 2024, La Lupa entered into long-term data center lease agreements with Core42 (the “Core42 Leases”), pursuant to which we committed to deliver 60 MW of critical IT load." },
  { name: "Lake Mariner Data Campus", type: "neutral", relationship: "Flagship campus", severity: "medium", sourceType: "10-K", doc: "K",
    sourceQuote: "The Lake Mariner Data Campus is TeraWulf’s flagship HPC campus and a core component of the Company’s contracted HPC platform." },
  { name: "NYISO approvals", type: "regulatory", relationship: "Gates expansion", severity: "medium", sourceType: "10-Q", doc: "Q",
    sourceQuote: "The campus is undergoing phased expansion to support additional HPC contracted deployments with gross capacity of approximately 500 MW in the near term, and with potential expansion to approximately 750 MW, subject to additional approvals from the NYISO." },
  { name: "Abernathy JV sale", type: "financial", relationship: "Asset sale", severity: "medium", sourceType: "10-Q", doc: "Q",
    sourceQuote: "In July 2026, the Company entered into a definitive agreement to sell its entire 50.1 % equity interest in the Abernathy Joint Venture to the Fluidstack Member and certain other purchasers (see Note 11)." },
  { name: "Bitcoin mining revenue", type: "risk", relationship: "Revenue mix", severity: "medium", sourceType: "10-K", doc: "K",
    sourceQuote: "While the Company currently derives the majority of its revenue from bitcoin mining, HPC hosting is now the Company’s primary growth driver and operating focus." },
  { name: "Competition for power sites", type: "risk", relationship: "Competes for", severity: "medium", sourceType: "10-K", doc: "K",
    sourceQuote: "Competition is primarily centered on securing and developing high-power sites, accessing reliable and cost-competitive electricity, and attracting capital to build and operate facilities capable of supporting high-density compute." },
  { name: "Hawesville, Kentucky site", type: "neutral", relationship: "Development site", severity: "low", sourceType: "10-Q", doc: "Q",
    sourceQuote: "On February 2, 2026, the Company entered into an Agreement of Purchase and Sale for a former industrial site in Hawesville, Kentucky ( “Justified Data Campus” or “Hawesville”)." },
  { name: "Trade barriers", type: "macro", relationship: "Impacted by", severity: "low", sourceType: "10-K", doc: "K",
    sourceQuote: "• Enhanced tariff, import/export restrictions, or other trade barriers may have an adverse impact on global economic conditions." },
  { name: "Power supply mix", type: "macro", relationship: "Energy dependency", severity: "low", sourceType: "10-K", doc: "K",
    sourceQuote: "These facilities are designed to operate with a range of long-duration power resources, including grid-supplied electricity and, where appropriate, on-site generation." },
];

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const central: Entity = {
  id: "wulf",
  name: "TeraWulf Inc.",
  type: "company",
  relationship: "WULF",
  severity: "none",
  sourceType: "10-Q",
  sourceDate: "2026-08-05",
  sourceQuote: "The Company has undergone a deliberate strategic transition toward HPC leasing as its primary growth driver and operating focus.",
  sourceUrl: Q,
  sourceLabel: "Item 2. Management’s Discussion and Analysis",
  isCentral: true,
};

const nodes: Entity[] = [
  central,
  ...SEEDS.map(({ doc, ...seed }) => ({
    ...seed,
    id: slug(seed.name),
    sourceUrl: doc === "Q" ? Q : K,
    sourceDate: doc === "Q" ? "2026-08-05" : "2026-02-27",
    sourceLabel: doc === "Q" ? "10-Q for the quarter ended June 30, 2026" : "10-K for the year ended December 31, 2025",
  })),
];

const edges: EntityEdge[] = [
  ...nodes
    .filter((n) => !n.isCentral && n.id !== "google-backstop")
    .map((n) => ({ id: `wulf-${n.id}`, source: "wulf", target: n.id, relationship: n.relationship })),
  { id: "fluidstack-google", source: "fluidstack", target: "google-backstop", relationship: "Backstopped by" },
];

export const WULF_SAMPLE: EntityGraph = {
  company: { ticker: "WULF", name: "TeraWulf Inc.", cik: "1083301" },
  nodes,
  edges,
};
