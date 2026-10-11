import Link from "next/link";
import type { ReactNode } from "react";

/** Top bar: wordmark, an optional search slot, and the two pages. */
export function Header({ active, children }: { active?: "analyze" | "dashboard"; children?: ReactNode }) {
  const link = (href: string, label: string, key: "analyze" | "dashboard") => (
    <Link
      href={href}
      className={`text-xs ${active === key ? "text-zinc-100 underline decoration-zinc-500 underline-offset-4" : "text-zinc-400 hover:text-zinc-100"}`}
    >
      {label}
    </Link>
  );
  return (
    <header className="border-b border-zinc-800 bg-zinc-950 px-6 py-2.5 print:hidden">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link href="/" className="font-display text-sm font-bold tracking-widest text-zinc-100">
          SIGNAL WATCH
        </Link>
        {children ? <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">{children}</div> : <span className="hidden text-xs text-zinc-500 sm:inline">Entity map and credit memo from SEC filings and news</span>}
        <nav className="ml-auto flex gap-5">
          {link("/dashboard", "Dashboard", "dashboard")}
          {link("/", "Analyze", "analyze")}
        </nav>
      </div>
    </header>
  );
}
