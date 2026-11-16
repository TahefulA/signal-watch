import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = { title: "Changelog · Signal Watch", description: "Every change to Signal Watch, from its merged pull requests." };
export const revalidate = 3600;

const REPO = "TahefulA/signal-watch";
type Pull = { number: number; title: string; html_url: string; merged_at: string | null };

const KIND: Record<string, { label: string; cls: string }> = {
  feat: { label: "New", cls: "border-emerald-700/70 text-emerald-400" },
  fix: { label: "Fixed", cls: "border-amber-600/70 text-amber-400" },
  perf: { label: "Faster", cls: "border-sky-700/70 text-sky-400" },
};
const OTHER = { label: "Behind the scenes", cls: "border-zinc-700 text-zinc-400" };

/** "feat(share): public page…" → kind "feat" and "Public page…". */
function parse(title: string): { kind: { label: string; cls: string }; text: string } {
  const m = title.match(/^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/);
  if (!m) return { kind: OTHER, text: title };
  return { kind: KIND[m[1]] ?? OTHER, text: m[2].charAt(0).toUpperCase() + m[2].slice(1) };
}

async function pulls(): Promise<Pull[] | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/pulls?state=closed&base=main&per_page=100&sort=updated&direction=desc`, {
      headers: { Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
      next: { revalidate: 3600 },
    });
    if (!r.ok) return null;
    return ((await r.json()) as Pull[]).filter((p) => p.merged_at).sort((a, b) => (b.merged_at ?? "").localeCompare(a.merged_at ?? ""));
  } catch {
    return null;
  }
}

/** What changed and when, read from the repository's merged pull requests. Every change goes through one, with CI. */
export default async function ChangelogPage() {
  const list = await pulls();
  const byDay = new Map<string, Pull[]>();
  for (const p of list ?? []) {
    const day = (p.merged_at ?? "").slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), p]);
  }
  return (
    <LegalPage title="Changelog" updated={list?.[0]?.merged_at?.slice(0, 10) ?? "recently"}>
      <p>
        Every change ships as a pull request that must pass lint, type checks, tests and a secret scan, then deploys on merge. This list is read from the{" "}
        <a href={`https://github.com/${REPO}/pulls?q=is%3Apr+is%3Amerged`}>repository</a>.
      </p>
      {list === null ? <p>The list could not be loaded from GitHub just now.</p> : null}
      {[...byDay].map(([day, items]) => (
        <section key={day}>
          <h2>{new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</h2>
          <ul className="!list-none !pl-0">
            {items.map((p) => {
              const { kind, text } = parse(p.title);
              return (
                <li key={p.number} className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 rounded-xs border px-1.5 py-px text-[11px] font-semibold ${kind.cls}`}>{kind.label}</span>
                  <span>
                    {text}{" "}
                    <a href={p.html_url} className="!text-zinc-500 !no-underline hover:!text-zinc-300">
                      #{p.number}
                    </a>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </LegalPage>
  );
}
