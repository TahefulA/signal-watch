export function Footer({ generatedAt }: { generatedAt?: string }) {
  return (
    <footer className="border-t border-zinc-800">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-6 text-xs text-zinc-500 md:flex-row md:justify-between md:px-12">
        <p>
          Sources: SEC EDGAR filings and Form 4, Google News headlines, Yahoo Finance daily closes. Scores describe
          disclosed risk language and market behavior; they are not investment advice.
        </p>
        {generatedAt ? <p className="font-mono">Data as of {generatedAt.slice(0, 10)}</p> : null}
      </div>
    </footer>
  );
}
