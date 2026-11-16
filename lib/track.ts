"use client";

/** Browser side of lib/events.ts. Opening any page with ?internal=1 marks this browser as the owner's, and it stops sending. */
const INTERNAL = "sw-internal";

function internal(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("internal") === "1") window.localStorage.setItem(INTERNAL, "1");
    return window.localStorage.getItem(INTERNAL) === "1";
  } catch {
    return false;
  }
}

export function track(name: "page_view" | "report_view" | "share", ticker?: string): void {
  if (typeof window === "undefined" || internal()) return;
  void fetch("/api/t", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ticker, path: window.location.pathname }),
    keepalive: true,
  }).catch(() => undefined);
}

/** True in the owner's browser; components/settings/gemini-key.tsx then marks its /api calls so server-side events skip them too. */
export function isInternal(): boolean {
  return typeof window !== "undefined" && internal();
}
