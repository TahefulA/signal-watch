import type { DistressBand, DistressReason, DistressScore } from "@/types";
import { FEATURE_LABELS, type FeatureName, type FeatureRow, buildFeatures } from "./features";
import { noLeak } from "./pit";
import type { FactBook } from "./xbrl";
import modelFile from "../model/distress.json";

/**
 * The twelve-month bankruptcy probability. The trees come from model/train.py
 * (gradient boosting, fitted offline on EDGAR filings and Item 1.03 8-Ks);
 * this file walks them: each tree sends the company left or right at each
 * split until a leaf, the leaf values add up to a raw score, and the raw
 * score is mapped to a probability by the calibration curve fitted on
 * earlier years. Each split's change in value is credited to the feature it
 * split on (Saabas attribution), so the reasons add up to the score itself.
 */

interface Tree {
  value: number[];
  feature: number[];
  threshold: number[];
  missingLeft: boolean[];
  left: number[];
  right: number[];
  leaf: boolean[];
}

interface ModelFile {
  version: string;
  trainedThrough: string;
  features: FeatureName[];
  baseline: number;
  trees: Tree[];
  calibration: { x: number[]; y: number[] };
  baseRate: number;
  bands: { elevated: number; high: number; severe: number };
  alertThreshold: number;
}

/** Bundled with the app (a static import), so a serverless deploy carries it without file tracing. */
export function loadModel(): ModelFile | null {
  const m = modelFile as unknown as ModelFile;
  return Array.isArray(m.trees) && m.trees.length ? m : null;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Straight lines between the calibration points; flat beyond the ends. */
export function calibrate(raw: number, curve: ModelFile["calibration"]): number {
  const { x, y } = curve;
  if (!x.length) return raw;
  if (raw <= x[0]) return y[0];
  if (raw >= x[x.length - 1]) return y[y.length - 1];
  let i = 1;
  while (x[i] < raw) i++;
  const t = (raw - x[i - 1]) / (x[i] - x[i - 1] || 1);
  return y[i - 1] + t * (y[i] - y[i - 1]);
}

/** Raw log-odds and each feature's share of it. */
export function walk(values: (number | null)[], model: ModelFile): { logit: number; byFeature: number[] } {
  const byFeature = model.features.map(() => 0);
  let logit = model.baseline;
  for (const t of model.trees) {
    let node = 0;
    while (!t.leaf[node]) {
      const v = values[t.feature[node]];
      const next = v === null || Number.isNaN(v) ? (t.missingLeft[node] ? t.left[node] : t.right[node]) : v <= t.threshold[node] ? t.left[node] : t.right[node];
      byFeature[t.feature[node]] += t.value[next] - t.value[node];
      node = next;
    }
    logit += t.value[node];
  }
  return { logit, byFeature };
}

export function bandOf(p: number, bands: ModelFile["bands"]): DistressBand {
  if (p >= bands.severe) return "severe";
  if (p >= bands.high) return "high";
  if (p >= bands.elevated) return "elevated";
  return "low";
}

function display(feature: FeatureName, v: number | null): string {
  if (v === null) return "Not tagged";
  if (feature === "log_assets") return `$${(Math.exp(v) - 1).toFixed(0)} million of assets`;
  if (feature === "filing_lag") return `${v.toFixed(1)} months`;
  if (feature === "int_cov") return `${v.toFixed(1)}x`;
  if (feature === "rev_growth" || feature === "cash_change") return `${(v * 100).toFixed(0)}%`;
  return v.toFixed(2);
}

export function scoreRow(row: FeatureRow, model: ModelFile): Omit<DistressScore, "inputs" | "leakFree" | "asOf" | "periodEnd"> {
  const values = model.features.map((f) => row.values[f]);
  const { logit, byFeature } = walk(values, model);
  const probability = calibrate(sigmoid(logit), model.calibration);
  const parts: DistressReason[] = model.features.map((f, i) => ({
    feature: f,
    label: FEATURE_LABELS[f],
    value: row.values[f],
    display: display(f, row.values[f]),
    contribution: byFeature[i],
  }));
  const z = row.zScore;
  return {
    probability,
    band: bandOf(probability, model.bands),
    zScore: z,
    zZone: z === null ? null : z < 1.1 ? "distress" : z < 2.6 ? "grey" : "safe",
    reasons: parts.filter((p) => p.contribution > 0.02).sort((a, b) => b.contribution - a.contribution).slice(0, 3),
    offsets: parts.filter((p) => p.contribution < -0.02).sort((a, b) => a.contribution - b.contribution).slice(0, 3),
    modelVersion: model.version,
    trainedThrough: model.trainedThrough,
    baseRate: model.baseRate,
  };
}

/** Scores a company as of a date from its XBRL facts, or null without a model or a balance sheet. */
export function scoreDistress(book: FactBook, cik: string, asOf: string): DistressScore | null {
  const model = loadModel();
  if (!model) return null;
  const row = buildFeatures(book, cik, asOf);
  if (!row) return null;
  return { ...scoreRow(row, model), asOf, periodEnd: row.periodEnd, inputs: row.inputs, leakFree: noLeak(row.inputs, asOf) };
}

export const BAND_LABELS: Record<DistressBand, string> = {
  low: "Low",
  elevated: "Elevated",
  high: "High",
  severe: "Severe",
};
