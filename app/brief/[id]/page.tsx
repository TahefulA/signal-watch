import { notFound } from "next/navigation";
import { BriefView } from "@/components/brief/brief-view";
import { PrintButton } from "@/components/brief/print-button";
import { findReportById, tigerEnabled } from "@/lib/tiger";

export const dynamic = "force-dynamic";

export default async function BriefPage({ params }: { params: { id: string } }) {
  const report = tigerEnabled() ? await findReportById(params.id).catch(() => null) : null;
  if (!report?.brief) notFound();
  return (
    <main className="mx-auto max-w-4xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <a href={`/?report=${report.id}`} className="text-sm text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-100">
          Back to the map
        </a>
        <PrintButton />
      </div>
      <BriefView brief={report.brief} report={report} />
    </main>
  );
}
