import type { MarketReaction } from "@/types";
import { MAD_TO_SIGMA, calculateMAD } from "../stream/robust";

/**
 * Did the market react? A headline's date says when it was published, not
 * whether it was before or after the close, so the first two sessions on or
 * after it are both checked and the larger move is kept. Each daily return is
 * standardised by the robust spread of the 60 daily returns before the news:
 *
 *   z = r / (1.4826 × MAD(r₋₆₀ … r₋₁))
 *
 * Daily returns have fat tails, so the MAD keeps one earlier crash from
 * hiding the next. |z| ≥ 3 is a jump. Taking the larger of two sessions makes
 * a jump somewhat easier to reach by chance than one pre-chosen session would.
 */

export const JUMP_Z = 3;
const LOOKBACK = 60;

export interface Bar {
  date: string;
  close: number;
}

export function marketReaction(bars: Bar[], newsDate: string, today: string): MarketReaction | null {
  const first = bars.findIndex((b) => b.date >= newsDate);
  if (first < LOOKBACK + 1) return null;
  const returns = (i: number) => bars[i].close / bars[i - 1].close - 1;
  const history: number[] = [];
  for (let i = first - LOOKBACK; i < first; i++) history.push(returns(i));
  const sigma = calculateMAD(history) * MAD_TO_SIGMA;
  if (!(sigma > 0)) return null;
  let best: MarketReaction | null = null;
  for (const i of [first, first + 1]) {
    if (i >= bars.length) break;
    const ret = returns(i);
    const z = ret / sigma;
    if (!best || Math.abs(z) > Math.abs(best.z)) best = { session: bars[i].date, ret, z, jump: Math.abs(z) >= JUMP_Z, partial: bars[i].date >= today };
  }
  return best;
}
