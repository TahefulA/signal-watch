import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { TAGLINE } from "./tab-bar";
import { ThemeToggle } from "./theme-toggle";

/** Header for pages outside the report view: the wordmark, Analyze, Watchlist and the theme switch. */
export function Header({ active }: { active?: "analyze" | "dashboard" }) {
  const link = (href: string, label: string, key: "analyze" | "dashboard") => (
    <Link
      href={href}
      className={`relative flex h-12 items-center px-1 text-xs font-medium ${
        active === key ? "text-zinc-50 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-red-600" : "text-zinc-400 hover:text-zinc-100"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <header className="flex h-12 items-center gap-4 border-b border-zinc-800 bg-zinc-950 px-4 print:hidden">
      <Link href="/" className="flex shrink-0 items-center gap-2" title="Home">
        <ShieldAlert className="h-[18px] w-[18px] text-red-600" aria-hidden />
        <span className="flex flex-col leading-none">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-50">Signal Watch</span>
          <span className="mt-1 hidden text-[10px] text-zinc-500 lg:block">{TAGLINE}</span>
        </span>
      </Link>
      <nav className="ml-auto flex items-center gap-5">
        {link("/", "Analyze", "analyze")}
        {link("/dashboard", "Watchlist", "dashboard")}
        <ThemeToggle />
      </nav>
    </header>
  );
}
