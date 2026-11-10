import type { Trapdoor } from "@/types";

/** Named for the cases that made them famous. */
export const TRAPDOOR_LABELS: Record<Trapdoor, string> = { jcrew: "J.Crew", chewy: "Chewy", serta: "Serta" };
export const TRAPDOOR_MOVES: Record<Trapdoor, string> = {
  jcrew: "Move valuable assets (often IP) to a subsidiary outside the lenders' collateral",
  chewy: "Release a guarantor by selling a sliver of it so it is no longer wholly owned",
  serta: "Buy back or prime debt from some lenders, but not all, through an open-market or majority-vote exception",
};
