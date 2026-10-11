"use client";

import { Sword } from "lucide-react";
import { useState } from "react";

interface DevilsAdvocateToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  concernCount: number;
  /** No counter-argument yet. */
  disabled: boolean;
}

/** Switches the map to the Devil's Advocate's view: the boxes it flags in red, the rest faded. */
export function DevilsAdvocateToggle({ enabled, onToggle, concernCount, disabled }: DevilsAdvocateToggleProps) {
  const [pulse, setPulse] = useState(0);
  return (
    <button
      type="button"
      aria-pressed={enabled}
      disabled={disabled}
      onClick={() => {
        setPulse((p) => p + 1);
        onToggle(!enabled);
      }}
      title={disabled ? "The counter-argument is still being written" : `${concernCount} sourced concerns in the counter-argument`}
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-xs border px-3 text-xs font-medium transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 ${
        enabled ? "border-red-600 text-zinc-50" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100"
      }`}
      style={enabled ? { background: "var(--devil-bg)" } : undefined}
    >
      <Sword key={pulse} className={`h-3 w-3 ${pulse ? "icon-pulse" : ""} ${enabled ? "text-red-500" : ""}`} aria-hidden />
      Counter view
      {enabled ? <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-hidden /> : null}
    </button>
  );
}
