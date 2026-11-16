import type { DistressBand } from "@/types";
import { BANDS } from "@/lib/summary-words";

/** Half-circle gauge: four equal band segments, needle at the middle of the company's band. */
export function Gauge({ band }: { band: DistressBand }) {
  const i = BANDS.findIndex((b) => b.band === band);
  const arc = (k: number) => {
    const a0 = Math.PI * (1 - k / 4) - 0.02;
    const a1 = Math.PI * (1 - (k + 1) / 4) + 0.02;
    const p = (a: number, r: number) => `${100 + r * Math.cos(a)} ${100 - r * Math.sin(a)}`;
    return `M ${p(a0, 80)} A 80 80 0 0 1 ${p(a1, 80)}`;
  };
  const needle = Math.PI * (1 - (i + 0.5) / 4);
  return (
    <svg viewBox="0 0 200 112" className="w-full max-w-[260px]" role="img" aria-label={`Risk band: ${BANDS[i].label}`}>
      {BANDS.map((b, k) => (
        <path key={b.band} d={arc(k)} stroke={b.color} strokeWidth={k === i ? 18 : 6} strokeOpacity={k === i ? 1 : 0.55} fill="none" />
      ))}
      <line x1="100" y1="100" x2={100 + 62 * Math.cos(needle)} y2={100 - 62 * Math.sin(needle)} stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-zinc-200" />
      <circle cx="100" cy="100" r="5" className="fill-zinc-200" />
    </svg>
  );
}

