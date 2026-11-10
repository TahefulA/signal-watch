"""Trains the distress model and writes its walk-forward backtest.

    python3 model/train.py            (reads data/dataset.csv from scripts/build-dataset.ts)

Writes:
    model/distress.json   the boosted trees, exported node by node, that lib/distress.ts scores with
    model/backtest.json   out-of-sample results for the Proof page

Method
  * Gradient-boosted trees (scikit-learn HistGradientBoosting, depth 3). Logistic regression and
    Altman Z'' (published 1995 weights, no fitting) are scored on the same rows as baselines.
  * Rows are weighted so the sample stands for the whole XBRL universe (see build-dataset.ts):
    every company with a bankruptcy at weight 1, the rest a random sample at 1 / (share sampled).
  * Walk-forward: each test year Y is scored by models fitted only on rows scored before Y-1,
    whose 12-month outcome was known when Y began.
  * Calibration: the trees overstate high probabilities, so each year's raw scores are mapped
    through an isotonic fit on the raw scores and outcomes of earlier out-of-sample years only.
  * Alert threshold for year Y: the score above which 5% of non-bankrupt rows fell in the
    out-of-sample years before Y (weighted). It is never set from the year it is tested on.
"""

import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "dataset.csv"
META = ROOT / "data" / "dataset-meta.json"
OUT_MODEL = ROOT / "model" / "distress.json"
OUT_BACKTEST = ROOT / "model" / "backtest.json"

FEATURES = [
    "log_assets", "wc_ta", "re_ta", "ebit_ta", "eq_tl", "tl_ta", "cash_ta",
    "ni_ta", "ocf_tl", "int_cov", "rev_growth", "cash_change", "filing_lag",
]
FIRST_TEST_YEAR = 2015
FALSE_ALARM_BUDGET = 0.05
GB = dict(max_depth=3, learning_rate=0.05, max_iter=300, l2_regularization=1.0, random_state=0)


def fit_gb(train):
    m = HistGradientBoostingClassifier(**GB)
    m.fit(train[FEATURES], train["label"], sample_weight=train["weight"])
    return m


def fit_logit(train):
    X = train[FEATURES]
    med = X.median()
    Xi = X.fillna(med)
    mu, sd = Xi.mean(), Xi.std().replace(0, 1)
    m = LogisticRegression(C=0.5, max_iter=2000)
    m.fit((Xi - mu) / sd, train["label"], sample_weight=train["weight"])
    return lambda rows: m.predict_proba((rows[FEATURES].fillna(med) - mu) / sd)[:, 1]


def wmean(x, w):
    w = np.asarray(w, dtype=float)
    return float(np.sum(np.asarray(x, dtype=float) * w) / np.sum(w)) if np.sum(w) > 0 else float("nan")


def wquantile(x, w, q):
    order = np.argsort(x)
    x, w = np.asarray(x)[order], np.asarray(w)[order]
    cum = np.cumsum(w) / np.sum(w)
    return float(x[np.searchsorted(cum, q)])


def brier(p, y, w):
    return wmean((np.asarray(p) - np.asarray(y)) ** 2, w)


def auc(y, s, w):
    return float(roc_auc_score(y, s, sample_weight=w)) if 0 < y.sum() < len(y) else None


def calibration(p, y, w):
    edges = [0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.4, 1.0001]
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi)
        if m.sum() == 0:
            continue
        out.append({"from": lo, "to": min(hi, 1.0), "predicted": wmean(p[m], w[m]), "observed": wmean(y[m], w[m]),
                    "rows": int(m.sum()), "bankruptcies": int(y[m].sum())})
    return out


def fit_iso(rows):
    iso = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip")
    iso.fit(rows["raw"].values, rows["label"].values, sample_weight=rows["weight"].values)
    return iso


def export_trees(m):
    """Every tree as flat node arrays: x <= threshold goes left, a missing value goes where the tree learned."""
    trees = []
    for (pred,) in m._predictors:
        n = pred.nodes
        trees.append({
            "value": [round(float(v), 8) for v in n["value"]],
            "feature": [int(v) for v in n["feature_idx"]],
            "threshold": [float(v) for v in n["num_threshold"]],
            "missingLeft": [bool(v) for v in n["missing_go_to_left"]],
            "left": [int(v) for v in n["left"]],
            "right": [int(v) for v in n["right"]],
            "leaf": [bool(v) for v in n["is_leaf"]],
        })
    return {"baseline": float(np.ravel(m._baseline_prediction)[0]), "trees": trees}


def months_of_warning(g, score, threshold):
    """Months before the filing from which every later score stayed at or above the threshold."""
    flagged = score >= threshold
    for i in range(len(g)):
        if flagged[i:].all():
            return float(g["months_to_event"].iloc[i])
    return None


