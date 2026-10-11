import type { ReactNode } from "react";

/**
 * The two building blocks every tab uses, so the page has one rhythm: a Card
 * (bordered, titled, optional note on why it matters) and a Stat tile.
 */
export function Card({
  title,
  why,
  actions,
  children,
  className = "",
  id,
}: {
  title: string;
  /** One line on why a credit analyst looks at this. */
  why?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} aria-label={title} className={`rounded-xs border border-zinc-800 bg-zinc-900/60 ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-zinc-800 px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-300">{title}</h2>
          {why ? <p className="mt-0.5 text-xs text-zinc-500">{why}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

const TONE: Record<"stress" | "watch" | "neutral", string> = {
  stress: "bg-red-600",
  watch: "bg-amber-600",
  neutral: "bg-zinc-700",
};

export function Stat({
  label,
  value,
  sub,
  note,
  tone = "neutral",
  muted = false,
  wrap = false,
}: {
  label: string;
  value: string;
  sub?: string | null;
  /** How the figure was built, on hover. */
  note?: string;
  tone?: "stress" | "watch" | "neutral";
  muted?: boolean;
  /** Let the sub line wrap instead of truncating. */
  wrap?: boolean;
}) {
  return (
    <div className="relative min-w-0 border border-zinc-800 bg-zinc-950 px-4 py-3" title={note}>
      <span className={`absolute inset-y-0 left-0 w-0.5 ${TONE[tone]}`} aria-hidden />
      <p className="truncate text-[11px] text-zinc-400">{label}</p>
      <p className={`mt-1 truncate font-mono text-lg font-medium leading-tight ${muted ? "text-zinc-500" : "text-zinc-50"}`}>{value}</p>
      {sub ? <p className={`mt-1 text-[11px] leading-snug text-zinc-500 ${wrap ? "" : "truncate"}`}>{sub}</p> : null}
    </div>
  );
}

/** Tab-level heading row: what the tab is for, and its actions. */
export function TabIntro({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl">
        <h2 className="font-display text-xl font-bold tracking-tight text-zinc-50">{title}</h2>
        {children ? <p className="mt-1 text-sm leading-relaxed text-zinc-400">{children}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
