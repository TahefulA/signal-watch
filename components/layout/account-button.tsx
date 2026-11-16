"use client";

import { LogIn, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Me = { user: { email: string; name: string | null } | null; enabled: boolean };

/** Sign in with Google, or the signed-in account's menu. Hidden when sign-in is not configured. */
export function AccountButton() {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json() as Promise<Me>)
      .then(setMe)
      .catch(() => setMe(null));
  }, []);
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

  if (!me?.enabled) return null;

  if (!me.user) {
    const signIn = () => {
      window.location.href = `/api/auth/google?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    };
    return (
      <button type="button" onClick={signIn} className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-xs border border-zinc-800 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-600 hover:text-zinc-50">
        <LogIn className="h-3.5 w-3.5" aria-hidden /> Sign in
      </button>
    );
  }

  const post = async (path: string) => {
    setBusy(true);
    await fetch(path, { method: "POST" }).catch(() => null);
    window.location.href = "/";
  };
  const remove = () => {
    if (window.confirm("Delete your account, your saved watchlist and your email alerts? This cannot be undone.")) void post("/api/auth/delete");
  };
  const label = me.user.name ?? me.user.email;

  return (
    <div ref={panel} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={me.user.email}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-xs font-semibold uppercase text-zinc-200 hover:border-zinc-500"
      >
        {label.trim()[0] ?? <UserRound className="h-4 w-4" aria-hidden />}
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-50 flex w-60 flex-col rounded-xs border border-zinc-800 bg-zinc-900 py-1 text-left text-xs text-zinc-300 shadow-lg">
          <div className="border-b border-zinc-800 px-3 py-2">
            {me.user.name ? <p className="truncate text-zinc-100">{me.user.name}</p> : null}
            <p className="truncate text-zinc-500">{me.user.email}</p>
          </div>
          <p className="px-3 py-2 text-zinc-500">Your watchlist is saved to this account.</p>
          <button type="button" disabled={busy} onClick={() => void post("/api/auth/logout")} className="px-3 py-2 text-left hover:bg-zinc-800 hover:text-zinc-50">
            Sign out
          </button>
          <Link href="/privacy" className="px-3 py-2 hover:bg-zinc-800 hover:text-zinc-50">
            Privacy
          </Link>
          <button type="button" disabled={busy} onClick={remove} className="px-3 py-2 text-left text-red-400 hover:bg-zinc-800">
            Delete account
          </button>
        </div>
      ) : null}
    </div>
  );
}
