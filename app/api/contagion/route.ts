import { loadContagion } from "@/lib/contagion/store";

export const dynamic = "force-dynamic";

/** GET: the newest sponsor contagion build. ?cik= narrows it to one company and its assessment. */
export async function GET(request: Request) {
  const map = await loadContagion();
  if (!map) return Response.json({ error: "The contagion graph has not been built" }, { status: 404 });
  const cik = new URL(request.url).searchParams.get("cik");
  if (!cik) return Response.json(map);
  const key = String(Number(cik));
  const company = map.companies.find((c) => c.cik === key);
  if (!company) return Response.json({ error: "Not a sponsor-backed SEC filer in the graph" }, { status: 404 });
  return Response.json({ company, assessment: map.assessments.find((a) => a.cik === key), builtAt: map.builtAt });
}
