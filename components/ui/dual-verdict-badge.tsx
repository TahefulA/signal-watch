"use client";

interface DualVerdictBadgeProps {
  /** The memo's own stance, e.g. "Stable"; null while the counter-argument is being written. */
  memoVerdict: string | null;
  concernCount: number;
  busy: boolean;
  onClick: () => void;
}

/** The memo's stance and the Devil's Advocate's count of sourced concerns, on one line. Opens the Memo tab. */
export function DualVerdictBadge({ memoVerdict, concernCount, busy, onClick }: DualVerdictBadgeProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="verdict-badge hidden items-center gap-2 rounded-xs border border-red-600 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors duration-100 ease-out md:inline-flex"
      title="The memo's stance, as Gemini reads it, and the sourced concerns in the Devil's Advocate"
    >
      {busy && !memoVerdict ? (
        <span className="text-zinc-400">Arguing the other side</span>
      ) : (
        <>
          <span className="text-zinc-50">Memo: {memoVerdict ?? "Not classified"}</span>
          <span className="text-zinc-600">·</span>
          <span className="text-red-500">
            {concernCount} concern{concernCount === 1 ? "" : "s"}
          </span>
        </>
      )}
    </button>
  );
}
