import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import { ContagionView } from "@/components/contagion/contagion-view";
import { loadContagion } from "@/lib/contagion/store";

export const metadata: Metadata = { title: "Sponsor contagion · Signal Watch" };
export const dynamic = "force-dynamic";

export default async function ContagionPage({ searchParams }: { searchParams: { company?: string } }) {
  const map = await loadContagion();
  return (
    <div className="min-h-[100dvh]">
      <Header active="contagion" />
      <main className="mx-auto max-w-[1280px] px-4 py-10 lg:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-red-600">Sponsor contagion</p>
        <h1 className="mt-2 font-display text-[30px] font-bold leading-tight text-zinc-50">Owners repeat the playbook. Who is next?</h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-zinc-400">
          When a private equity owner squeezes the lenders of one company, its other companies tend to follow. This page reads who owns whom from the companies&apos; own loan
          documents, marks every bankruptcy and lender squeeze in their 8-Ks, and flags the borrowers where the same move could come next.
        </p>
        {map ? (
          <ContagionView map={map} initial={searchParams.company ?? null} />
        ) : (
          <p className="mt-10 text-sm text-zinc-400">The graph has not been built yet. Run scripts/build-contagion.ts.</p>
        )}
      </main>
    </div>
  );
}
