import Link from "next/link";

/** Every page outside the report view ends here: what this is not, and where to read more. */
export function Footer() {
  return (
    <footer className="mt-16 border-t border-zinc-800 px-4 py-8 text-xs text-zinc-500 sm:px-6 lg:px-10 print:hidden">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-2">
        <span>Signal Watch · built by Taheful Alam</span>
        <Link href="/about" className="hover:text-zinc-200">
          About and limits
        </Link>
        <Link href="/proof" className="hover:text-zinc-200">
          Track record
        </Link>
        <span className="sm:ml-auto">Not financial advice. Estimates from public filings; they can be wrong.</span>
      </div>
    </footer>
  );
}
