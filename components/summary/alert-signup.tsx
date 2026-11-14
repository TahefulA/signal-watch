"use client";

import { Bell } from "lucide-react";
import { useState } from "react";

/** "Email me if this changes": one address, one company, an unsubscribe link in every email. */
export function AlertSignup({ ticker }: { ticker: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [note, setNote] = useState("");

  const submit = async () => {
    setState("busy");
    try {
      const r = await fetch("/api/alerts/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, ticker }) });
      const body = (await r.json()) as { error?: string; sending?: boolean };
      if (!r.ok) throw new Error(body.error ?? "");
      setNote(body.sending ? "Check your inbox for a confirmation." : "Saved. Emails start once sending is switched on.");
      setState("done");
    } catch (e) {
      setNote(e instanceof Error && e.message ? e.message : "That did not save. Please try again.");
      setState("error");
    }
  };

  return (
    <section className="surface mt-4 rounded-xs border border-zinc-800 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <Bell className="h-4 w-4 text-zinc-400" aria-hidden /> Email me if this changes
      </p>
      <p className="mt-1 text-xs text-zinc-500">When {ticker}&rsquo;s odds move noticeably, or it files something that matters. One email a day at most, unsubscribe anytime.</p>
      {state === "done" ? (
        <p className="mt-3 text-sm text-emerald-400">{note}</p>
      ) : (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            maxLength={200}
            className="h-9 min-w-0 flex-1 rounded-xs border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            aria-label="Email address"
          />
          <button type="submit" disabled={state === "busy"} className="h-9 shrink-0 rounded-xs border border-zinc-600 px-4 text-xs font-semibold text-zinc-100 hover:border-zinc-400 disabled:opacity-50">
            {state === "busy" ? "Saving" : "Notify me"}
          </button>
        </form>
      )}
      {state === "error" ? <p className="mt-2 text-xs text-red-400">{note}</p> : null}
    </section>
  );
}
