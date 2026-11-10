"use client";

import { Check, ExternalLink, Loader2, X } from "lucide-react";
import { useState } from "react";
import type { CommitteeTurn } from "@/types";

const WHO: Record<CommitteeTurn["speaker"], string> = {
  analyst: "Analyst",
  devil: "Devil's Advocate",
  chair: "Chair",
  user: "Committee member",
};

const MOVE: Record<CommitteeTurn["move"], string> = {
  open: "opens",
  attack: "attacks",
  rebut: "rebuts",
  concede: "concedes",
  answer: "answers",
  news: "market news",
};

export function StatusBadge({ status, problems }: { status: CommitteeTurn["status"]; problems: string[] }) {
  if (status === "pending")
    return (
      <span className="inline-flex items-center gap-1 rounded-xs border border-zinc-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Checking
      </span>
    );
  if (status === "verified")
    return (
      <span className="inline-flex items-center gap-1 rounded-xs border border-emerald-700/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-500">
        <Check className="h-3 w-3" aria-hidden /> Verified
      </span>
    );
  return (
    <span
      title={problems.join(" ")}
      className="inline-flex items-center gap-1 rounded-xs border border-red-700/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-red-500"
    >
      <X className="h-3 w-3" aria-hidden /> Struck
    </span>
  );
}

/** One line of the committee: who, what move it makes and against which line, the claim, its evidence and its check. */
export function TurnLine({ turn, onJump }: { turn: CommitteeTurn; onJump: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const side = turn.speaker === "devil" ? "devil" : turn.speaker === "analyst" ? "analyst" : "floor";
  const accent = side === "devil" ? "border-red-600" : side === "analyst" ? "border-emerald-600" : "border-zinc-600";
  const label = side === "devil" ? "text-red-500" : side === "analyst" ? "text-emerald-500" : "text-zinc-400";
  const align = side === "devil" ? "sm:ml-16" : side === "analyst" ? "sm:mr-16" : "sm:mx-8";
  const ev = turn.evidence;

  return (
    <li id={`turn-${turn.id}`} className={`committee-turn border-l-[3px] ${accent} ${align} bg-zinc-900/60 px-4 py-3`} style={side === "devil" ? { background: "var(--devil-bg)" } : undefined}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${label}`}>{WHO[turn.speaker]}</span>
        {turn.speaker !== "user" ? <span className="text-[11px] text-zinc-500">{MOVE[turn.move]}</span> : null}
        {turn.replyingTo ? (
          <button type="button" onClick={() => onJump(turn.replyingTo as string)} className="font-mono text-[10px] text-zinc-500 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-200">
            &uarr; {turn.replyingTo}
          </button>
        ) : null}
        <span className="font-mono text-[10px] text-zinc-600">{turn.id}</span>
        <span className="ml-auto">{turn.speaker === "user" ? null : <StatusBadge status={turn.status} problems={turn.problems} />}</span>
      </div>
      <p className={`mt-1.5 text-[14px] leading-relaxed ${turn.status === "unsupported" ? "text-zinc-500 line-through decoration-red-600/70" : "text-zinc-100"}`}>{turn.text}</p>
      {turn.status === "unsupported" && turn.problems.length ? <p className="mt-1 text-xs text-red-400">Verifier: {turn.problems.join(" ")}</p> : null}
      {ev ? (
        <div className="mt-2">
          <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex max-w-full items-center gap-1.5 text-left text-xs text-zinc-400 hover:text-zinc-100" aria-expanded={open}>
            <span aria-hidden>📎</span>
            <span className="truncate">{ev.title}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-600">{ev.strength}</span>
          </button>
          {open ? (
            <div className="mt-2 border-l-2 border-zinc-700 pl-3 text-xs leading-relaxed text-zinc-400">
              <p>{ev.detail}</p>
              {ev.quote ? <blockquote className="mt-2 italic text-zinc-300">&ldquo;{ev.quote}&rdquo;</blockquote> : null}
              <p className="mt-1.5 font-mono text-[10px] text-zinc-500">
                {ev.source.url ? (
                  <a href={ev.source.url} target={ev.source.url.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer" className="inline-flex items-center gap-1 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-200">
                    {ev.source.label} <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : (
                  ev.source.label
                )}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
