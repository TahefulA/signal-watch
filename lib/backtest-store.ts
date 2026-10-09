import type { BacktestReport } from "./backtest";
import report from "@/data/backtest.json";

function isReport(value: unknown): value is BacktestReport {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.thresholds) && typeof v.generated_at === "string";
}

export function getBacktest(): BacktestReport | null {
  return isReport(report) ? report : null;
}
