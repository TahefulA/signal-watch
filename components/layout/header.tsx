"use client";

import { Menu, Search, ShieldAlert, X } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { TAGLINE } from "./tab-bar";
import { ThemeToggle } from "./theme-toggle";
import { GeminiKeyButton } from "@/components/settings/gemini-key";

/** The one header on every page: wordmark, a ticker search (except on Home, which has its own), the main pages and settings. The Lab (/microstructure) is a side project and is not linked. */
type HeaderKey = "radar" | "contagion" | "proof" | "private" | "lab" | "about";

interface HeaderProps {
  active?: HeaderKey;
  /** Shows the ticker search. Without onAnalyze it opens /company?ticker=. */
  search?: boolean;
  onAnalyze?: (ticker: string) => void;
  busy?: boolean;
  /** Watched companies in Act now or Review, shown beside Home. */
  attention?: number;
  /** The wordmark and Home return home without a page load. */
  onHome?: () => void;
}

export function Header({ active, search = active !== "radar", onAnalyze, busy = false, attention = 0, onHome }: HeaderProps) {
  const [value, setValue] = useState("");
  const [menu, setMenu] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ticker = value.trim().toUpperCase();
    if (!ticker || busy) return;
    setValue("");
    if (onAnalyze) onAnalyze(ticker);
    else window.location.href = `/company?ticker=${encodeURIComponent(ticker)}`;
  }

  const home = (event: React.MouseEvent) => {
    if (!onHome || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    onHome();
  };

  const link = (href: string, label: string, key: HeaderKey, extra?: React.ReactNode) => (
    <Link
      href={href}
      onClick={href === "/" ? home : undefined}
      className={`relative flex h-14 shrink-0 items-center gap-1.5 whitespace-nowrap px-1 text-[13px] font-medium ${
        active === key ? "text-zinc-50 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-red-600" : "text-zinc-400 hover:text-zinc-100"
      }`}
    >
      {label}
      {extra}
    </Link>
  );

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 sm:gap-6 sm:px-6 print:hidden">
      <Link href="/" onClick={home} className="flex shrink-0 items-center gap-2" title="Home">
        <ShieldAlert className="h-5 w-5 text-red-600" aria-hidden />
        <span className="hidden flex-col leading-none sm:flex">
          <span className="text-[13px] font-semibold tracking-tight text-zinc-50">Signal Watch</span>
          <span className="mt-1 hidden text-[11px] text-zinc-500 xl:block">{TAGLINE}</span>
        </span>
      </Link>

      {search ? (
        <form onSubmit={submit} role="search" className="relative min-w-0 flex-1 sm:max-w-[260px] sm:flex-none">
          <label htmlFor="header-ticker" className="sr-only">
            Ticker symbol
          </label>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input
            id="header-ticker"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^A-Za-z0-9.\-]/g, ""))}
            placeholder={busy ? "Reading filings…" : "Check a ticker"}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
            maxLength={10}
            className="h-9 w-full rounded-xs border border-zinc-800 bg-zinc-900 pl-8 pr-3 font-mono text-[13px] uppercase text-zinc-50 placeholder:font-sans placeholder:normal-case placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none disabled:opacity-60"
          />
        </form>
      ) : null}

      <nav className="ml-auto flex shrink-0 items-center gap-4 sm:gap-5">
        <span className="contents max-md:hidden">
          {link(
            "/",
            "Home",
            "radar",
            attention > 0 ? (
              <span className="rounded-xs bg-red-600 px-1.5 py-px font-mono text-[11px] font-semibold text-white" aria-label={`${attention} on your watchlist need attention`}>
                {attention}
              </span>
            ) : null,
          )}
          {link("/contagion", "Contagion", "contagion")}
          {link("/proof", "Track record", "proof")}
          {link("/about", "About", "about")}
          {link("/private", "Private company", "private")}
        </span>
        <span className="contents max-sm:hidden">
          <GeminiKeyButton />
        </span>
        <ThemeToggle />
        <button type="button" onClick={() => setMenu((m) => !m)} className="text-zinc-400 hover:text-zinc-100 md:hidden" aria-expanded={menu} aria-label="Menu">
          {menu ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </nav>
      {menu ? (
        <div className="absolute inset-x-0 top-14 z-50 flex flex-col border-b border-zinc-800 bg-zinc-950 px-4 py-2 md:hidden">
          {[
            ["/", "Home"],
            ["/contagion", "Contagion"],
            ["/proof", "Track record"],
            ["/about", "About"],
            ["/private", "Private company"],
          ].map(([href, label]) => (
            <Link key={href} href={href} onClick={() => setMenu(false)} className="py-2.5 text-sm text-zinc-300 hover:text-zinc-50">
              {label}
              {href === "/" && attention > 0 ? <span className="ml-2 rounded-xs bg-red-600 px-1.5 py-px font-mono text-[11px] font-semibold text-white">{attention}</span> : null}
            </Link>
          ))}
          <div className="py-2.5 sm:hidden">
            <GeminiKeyButton />
          </div>
        </div>
      ) : null}
    </header>
  );
}
