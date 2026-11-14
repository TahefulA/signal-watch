import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { TAGLINE } from "./tab-bar";
import { ThemeToggle } from "./theme-toggle";
import { GeminiKeyButton } from "@/components/settings/gemini-key";

/** Header for pages outside the report view: the wordmark, Radar, Contagion, Proof, Private company and the theme switch. The Lab (/microstructure) is a side project and is not linked. */
type HeaderKey = "radar" | "contagion" | "proof" | "private" | "lab" | "about";

export function Header({ active }: { active?: HeaderKey }) {
  const link = (href: string, label: string, key: HeaderKey) => (
    <Link
      href={href}
      className={`relative flex h-12 shrink-0 items-center whitespace-nowrap px-1 text-xs font-medium ${
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
          <span className="mt-1 hidden text-[11px] text-zinc-500 lg:block">{TAGLINE}</span>
        </span>
      </Link>
      <nav className="ml-auto flex items-center gap-4 overflow-x-auto sm:gap-5">
        {link("/", "Home", "radar")}
        {link("/contagion", "Contagion", "contagion")}
        {link("/proof", "Track record", "proof")}
        {link("/about", "About", "about")}
        {link("/private", "Private company", "private")}
        <GeminiKeyButton />
        <ThemeToggle />
      </nav>
    </header>
  );
}
