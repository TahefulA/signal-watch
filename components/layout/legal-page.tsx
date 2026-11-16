import type { ReactNode } from "react";
import { Footer } from "./footer";
import { Header } from "./header";

/** The frame for Privacy, Terms and the Changelog: plain headings and paragraphs. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 [&_a]:text-zinc-100 [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-10 [&_h2]:text-[11px] [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:text-zinc-400 [&_li]:mt-2 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        <h1 className="font-display text-[32px] font-semibold leading-tight text-zinc-50">{title}</h1>
        <p className="!mt-2 text-xs text-zinc-500">Last updated {updated}</p>
        <div className="text-[15px] leading-relaxed text-zinc-300">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
