"use client";

import { MessageSquare, X } from "lucide-react";
import { useState } from "react";

/** A short form that saves feedback with the page it was sent from. */
export function FeedbackButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const send = async () => {
    if (message.trim().length < 3) return;
    setState("sending");
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, email, page: window.location.pathname + window.location.search }),
      });
      const body = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? "");
      setState("sent");
      setMessage("");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "It could not be sent. Please try again.");
      setState("error");
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex items-center gap-1.5 hover:text-zinc-100 ${className}`}>
        <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Feedback
      </button>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Send feedback" onClick={() => setOpen(false)}>
          <div className="surface w-full max-w-md rounded-xs border border-zinc-700 bg-zinc-950 p-5 text-left font-sans" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-semibold text-zinc-50">What would make this more useful?</p>
              <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-100" aria-label="Close">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {state === "sent" ? (
              <p className="mt-4 text-sm text-zinc-300">Thank you. It has been sent.</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-zinc-500">Something wrong, missing or confusing? Every message is read.</p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={2000}
                  rows={5}
                  className="mt-3 w-full rounded-xs border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                  placeholder="e.g. I'm a credit analyst and I'd want..."
                  aria-label="Your feedback"
                />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  maxLength={200}
                  placeholder="Email, if you'd like a reply (optional)"
                  className="mt-2 h-9 w-full rounded-xs border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                  aria-label="Email (optional)"
                />
                {state === "error" ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={state === "sending" || message.trim().length < 3}
                  className="mt-3 h-9 w-full rounded-xs bg-zinc-50 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
                >
                  {state === "sending" ? "Sending" : "Send"}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
