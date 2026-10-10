"use client";

import { ExternalLink } from "lucide-react";
import type { Report } from "@/types";
import { Button } from "@/components/ui/button";
import { BriefView } from "./brief-view";

interface MeetingPrepPanelProps {
  report: Report;
  busy: boolean;
  error: string | null;
  hasPeers: boolean;
  onPrepare: () => void;
}

/** Below the memo: generates the one-page meeting brief and links to its printable page. */
export function MeetingPrepPanel({ report, busy, error, hasPeers, onPrepare }: MeetingPrepPanelProps) {
  return (
    <section aria-labelledby="prep-title" className="border-t border-zinc-800 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="prep-title" className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            Meeting prep
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            A one-page brief: three things to know, the numbers, questions to ask, risks to watch{hasPeers ? " and the loaded peers" : ""}.
          </p>
        </div>
        <div className="flex gap-2">
          {report.brief ? (
            <a
              href={`/brief/${report.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-sm border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-50"
            >
              <ExternalLink className="h-4 w-4 text-zinc-500" aria-hidden />
              Printable page
            </a>
          ) : null}
          <Button onClick={onPrepare} disabled={busy} variant={report.brief ? "secondary" : "primary"}>
            {busy ? "Preparing..." : report.brief ? "Prepare again" : "Prepare meeting brief"}
          </Button>
        </div>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {report.brief ? (
        <div className="mt-6 max-w-4xl rounded-sm border border-zinc-800 bg-zinc-900 p-6">
          <BriefView brief={report.brief} report={report} />
        </div>
      ) : null}
    </section>
  );
}
