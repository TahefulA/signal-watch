"use client";

import { ArrowLeft, ArrowRight, Presentation, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { TabKey } from "@/components/layout/tab-bar";
import { TOUR_STEPS } from "@/lib/tour-steps";

interface TourProps {
  step: number;
  onStep: (step: number) => void;
  onClose: () => void;
  /** Opens a tab for a stop that lives on it. */
  onTab: (tab: TabKey) => void;
  activeTab: TabKey;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;
const CARD_WIDTH = 440;

/** The visible part of the element, kept inside the window. */
function measure(selector: string): Box | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const top = Math.max(r.top, 0);
  const left = Math.max(r.left, 0);
  const bottom = Math.min(r.bottom, window.innerHeight);
  const right = Math.min(r.right, window.innerWidth);
  if (bottom <= top || right <= left) return null;
  return { top: top - PAD, left: left - PAD, width: right - left + PAD * 2, height: bottom - top + PAD * 2 };
}

/**
 * Presentation mode: one stop per part of the app. The page around the
 * outlined part is dimmed (it stays usable, so the presenter can hover and
 * click), and a card says what is on screen, why it is there, and a line to
 * say. Arrow keys move between stops; Escape ends the tour.
 */
export function Tour({ step, onStep, onClose, onTab, activeTab }: TourProps) {
  const current = TOUR_STEPS[step];
  const [box, setBox] = useState<Box | null>(null);
  const last = step === TOUR_STEPS.length - 1;

  // Open the stop's tab, bring its element into view, then outline it.
  useEffect(() => {
    if (!current) return;
    if (current.tab && current.tab !== activeTab) onTab(current.tab);
    setBox(null);
    if (!current.target) return;
    const target = current.target;
    const show = () => {
      const el = document.querySelector(target);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < 90 || r.top > window.innerHeight * 0.6) el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? "start" : "center" });
      window.setTimeout(() => setBox(measure(target)), 120);
    };
    const timer = window.setTimeout(show, current.tab && current.tab !== activeTab ? 500 : 60);
    const update = () => setBox(measure(target));
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
    // Only a new stop re-runs this; switching the tab is part of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const next = useCallback(() => (last ? onClose() : onStep(step + 1)), [last, onClose, onStep, step]);
  const back = useCallback(() => step > 0 && onStep(step - 1), [onStep, step]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
      else if (e.key === "Escape") onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [next, back, onClose]);

  if (!current) return null;
  const centered = !current.target;
  // The card sits on the side away from the outlined part.
  const cardLeft = box && box.left + box.width / 2 > window.innerWidth / 2;

  return (
    <div className="tour pointer-events-none fixed inset-0 z-[70]" aria-live="polite">
      {box ? (
        <>
          {/* Four panels dim everything outside the outlined part. */}
          <div className="tour-dim fixed left-0 right-0 top-0" style={{ height: box.top }} />
          <div className="tour-dim fixed left-0 right-0" style={{ top: box.top + box.height, bottom: 0 }} />
          <div className="tour-dim fixed left-0" style={{ top: box.top, height: box.height, width: box.left }} />
          <div className="tour-dim fixed right-0" style={{ top: box.top, height: box.height, left: box.left + box.width }} />
          <div className="tour-ring pointer-events-none fixed rounded-xs border-2 border-red-600" style={box} />
        </>
      ) : (
        <div className="tour-dim fixed inset-0" />
      )}

      <section
        key={step}
        role="dialog"
        aria-label={`Tour, stop ${step + 1} of ${TOUR_STEPS.length}: ${current.title}`}
        className="tour-card pointer-events-auto fixed rounded-xs border border-zinc-700 bg-zinc-950 p-6"
        style={{
          width: CARD_WIDTH,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 72px)",
          overflowY: "auto",
          borderTop: "3px solid #dc2626",
          ...(centered
            ? { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
            : { bottom: 40, ...(cardLeft ? { left: 24 } : { right: 24 }) }),
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-500">
            <Presentation className="h-3.5 w-3.5" aria-hidden /> Tour &middot; {step + 1} of {TOUR_STEPS.length}
          </p>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-100" aria-label="End the tour">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="mt-2 flex gap-[3px]" aria-hidden>
          {TOUR_STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              onClick={() => onStep(i)}
              className={`h-1 flex-1 rounded-[1px] ${i === step ? "bg-red-600" : i < step ? "bg-zinc-500" : "bg-zinc-800"}`}
            />
          ))}
        </div>

        <h2 className="mt-4 font-display text-xl font-semibold leading-snug text-zinc-50">{current.title}</h2>

        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">What you are looking at</p>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-300">{current.look}</p>

        {current.problem ? (
          <>
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-500">The fund&rsquo;s problem it solves</p>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-200">{current.problem}</p>
          </>
        ) : null}

        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">Why it is here</p>
        {/^1\. /.test(current.why) ? (
          <ol className="mt-1 space-y-1.5">
            {current.why
              .split(/\s*\d\. /)
              .filter(Boolean)
              .map((item, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-zinc-200">
                  <span className="font-mono text-red-500">{i + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
          </ol>
        ) : (
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-200">{current.why}</p>
        )}

        <div className="mt-4 border-l-2 border-red-600 pl-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-red-500">Say it like this</p>
          <p className="mt-1 text-[14px] italic leading-relaxed text-zinc-50">&ldquo;{current.say}&rdquo;</p>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={back}
            disabled={step === 0}
            className="inline-flex items-center gap-1.5 rounded-xs border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
          </button>
          <span className="hidden font-mono text-[10px] text-zinc-600 sm:inline">&larr; &rarr; keys &middot; Esc to end</span>
          <button
            type="button"
            onClick={next}
            className="inline-flex items-center gap-1.5 rounded-xs bg-zinc-50 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200"
          >
            {last ? "End tour" : "Next"} {last ? null : <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
          </button>
        </div>
      </section>
    </div>
  );
}