def main():
    if not DATA.exists():
        sys.exit("data/dataset.csv not found: run scripts/build-dataset.ts first")
    df = pd.read_csv(DATA, low_memory=False)
    meta = json.loads(META.read_text()) if META.exists() else {}
    df["obs"] = pd.to_datetime(df["obs_date"])
    df["year"] = df["obs"].dt.year
    leaking = int((df["max_input_filed"] >= df["obs_date"]).sum())
    assert leaking == 0, f"{leaking} rows use a figure filed on or after the scoring date"

    years = sorted(y for y in df["year"].unique() if y >= FIRST_TEST_YEAR)
    oos, per_year = [], []
    for Y in years:
        train = df[df["obs"] < pd.Timestamp(f"{Y - 1}-01-01")]
        test = df[df["year"] == Y].copy()
        if train["label"].sum() < 20 or test.empty:
            continue
        test["raw"] = fit_gb(train).predict_proba(test[FEATURES])[:, 1]
        test["p_logit"] = fit_logit(train)(test)
        # Threshold from earlier out-of-sample years only; the first year uses its training rows' scores.
        prior = pd.concat(oos) if oos else None
        test["p"] = fit_iso(prior).predict(test["raw"]) if prior is not None else test["raw"]
        if prior is not None:
            neg = prior[prior["label"] == 0]
            thr = wquantile(neg["p"].values, neg["weight"].values, 1 - FALSE_ALARM_BUDGET)
        else:
            tr_neg = train[train["label"] == 0]
            thr = wquantile(fit_gb(train).predict_proba(tr_neg[FEATURES])[:, 1], tr_neg["weight"].values, 1 - FALSE_ALARM_BUDGET)
        test["thr"] = thr
        oos.append(test)
        y, w = test["label"].values, test["weight"].values
        per_year.append({
            "year": int(Y), "rows": int(len(test)), "bankruptcies": int(y.sum()),
            "trainedThrough": str(train["obs"].max().date()), "threshold": thr,
            "auc": auc(y, test["p"], w), "aucLogit": auc(y, test["p_logit"], w),
            "aucZ": auc(y, -test["z"].fillna(test["z"].median()), w),
        })
        print(f"{Y}: auc {per_year[-1]['auc']:.3f} threshold {thr:.4f}")

    o = pd.concat(oos)
    y, w, p = o["label"].values, o["weight"].values, o["p"].values
    z = o["z"].fillna(o["z"].median()).values
    base_rate = wmean(y, w)
    alert = p >= o["thr"].values
    z_alert = z < 1.1

    leads = []
    for cik, g in o[o["event_date"].notna()].groupby("cik"):
        g = g.sort_values("obs")
        g = g[g["months_to_event"] <= 24]
        if g.empty or g["months_to_event"].min() > 12:
            continue
        leads.append({
            "cik": int(cik), "name": str(g["name"].iloc[0]), "event": str(g["event_date"].iloc[0]),
            "lastScore": float(g["p"].iloc[-1]), "lastScoredOn": str(g["obs_date"].iloc[-1]),
            "monthsWarning": months_of_warning(g, g["p"].values, g["thr"].values),
            "monthsWarningZ": months_of_warning(g, -g["z"].fillna(99).values, -1.1),
        })
    caught = [l["monthsWarning"] for l in leads if l["monthsWarning"] is not None]
    caught_z = [l["monthsWarningZ"] for l in leads if l["monthsWarningZ"] is not None]

    final_iso = fit_iso(o)
    o_cal = final_iso.predict(o["raw"].values)
    neg_mask = o["label"].values == 0
    final_thr = wquantile(o_cal[neg_mask], o["weight"].values[neg_mask], 1 - FALSE_ALARM_BUDGET)
    final = fit_gb(df)
    model = {
        "version": f"gbt-{date.today().isoformat()}",
        "kind": "gradient-boosted-trees",
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "trainedThrough": str(df["obs"].max().date()),
        "rows": int(len(df)), "positives": int(df["label"].sum()), "companies": int(df["cik"].nunique()),
        "features": FEATURES,
        "baseRate": base_rate,
        # Bands: the alert threshold is "high"; half of it "elevated"; three times it "severe".
        "bands": {"elevated": final_thr / 2, "high": final_thr, "severe": final_thr * 3},
        "alertThreshold": final_thr,
        # Raw tree score to probability: straight lines between these points, from every out-of-sample year.
        "calibration": {"x": [float(v) for v in final_iso.X_thresholds_], "y": [float(v) for v in final_iso.y_thresholds_]},
        **export_trees(final),
        # Rows with the raw score scikit-learn gives them, so lib/distress.ts can be checked against it.
        "checks": [
            {"values": [None if pd.isna(v) else float(v) for v in r[FEATURES].values], "raw": float(pr)}
            for (_, r), pr in zip(df.sample(20, random_state=1).iterrows(), final.predict_proba(df.sample(20, random_state=1)[FEATURES])[:, 1])
        ],
    }
    OUT_MODEL.write_text(json.dumps(model))

    backtest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dataset": meta,
        "method": {
            "model": "Gradient-boosted trees, depth 3, 300 rounds (scikit-learn HistGradientBoosting), isotonic calibration fitted on earlier years only",
            "baselines": "Logistic regression on the same features; Altman Z'' with its published 1995 weights",
            "weights": "Bankrupt companies weight 1; other companies a random sample weighted by 1 / share sampled",
            "walkForward": "Each test year scored by models fitted only on rows scored at least a year before it starts",
            "label": "An Item 1.03 (bankruptcy or receivership) 8-K within 365 days after the scoring date",
            "scoringDate": "The day after each 10-K or 10-Q was filed; only figures filed before that day are used",
            "alert": f"Score above which {FALSE_ALARM_BUDGET:.0%} of non-bankrupt rows fell in earlier out-of-sample years",
            "features": FEATURES,
        },
        "outOfSample": {
            "rows": int(len(o)), "bankruptcyRows": int(y.sum()),
            "bankruptCompanies": int(o[o["event_date"].notna()]["cik"].nunique()),
            "years": [int(min(years)), int(max(years))],
            "baseRate": base_rate,
            "auc": {"model": auc(y, p, w), "logistic": auc(y, o["p_logit"].values, w), "altmanZ": auc(y, -z, w)},
            "brier": {"model": brier(p, y, w), "logistic": brier(o["p_logit"].values, y, w), "baseRateOnly": brier(np.full_like(p, base_rate), y, w)},
            "atAlert": {
                "hitRate": float(alert[y == 1].mean()),
                "falseAlarmRate": wmean(alert[y == 0], w[y == 0]),
                "precision": float(np.sum(w[alert & (y == 1)]) / np.sum(w[alert])) if alert.any() else None,
            },
            "altmanZDistressZone": {
                "hitRate": float(z_alert[y == 1].mean()),
                "falseAlarmRate": wmean(z_alert[y == 0], w[y == 0]),
                "precision": float(np.sum(w[z_alert & (y == 1)]) / np.sum(w[z_alert])) if z_alert.any() else None,
            },
            "calibration": calibration(p, y, w),
            "perYear": per_year,
        },
        "warning": {
            "bankruptcies": len(leads), "caught": len(caught),
            "medianMonths": float(np.median(caught)) if caught else None,
            "caughtZ": len(caught_z), "medianMonthsZ": float(np.median(caught_z)) if caught_z else None,
            "histogram": [{"months": f"{a}-{b}", "count": int(sum(1 for m in caught if a <= m < b))}
                          for a, b in [(0, 3), (3, 6), (6, 9), (9, 12), (12, 18), (18, 25)]],
            "cases": sorted(leads, key=lambda l: l["event"], reverse=True),
        },
        "importance": dict(zip(FEATURES, [0.0] * len(FEATURES))),
    }
    # Split gain per feature across the final model's trees, as a share of the total.
    gains = np.zeros(len(FEATURES))
    for (pred,) in final._predictors:
        for node in pred.nodes:
            if not node["is_leaf"]:
                gains[node["feature_idx"]] += node["gain"]
    backtest["importance"] = {f: float(g / gains.sum()) for f, g in zip(FEATURES, gains)}
    OUT_BACKTEST.write_text(json.dumps(backtest, indent=1, default=str))

    oo = backtest["outOfSample"]
    print(f"rows {len(df)}, positives {int(df['label'].sum())}; out of sample {oo['years']}")
    print(f"AUC model {oo['auc']['model']:.3f}, logistic {oo['auc']['logistic']:.3f}, Altman Z'' {oo['auc']['altmanZ']:.3f}")
    print(f"Brier model {oo['brier']['model']:.5f}, base rate only {oo['brier']['baseRateOnly']:.5f}")
    print("alert:", oo["atAlert"], "Z'':", oo["altmanZDistressZone"])
    print(f"warning: {len(caught)}/{len(leads)} caught, median {backtest['warning']['medianMonths']} months; Z'' {len(caught_z)}, median {backtest['warning']['medianMonthsZ']}")
    for c in oo["calibration"]:
        print(f"  {c['from']:.3f}-{c['to']:.3f}: predicted {c['predicted']:.4f} observed {c['observed']:.4f} ({c['rows']} rows, {c['bankruptcies']} bankrupt)")
    print(f"live threshold {final_thr:.4f}; model file {OUT_MODEL.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
