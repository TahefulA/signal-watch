import type { ComponentKey, SignalEvent, SignalScore } from "@/types";
import { COMPONENTS } from "./components";
import { filingComponent } from "./signals/filing";
import { insiderComponent } from "./signals/insider";
import { type MarketInputs, marketComponent } from "./signals/market";
import { type SentimentInputs, sentimentComponent } from "./signals/sentiment";
import { round1 } from "./signals/shared";

export interface ScoringInputs {
  ticker: string;
  filingEvents: SignalEvent[];
  insiderEvents: SignalEvent[];
  sentiment: SentimentInputs;
  market: MarketInputs;
  marketEvents: SignalEvent[];
}

/**
 * Composite risk score for one date, using only information public on that date.
 * Higher means more concern.
 */
export function computeSignalScore(date: string, inputs: ScoringInputs): SignalScore {
  const visible = (events: SignalEvent[]) => events.filter((e) => e.date <= date);
  const parts: Record<ComponentKey, ReturnType<typeof filingComponent>> = {
    filing_anomaly: filingComponent(date, visible(inputs.filingEvents)),
    insider_activity: insiderComponent(date, visible(inputs.insiderEvents)),
    sentiment_divergence: sentimentComponent(date, inputs.sentiment),
    market_divergence: marketComponent(date, inputs.market, visible(inputs.marketEvents)),
  };
  const total = COMPONENTS.reduce((sum, c) => sum + parts[c.key].value * c.weight, 0);
  return {
    ticker: inputs.ticker,
    date,
    total_score: round1(total),
    filing_anomaly: parts.filing_anomaly.value,
    insider_activity: parts.insider_activity.value,
    sentiment_divergence: parts.sentiment_divergence.value,
    market_divergence: parts.market_divergence.value,
    drivers: {
      filing_anomaly: parts.filing_anomaly.drivers,
      insider_activity: parts.insider_activity.drivers,
      sentiment_divergence: parts.sentiment_divergence.drivers,
      market_divergence: parts.market_divergence.drivers,
    },
    notes: {
      filing_anomaly: parts.filing_anomaly.note,
      insider_activity: parts.insider_activity.note,
      sentiment_divergence: parts.sentiment_divergence.note,
      market_divergence: parts.market_divergence.note,
    },
  };
}
