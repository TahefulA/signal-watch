import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { TickerView } from "@/components/ticker/ticker-view";
import { getDataset, TRACKED_TICKERS } from "@/lib/data";

interface PageProps {
  params: { symbol: string };
}

export const revalidate = 3600;

export function generateStaticParams(): { symbol: string }[] {
  return TRACKED_TICKERS.map((symbol) => ({ symbol }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return { title: `${params.symbol.toUpperCase()} · Signal Watch` };
}

export default async function TickerPage({ params }: PageProps) {
  const symbol = params.symbol.toUpperCase();
  const dataset = await getDataset(symbol);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 md:px-12">
        {dataset ? (
          <TickerView dataset={dataset} />
        ) : (
          <div className="max-w-xl space-y-4">
            <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-50">
              {symbol} is not on the watchlist yet.
            </h1>
            <p className="text-sm text-zinc-400">
              Signal Watch scores companies in a scheduled job that reads every filing, Form 4 and headline from the
              last year. These tickers are scored today:
            </p>
            <ul className="flex flex-wrap gap-2">
              {TRACKED_TICKERS.map((t) => (
                <li key={t}>
                  <Link
                    href={`/ticker/${t}`}
                    className="inline-block rounded-sm border border-zinc-700 px-3 py-1.5 font-mono text-sm text-zinc-300 hover:border-zinc-500 hover:text-zinc-50"
                  >
                    {t}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
      <Footer generatedAt={dataset?.generated_at} />
    </div>
  );
}
