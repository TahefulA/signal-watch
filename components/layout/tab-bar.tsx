"use client";

export type TabKey = "graph" | "financial" | "capital" | "changes" | "peers" | "memo";

export const TABS: { key: TabKey; label: string }[] = [
  { key: "graph", label: "Graph" },
  { key: "financial", label: "Financial" },
  { key: "capital", label: "Capital" },
  { key: "changes", label: "Changes" },
  { key: "peers", label: "Peers" },
  { key: "memo", label: "Memo" },
];

/** Where each view sits in Gatto's seven-step credit process. */
export const STEP_LABELS: Record<TabKey, string> = {
  graph: "Step 2 · Qualitative Analysis",
  financial: "Step 3a · Profitability",
  capital: "Step 3c · Capital Structure",
  changes: "Step 4 · Forecasting",
  peers: "Step 5 · Valuation",
  memo: "Step 7 · Investment Recommendation",
};

export const TAGLINE = "The credit analyst\u2019s workflow, automated.";

export function isTab(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}

interface TabBarProps {
  active: TabKey;
  /** Tabs with nothing loaded yet show a dash; they stay clickable so the data can be requested there. */
  empty: Partial<Record<TabKey, boolean>>;
  /** Tabs with something new show a red dot. */
  dot: Partial<Record<TabKey, boolean>>;
  onChange: (tab: TabKey) => void;
}

/** 40px tab row. One view at a time; the active tab carries a red underline. */
export function TabBar({ active, empty, dot, onChange }: TabBarProps) {
  return (
    <nav aria-label="Views" className="h-10 shrink-0 border-b border-zinc-800 bg-zinc-950 px-4 print:hidden">
      <div role="tablist" className="flex h-full items-stretch gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const selected = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`panel-${t.key}`}
              onClick={() => onChange(t.key)}
              className={`-mb-px inline-flex shrink-0 items-center gap-1.5 rounded-t-xs border-b-2 px-4 text-[13px] transition-colors duration-150 ease-out ${
                selected
                  ? "tab-active border-red-600 font-semibold text-zinc-50"
                  : `border-transparent font-medium hover:bg-zinc-900 hover:text-zinc-200 ${empty[t.key] ? "text-zinc-600" : "text-zinc-400"}`
              }`}
            >
              {t.label}
              {empty[t.key] && !selected ? <span className="text-zinc-600">&mdash;</span> : null}
              {dot[t.key] ? <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-label="New" /> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
