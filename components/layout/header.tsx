import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function Header({ active }: { active?: "analyze" | "dashboard" }) {
  const link = (href: string, label: string, key: "analyze" | "dashboard") => (
    <Link
      href={href}
      className={`text-xs ${active === key ? "text-zinc-100 underline decoration-zinc-500 underline-offset-4" : "text-zinc-400 hover:text-zinc-100"}`}
    >
      {label}
    </Link>
  );
  return (
    <header className="border-b border-zinc-800 px-6 py-3 print:hidden">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <Link href="/" className="font-display text-sm font-bold tracking-widest text-zinc-100">
          SIGNAL WATCH
        </Link>
        <span className="hidden text-xs text-zinc-500 sm:inline">Entity map and credit memo from SEC filings and news</span>
        <nav className="ml-auto flex items-center gap-5">
          {link("/dashboard", "Dashboard", "dashboard")}
          {link("/", "Analyze", "analyze")}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
