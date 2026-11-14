"use client";

import { ExternalLink, KeyRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * "Use your own Gemini key". The key lives in this browser's localStorage and
 * rides along on this site's own /api calls as a header; the server uses it
 * for that request and never stores or logs it. Without one, the site's key
 * is used as before.
 */

const STORAGE = "sw-gemini-key";
const HEADER = "x-gemini-key";
/** Google issues keys as "AIza..." and, newer, "AQ.Ab8..."; letters, digits, dots, dashes and underscores. */
const SHAPE = /^[A-Za-z0-9._-]{20,200}$/;

function readKey(): string | null {
  try {
    return window.localStorage.getItem(STORAGE);
  } catch {
    return null;
  }
}

/** Adds the saved key to same-origin /api requests. Installed when this module loads, before any page effect fetches. */
function install(): void {
  const w = window as Window & { __swKeyFetch?: boolean };
  if (w.__swKeyFetch) return;
  w.__swKeyFetch = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const key = readKey();
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const own = url.startsWith("/api/") || url.startsWith(`${window.location.origin}/api/`);
    if (!key || !own) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(HEADER, key);
    return original(input, { ...init, headers });
  };
}
if (typeof window !== "undefined") install();

export function GeminiKeyButton() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => setSaved(Boolean(readKey())), []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !panel.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const save = () => {
    const key = draft.trim();
    if (!SHAPE.test(key)) {
      setError("That does not look like a Gemini API key.");
      return;
    }
    try {
      window.localStorage.setItem(STORAGE, key);
      setSaved(true);
      setDraft("");
      setError(null);
      setOpen(false);
    } catch {
      setError("This browser blocks local storage, so the key cannot be kept.");
    }
  };
  const clear = () => {
    try {
      window.localStorage.removeItem(STORAGE);
    } catch {
      // Nothing was stored.
    }
    setSaved(false);
  };

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-8 w-8 items-center justify-center rounded-xs border border-zinc-800 text-zinc-400 hover:text-zinc-100"
        aria-label={saved ? "Gemini key: using yours" : "Use your own Gemini key"}
        title={saved ? "Using your Gemini key" : "Use your own Gemini key"}
        aria-expanded={open}
      >
        <KeyRound className="h-4 w-4" aria-hidden />
        {saved ? <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500" aria-hidden /> : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-50 w-[min(340px,calc(100vw-32px))] rounded-xs border border-zinc-700 bg-zinc-950 p-4 text-left shadow-xl" role="dialog" aria-label="Gemini key">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-50">Use your own Gemini key</p>
            <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-200" aria-label="Close">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
            The site&apos;s shared key is on Google&apos;s free tier and can hit its limits when traffic is high. With your own key, your analyses run on your quota.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            The key stays in this browser and is sent only with this site&apos;s own requests. The server uses it for that request and never saves or logs it.
          </p>
          {saved ? (
            <div className="mt-3 flex items-center justify-between rounded-xs border border-emerald-800 bg-emerald-950/30 px-2.5 py-2 text-xs text-emerald-300">
              Using your key on this browser.
              <button type="button" onClick={clear} className="text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:text-zinc-50">
                Remove
              </button>
            </div>
          ) : (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <input
                type="password"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="AIza... or AQ...."
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-xs border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100 placeholder:text-zinc-600"
                aria-label="Gemini API key"
              />
              <button type="submit" className="rounded-xs border border-zinc-500 px-3 text-xs text-zinc-100 hover:border-zinc-300">
                Save
              </button>
            </form>
          )}
          {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-100"
          >
            Get a free key in Google AI Studio <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>
      ) : null}
    </div>
  );
}
