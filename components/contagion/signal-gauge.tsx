import { ExternalLink } from "lucide-react";
import type { Signal } from "./language";

/** Three columns, one per question; a lit column has its top bar filled. */
export function SignalGauge({ items }: { items: Signal[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {items.map((s) => (
        <div key={s.key} className={`rounded-xs border p-3 ${s.on ? "border-red-700/70 bg-red-950/20" : "border-zinc-800"}`}>
          <div className="flex h-1 gap-0.5" aria-hidden>
            <span className={`flex-1 rounded-[2px] ${s.on ? "bg-red-600" : "bg-zinc-800"}`} />
            <span className={`flex-1 rounded-[2px] ${s.on && !s.partial ? "bg-red-600" : "bg-zinc-800"}`} />
          </div>
          <p className="mt-2 flex items-baseline justify-between gap-2">
            <span className={`text-sm font-semibold ${s.on ? "text-zinc-50" : "text-zinc-400"}`}>{s.title}</span>
            <span className={`text-[11px] font-semibold uppercase tracking-wider ${s.on ? (s.partial ? "text-amber-500" : "text-red-500") : "text-zinc-600"}`}>{s.on ? (s.partial ? "Partly" : "On") : "Off"}</span>
          </p>
          <p className="text-xs text-zinc-500">{s.question}</p>
          <ul className="mt-2 space-y-1">
            {s.lines.map((l, i) => (
              <li key={i} className={`text-[12px] leading-snug ${l.on ? "text-zinc-200" : "text-zinc-500"}`}>
                {l.text}{" "}
                {l.url ? (
                  <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center text-zinc-500 hover:text-zinc-200" aria-label="Source filing">
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The gauge in one line, for cards: three labelled pips. */
export function SignalPips({ items }: { items: Signal[] }) {
  return (
    <div className="flex gap-1.5">
      {items.map((s) => (
        <span
          key={s.key}
          title={`${s.title}: ${s.on ? (s.partial ? "partly" : "on") : "off"}`}
          className={`rounded-xs border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
            s.on ? (s.partial ? "border-amber-700 text-amber-400" : "border-red-700 bg-red-950/40 text-red-400") : "border-zinc-800 text-zinc-600"
          }`}
        >
          {s.title}
          {s.partial ? <span className="ml-1 font-mono normal-case">½</span> : null}
        </span>
      ))}
    </div>
  );
}
