import type { ComponentDefinition, ComponentKey } from "@/types";

export const COMPONENTS: ComponentDefinition[] = [
  {
    key: "filing_anomaly",
    label: "Filing anomaly",
    weight: 0.3,
    description: "First-time risk language, new covenant or liquidity language, and tone shifts in 10-K, 10-Q and 8-K filings.",
  },
  {
    key: "insider_activity",
    label: "Insider activity",
    weight: 0.25,
    description: "Clustered open-market sales, large sales by the CEO or CFO, and purchases during drawdowns, from Form 4.",
  },
  {
    key: "sentiment_divergence",
    label: "Sentiment divergence",
    weight: 0.25,
    description: "Management tone in the latest MD&A against the tone of the last 14 days of headlines.",
  },
  {
    key: "market_divergence",
    label: "Market divergence",
    weight: 0.2,
    description: "Weekly return against the sector ETF, and the HYG/LQD ratio as a read on the credit backdrop.",
  },
];

export const COMPONENT_BY_KEY: Record<ComponentKey, ComponentDefinition> = Object.fromEntries(
  COMPONENTS.map((c) => [c.key, c]),
) as Record<ComponentKey, ComponentDefinition>;
