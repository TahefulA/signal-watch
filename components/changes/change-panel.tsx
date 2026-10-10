"use client";

import type { ChangeKind, ChangeReport, EntityDiff } from "@/types";
import { Button } from "@/components/ui/button";
import { CitationBlock } from "@/components/ui/citation";

const GROUPS: { title: string; kinds: ChangeKind[]; dot: string }[] = [
  { title: "New", kinds: ["new", "new_debt"], dot: "bg-emerald-500" },
  { title: "Changed", kinds: ["magnitude", "debt_amount"], dot: "bg-amber-500" },
  { title: "No longer mentioned", kinds: ["removed", "repaid_debt"], dot: "border border-dashed border-zinc-500" },
];

interface ChangePanelProps {
  changes: ChangeReport | null | undefined;
  busy: boolean;
  step: string | null;
  error: string | null;
  onCompare: () => void;
  onSelectEntity: (id: string) => void;
}

function Item({ diff, onSelectEntity }: { diff: EntityDiff; onSelectEntity: (id: string) => void }) {
  const entityId = diff.entityId;
  return (
    <li className="py-2">
      <div className="text-sm text-zinc-300">
        {entityId ? (
          <button
            type="button"
            onClick={() => onSelectEntity(entityId)}
            className="text-zinc-100 underline decoration-zinc-600 underline-offset-4 hover:decoration-zinc-300"
          >
            {diff.name}
          </button>
        ) : (
          <span className="text-zinc-100">{diff.name}</span>
        )}{" "}
        {diff.detail}
        {diff.before || diff.after ? (
          <span className="ml-1 font-mono text-xs text-zinc-400">
            {diff.before ?? "none"} → {diff.after ?? "none"}
          </span>
        ) : null}
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer list-none text-[11px] text-zinc-500 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-200">
          Evidence
        </summary>
        {diff.citations.map((c) => (
          <CitationBlock key={`${c.sourceDate}-${c.quote}`} citation={c} compact />
        ))}
      </details>
    </li>
  );
}

/** Sits above the map: what the newest filings changed compared with the previous quarter's. */
export function ChangePanel({ changes, busy, step, error, onCompare, onSelectEntity }: ChangePanelProps) {
  if (!changes) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border border-zinc-800 px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">Changes</span>
        <span className="text-sm text-zinc-400">
          {busy ? (step ?? "Reading the previous quarter's filings...") : "Compare these filings with the previous quarter's to see what is new."}
        </span>
        {!busy ? (
          <Button onClick={onCompare} className="ml-auto">
            Compare with previous quarter
          </Button>
        ) : null}
        {error ? (
          <p className="w-full text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const facts = changes.changes.filter((c) => !c.judgment);
  const judgments = changes.changes.filter((c) => c.judgment);
  const baseline = changes.baselineFilings.map((f) => f.title).join(", ");
  const newer = changes.newFilings.map((f) => f.title).join(", ");

  return (
    <section aria-labelledby="changes-title" className="mb-4 border border-zinc-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-800 px-4 py-3">
        <h3 id="changes-title" className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          Changes since the previous quarter
        </h3>
        <p className="font-mono text-[10px] text-zinc-500">
          {newer || "No new filings"} vs {baseline}
        </p>
      </div>
      {facts.length === 0 ? (
        <p className="px-4 py-3 text-sm text-zinc-400">The newer filings add or remove no entity on the map.</p>
      ) : (
        <div className="grid gap-x-8 px-4 py-2 lg:grid-cols-3">
          {GROUPS.map((g) => {
            const items = facts.filter((c) => g.kinds.includes(c.kind));
            return (
              <div key={g.title}>
                <p className="mt-2 inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                  <span className={`h-2 w-2 rounded-full ${g.dot}`} aria-hidden />
                  {g.title}
                </p>
                {items.length === 0 ? (
                  <p className="py-2 text-sm text-zinc-500">None</p>
                ) : (
                  <ul className="divide-y divide-zinc-800/80">
                    {items.map((d) => (
                      <Item key={`${d.kind}-${d.name}`} diff={d} onSelectEntity={onSelectEntity} />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
      {judgments.length > 0 || changes.mentionedBefore.length > 0 ? (
        <div className="border-t border-zinc-800 px-4 py-3 text-xs leading-relaxed text-zinc-500">
          {judgments.length > 0 ? (
            <p>
              Gemini&rsquo;s reading also changed for {judgments.map((j) => j.name).join(", ")}. These are ratings, not
              filing facts, so they are not marked on the map.
            </p>
          ) : null}
          {changes.mentionedBefore.length > 0 ? (
            <p className={judgments.length > 0 ? "mt-1" : ""}>
              Mapped only this time but already disclosed before, so not marked new: {changes.mentionedBefore.join(", ")}.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
