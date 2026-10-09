import type { SignalEvent } from "@/types";
import { daysBetween, formatDate } from "../dates";
import { type FilingRef, extractSections, locateSentence, splitSentences } from "../edgar";
import { BOILERPLATE_SENTENCE, COVENANT_PHRASE, FIRST_TIME_PHRASES, HEDGED_SENTENCE, LIQUIDITY_PHRASE, documentTone } from "../lexicon";
import { type ComponentDay, clampScore, decayWeight, makeEvent, round1 } from "./shared";

/** Filing anomalies keep weight for a quarter, roughly until the next periodic filing. */
export const FILING_DECAY_DAYS = 90;

export interface FilingSentence {
  text: string;
  url: string;
  label: string;
}

export interface AnalyzedFiling {
  ref: FilingRef;
  url: string;
  sentences: FilingSentence[];
  /** Sentence count of the risk factor section, when present. */
  riskSentences: string[];
  mdaSentences: string[];
  /** 0-100 management tone of MD&A, periodic filings only. */
  tone: number | null;
}

export interface RawDocument {
  url: string;
  text: string;
}

export function analyzeFiling(ref: FilingRef, documents: RawDocument[], toneOverride: number | null): AnalyzedFiling {
  const sentences: FilingSentence[] = [];
  let riskSentences: string[] = [];
  let mdaSentences: string[] = [];
  documents.forEach((doc, index) => {
    const sections = index === 0 ? extractSections(doc.text) : [];
    const form = index === 0 ? ref.form : `${ref.form} exhibit`;
    for (const text of splitSentences(doc.text)) {
      sentences.push({ text, url: doc.url, label: locateSentence(text, sections, form) });
    }
    if (index === 0) {
      riskSentences = splitSentences(sections.find((s) => s.label.includes("Risk Factors"))?.text ?? "");
      mdaSentences = splitSentences(sections.find((s) => s.label.includes("Management"))?.text ?? "");
    }
  });
  const periodic = ref.form === "10-K" || ref.form === "10-Q";
  const tone = periodic && mdaSentences.length > 20 ? (toneOverride ?? documentTone(mdaSentences.join(" "))) : null;
  return { ref, url: documents[0]?.url ?? "", sentences, riskSentences, mdaSentences, tone };
}

function formLabel(ref: FilingRef): string {
  return `${ref.form} filed ${formatDate(ref.filingDate)}`;
}

/**
 * Turns filings into anomaly events. Each filing is compared with everything the
 * company filed before it, so "first-time" means first time within the analyzed history.
 */
export function filingEvents(ticker: string, filings: AnalyzedFiling[], baselineCount: number): SignalEvent[] {
  const sorted = [...filings].sort((a, b) => a.ref.filingDate.localeCompare(b.ref.filingDate));
  const seenPhrases = new Set<string>();
  const seenSentences = new Set<string>();
  const events: SignalEvent[] = [];
  const lastPeriodic = new Map<string, AnalyzedFiling>();
  let lastToneFiling: AnalyzedFiling | null = null;

  sorted.forEach((filing, index) => {
    const isBaseline = index < baselineCount;
    const ref = filing.ref;
    const emit = (title: string, sentence: { text: string; url: string; label: string }, points: number) => {
      if (isBaseline) return;
      events.push(
        makeEvent({
          ticker,
          date: ref.filingDate,
          event_type: "filing",
          category: "filing",
          component: "filing_anomaly",
          title,
          quote: sentence.text,
          quote_kind: "verbatim",
          source_label: `${sentence.label}, filed ${formatDate(ref.filingDate)}`,
          source_url: sentence.url,
          score_impact: points,
        }),
      );
    };

    const firm = filing.sentences.filter((s) => !HEDGED_SENTENCE.test(s.text));
    for (const phrase of FIRST_TIME_PHRASES) {
      const hit = firm.find((s) => phrase.pattern.test(s.text));
      if (hit && !seenPhrases.has(phrase.key)) {
        emit(`First mention of “${phrase.label}” in ${formLabel(ref)}`, hit, phrase.points);
      }
      if (filing.sentences.some((s) => phrase.pattern.test(s.text))) seenPhrases.add(phrase.key);
    }

    const newSentences = filing.sentences.filter((s) => !seenSentences.has(s.text) && !BOILERPLATE_SENTENCE.test(s.text));
    const covenant = newSentences.find((s) => COVENANT_PHRASE.pattern.test(s.text) && /\b(new|amend|waiver|require|maintain|minimum|maximum)\w*/i.test(s.text));
    if (covenant) emit(`New covenant language in ${formLabel(ref)}`, covenant, COVENANT_PHRASE.points);

    const liquidity = newSentences.find((s) => LIQUIDITY_PHRASE.pattern.test(s.text));
    if (liquidity) emit(`Liquidity language in ${formLabel(ref)}`, liquidity, LIQUIDITY_PHRASE.points);

    const previousSameForm = lastPeriodic.get(ref.form);
    if (previousSameForm && filing.riskSentences.length >= 10 && previousSameForm.riskSentences.length >= 10) {
      const growth = filing.riskSentences.length / previousSameForm.riskSentences.length - 1;
      if (growth > 0.2) {
        const prior = new Set(previousSameForm.riskSentences);
        const added = filing.riskSentences.find((s) => !prior.has(s) && !BOILERPLATE_SENTENCE.test(s));
        const sentence = filing.sentences.find((s) => s.text === added);
        if (sentence) {
          emit(
            `Risk factor section grew ${Math.round(growth * 100)}% versus the prior ${ref.form}`,
            sentence,
            15,
          );
        }
      }
    }

    if (filing.tone !== null) {
      if (lastToneFiling?.tone !== null && lastToneFiling !== null && Math.abs(filing.tone - (lastToneFiling.tone ?? 0)) > 30) {
        const prior = new Set(lastToneFiling.mdaSentences);
        const fresh = filing.mdaSentences.filter((s) => !prior.has(s) && !BOILERPLATE_SENTENCE.test(s));
        const sentence = filing.sentences.find((s) => s.text === fresh[0]);
        if (sentence) {
          emit(
            `Management tone moved from ${lastToneFiling.tone} to ${filing.tone} in ${formLabel(ref)}`,
            sentence,
            20,
          );
        }
      }
      lastToneFiling = filing;
    }

    if (ref.form === "10-K" || ref.form === "10-Q") lastPeriodic.set(ref.form, filing);
    for (const s of filing.sentences) seenSentences.add(s.text);
  });
  return events;
}

export function filingComponent(date: string, events: SignalEvent[]): ComponentDay {
  let total = 0;
  const drivers: string[] = [];
  for (const event of events) {
    const weight = decayWeight(daysBetween(event.date, date), FILING_DECAY_DAYS);
    if (weight > 0) {
      total += event.score_impact * weight;
      drivers.push(event.id);
    }
  }
  const value = round1(clampScore(total));
  const note =
    drivers.length === 0
      ? "No filing anomalies in the last 90 days."
      : `${drivers.length} anomal${drivers.length === 1 ? "y" : "ies"} from filings in the last 90 days, weighted by age.`;
  return { value, drivers, note };
}
