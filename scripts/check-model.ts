// Checks that lib/distress.ts scores the exported trees exactly as scikit-learn does:
// npx tsx scripts/check-model.ts
import { loadModel, walk } from "../lib/distress";

const model = loadModel() as unknown as (NonNullable<ReturnType<typeof loadModel>> & { checks: { values: (number | null)[]; raw: number }[] }) | null;
if (!model) throw new Error("model/distress.json not found: run model/train.py");
let worst = 0;
for (const c of model.checks) {
  const p = 1 / (1 + Math.exp(-walk(c.values, model).logit));
  worst = Math.max(worst, Math.abs(p - c.raw));
}
console.log(`${model.checks.length} rows checked; largest difference from scikit-learn ${worst.toExponential(2)}`);
if (worst > 1e-6) process.exit(1);
