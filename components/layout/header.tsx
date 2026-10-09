import Link from "next/link";
import { TickerSearch } from "./ticker-search";

export function Header() {
  return (
    <header className="border-b border-zinc-800">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between md:px-12">
        <Link href="/" className="flex items-baseline gap-3">
          <span className="font-display text-lg font-bold tracking-tight text-zinc-50">Signal Watch</span>
          <span className="hidden text-xs text-zinc-500 sm:inline">Filings, insiders, news and markets, traced to source</span>
        </Link>
        <TickerSearch />
      </div>
    </header>
  );
}
