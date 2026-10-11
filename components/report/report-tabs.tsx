"use client";

export type TabKey = "overview" | "map" | "financials" | "changes" | "peers" | "memo" | "brief" | "sources";

export const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "map", label: "Map" },
  { key: "financials", label: "Financials" },
  { key: "changes", label: "Changes" },
  { key: "peers", label: "Peers" },
  { key: "memo", label: "Memo" },
  { key: "brief", label: "Brief" },
  { key: "sources", label: "Sources" },
];

export function isTab(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}

interface ReportTabsProps {
  active: TabKey;
  /** Small count or status beside a tab label, e.g. number of boxes. */
  badges: Partial<Record<TabKey, string | null>>;
  onChange: (tab: TabKey) => void;
}

/** The report's sections. Sticky, so any section is one click away. */
export function ReportTabs({ active, badges, onChange }: ReportTabsProps) {
  return (
    <nav aria-label="Report sections" className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/95 px-6 backdrop-blur-[8px]">
      <div role="tablist" className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const selected = t.key === active;
          const badge = badges[t.key];
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`panel-${t.key}`}
              onClick={() => onChange(t.key)}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm transition-colors duration-150 ease-out ${
                selected ? "border-zinc-100 font-medium text-zinc-50" : "border-transparent text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
              }`}
            >
              {t.label}
              {badge ? (
                <span className={`rounded-xs px-1.5 font-mono text-[10px] leading-4 ${selected ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300"}`}>{badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
