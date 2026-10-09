import { NextResponse } from "next/server";
import { getSummaries } from "@/lib/data";

export const revalidate = 3600;

export async function GET() {
  return NextResponse.json({ signals: await getSummaries() });
}
