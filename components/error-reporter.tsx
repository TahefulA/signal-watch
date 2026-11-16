"use client";

import { useEffect } from "react";

const sent = new Set<string>();

/** Sends one report per distinct error per page load. Browser-extension noise is skipped. */
export function reportClientError(message: string, stack?: string | null): void {
  if (!message || sent.has(message) || sent.size >= 5) return;
  if (/extension:\/\/|ResizeObserver loop/.test(`${message} ${stack ?? ""}`)) return;
  sent.add(message);
  void fetch("/api/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, stack, path: window.location.pathname }),
    keepalive: true,
  }).catch(() => undefined);
}

/** Listens for uncaught errors and rejected promises in the browser. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportClientError(e.message, e.error instanceof Error ? e.error.stack : null);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      reportClientError(r instanceof Error ? `${r.name}: ${r.message}` : String(r), r instanceof Error ? r.stack : null);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
