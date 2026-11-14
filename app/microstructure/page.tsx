import type { Metadata } from "next";
import { Header } from "@/components/layout/header";
import { MicrostructureView } from "@/components/microstructure/microstructure-view";

export const metadata: Metadata = { title: "Microstructure lab · Signal Watch" };

export default function MicrostructurePage() {
  return (
    <div className="min-h-[100dvh]">
      <Header active="lab" />
      <main className="mx-auto max-w-[1280px] px-4 py-10 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-600">Lab · Order book microstructure</p>
        <h1 className="mt-2 font-display text-[30px] font-bold leading-tight text-zinc-50">Unusual activity in a live order book</h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-zinc-400">
          A real level-2 book from Polymarket&apos;s public feed, streamed into the browser, with rolling statistics kept in constant or logarithmic time per update and
          robust detectors on top: outsized fills by median and MAD, sustained drift by CUSUM, and depth shifts near the touch. Fed rate markets come first because rates
          drive the floating-rate debt the rest of Signal Watch scores.
        </p>
        <MicrostructureView />
      </main>
    </div>
  );
}
