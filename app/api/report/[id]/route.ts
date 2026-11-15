import { NextResponse } from "next/server";
import { findReportById, tigerEnabled } from "@/lib/tiger";
import { traced } from "@/lib/llm-trace";

export const runtime = "nodejs";

/** A saved report by id, so a link always reopens the same map and memo. */
async function handleGET(_request: Request, { params }: { params: { id: string } }) {
  if (!tigerEnabled()) return NextResponse.json({ error: "Saved reports are not available." }, { status: 404 });
  const report = await findReportById(params.id).catch(() => null);
  if (!report) return NextResponse.json({ error: "This report link is no longer available." }, { status: 404 });
  return NextResponse.json({ report });
}

export const GET = traced("report/[id]", handleGET);
