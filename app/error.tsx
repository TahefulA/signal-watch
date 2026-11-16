"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/error-reporter";

/** Shown when a page crashes: the error is reported, and the reader can retry or go home. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(`${error.name}: ${error.message}${error.digest ? ` (digest ${error.digest})` : ""}`, error.stack), [error]);
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="font-display text-2xl font-semibold text-zinc-50">Something broke on this page</h1>
      <p className="mt-3 text-sm text-zinc-400">It has been reported. Try again, or go back to the home page.</p>
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" onClick={reset} className="h-9 rounded-xs bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500">
          Try again
        </button>
        <a href="/" className="inline-flex h-9 items-center rounded-xs border border-zinc-700 px-4 text-sm text-zinc-200 hover:border-zinc-500">
          Home
        </a>
      </div>
    </main>
  );
}
