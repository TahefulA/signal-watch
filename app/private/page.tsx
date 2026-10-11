"use client";

import { FileText, Lock, ShieldAlert, Upload, X } from "lucide-react";
import Link from "next/link";
import { type ChangeEvent, useState } from "react";
import type { DevilsAdvocate } from "@/types";
import { CounterArgumentColumn } from "@/components/memo/counter-argument-column";
import { DevilsCase } from "@/components/memo/devils-case";
import { ThemeToggle } from "@/components/layout/theme-toggle";

interface Doc {
  name: string;
  text: string;
}

const MAX_DOCUMENTS = 8;
const MAX_CHARACTERS = 1_500_000;

/** Reads a file's text in the browser: PDFs page by page, HTML without its tags, anything else as plain text. */
async function readFile(file: File): Promise<string> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  const raw = await file.text();
  if (/\.html?$/i.test(file.name) || file.type === "text/html") {
    return new DOMParser().parseFromString(raw, "text/html").body.textContent ?? "";
  }
  return raw;
}

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

const field =
  "w-full rounded-xs border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none";

/** The Devil's Advocate for a private company, from documents the user supplies. */
export default function PrivatePage() {
  const [company, setCompany] = useState("");
  const [period, setPeriod] = useState("");
  const [thesis, setThesis] = useState("");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [pasted, setPasted] = useState("");
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devil, setDevil] = useState<DevilsAdvocate | null>(null);

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setReading(true);
    setError(null);
    const added: Doc[] = [];
    for (const file of files) {
      try {
        const text = (await readFile(file)).replace(/[ \t]+/g, " ").trim();
        if (words(text) < 40) setError(`${file.name} has no readable text. A scanned PDF needs text recognition first.`);
        else added.push({ name: file.name, text });
      } catch {
        setError(`${file.name} could not be read.`);
      }
    }
    setDocs((current) => [...current, ...added].slice(0, MAX_DOCUMENTS));
    setReading(false);
  }

  function addPasted() {
    if (words(pasted) < 40) return;
    setDocs((current) => [...current, { name: `Pasted text ${current.length + 1}`, text: pasted.trim() }].slice(0, MAX_DOCUMENTS));
    setPasted("");
  }

  const total = docs.reduce((n, d) => n + d.text.length, 0);
  const ready = company.trim().length > 0 && thesis.trim().length >= 40 && docs.length > 0 && total <= MAX_CHARACTERS;

  async function run() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/private-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, period, thesis, documents: docs }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || typeof body !== "object" || body === null || !("devil" in body)) {
        throw new Error(
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: unknown }).error)
            : response.status === 413
              ? "The documents are too large to send together; remove one and try again."
              : "",
        );
      }
      setDevil((body as { devil: DevilsAdvocate }).devil);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "The case could not be written. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="flex h-12 items-center gap-4 border-b border-zinc-800 px-4">
        <Link href="/" className="flex items-center gap-2" title="Home">
          <ShieldAlert className="h-[18px] w-[18px] text-red-600" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-50">Signal Watch</span>
        </Link>
        <span className="text-[11px] uppercase tracking-wider text-zinc-500">Private company</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-6 py-12 lg:px-12">
        <div className="border-b border-zinc-800 pb-8">
          <p className="font-display text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Devil&rsquo;s advocate &middot; private company</p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-zinc-50">No SEC filings? Argue against the thesis from your own documents.</h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-zinc-400">
            Add the credit agreement, lender report, offering memorandum or quality-of-earnings report, and write the thesis. The same checks run on the
            documents&rsquo; text, the key figures are pulled out and checked against the documents, and the case is written section by section.
          </p>
          <p className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Files are read in your browser. Only their text is sent, to write the case, and nothing is saved.
          </p>
        </div>

        <div className="mt-2 grid gap-10 lg:grid-cols-2 lg:gap-6">
          <div className="min-w-0 space-y-6 pt-10">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Company</span>
                <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Holdings LLC" className={field} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Period (optional)</span>
                <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="LTM June 2026" className={field} />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Thesis or memo to argue against</span>
              <textarea
                value={thesis}
                onChange={(e) => setThesis(e.target.value)}
                rows={6}
                placeholder="We like the first-lien term loan: leverage is 4.5x on adjusted EBITDA, the sponsor has put in 40% equity, and the top customer is investment grade..."
                className={`${field} leading-relaxed`}
              />
            </label>

            <div>
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Documents ({docs.length}/{MAX_DOCUMENTS})
              </span>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xs border border-dashed border-zinc-700 px-4 py-6 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-100">
                <Upload className="h-4 w-4" aria-hidden />
                {reading ? "Reading..." : "Add PDF, text or HTML files"}
                <input type="file" multiple accept=".pdf,.txt,.md,.htm,.html,.csv" onChange={(e) => void addFiles(e)} className="sr-only" disabled={reading} />
              </label>
              {docs.length ? (
                <ul className="mt-3 divide-y divide-zinc-800 rounded-xs border border-zinc-800">
                  {docs.map((d, i) => (
                    <li key={`${d.name}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="w-10 font-mono text-[11px] text-red-500">doc{i + 1}</span>
                      <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-zinc-200">{d.name}</span>
                      <span className="font-mono text-[11px] text-zinc-500">{words(d.text).toLocaleString("en-US")} words</span>
                      <button
                        type="button"
                        onClick={() => setDocs((current) => current.filter((_, j) => j !== i))}
                        className="text-zinc-500 hover:text-zinc-100"
                        aria-label={`Remove ${d.name}`}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {total > MAX_CHARACTERS ? <p className="mt-2 text-xs text-red-400">The documents are too long together; remove one.</p> : null}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-200">Or paste text</summary>
                <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={5} className={`${field} mt-2`} placeholder="Paste a section of a document" />
                <button
                  type="button"
                  onClick={addPasted}
                  disabled={words(pasted) < 40}
                  className="mt-2 rounded-xs border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add as a document
                </button>
              </details>
            </div>

            <p className="text-xs leading-relaxed text-zinc-500">
              Checks that need public data (Form 4 insider trades, 8-Ks, quarterly XBRL figures, the stock price) are marked not evaluated rather than clear.
            </p>
          </div>

          <div className="min-w-0 pt-10 lg:sticky lg:top-0 lg:self-start">
            <CounterArgumentColumn
              devil={devil}
              busy={busy}
              error={error}
              onRun={() => void (ready ? run() : setError("Add the company, a thesis of a few sentences and at least one document."))}
              onEntityClick={() => undefined}
              notes={{
                busy: "Analyzing... Pulling the key figures out of the documents, checking each against the text, running 36 contradiction patterns and writing the case. This takes about a minute.",
                idle: "The case is written only from the documents and the thesis. Every figure must be found in a document, and every source names the document it came from.",
              }}
            />
          </div>
        </div>

        {devil?.sections?.length ? <DevilsCase devil={devil} onEntityClick={() => undefined} /> : null}
      </main>
    </div>
  );
}
