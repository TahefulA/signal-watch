export type * from "./signal";
export type * from "./event";

import type { SignalScore, TickerProfile } from "./signal";
import type { SignalEvent } from "./event";

export interface TickerDataset {
  profile: TickerProfile;
  scores: SignalScore[];
  events: SignalEvent[];
  /** One-line explanation of the latest score. */
  reason: string;
  generated_at: string;
}
