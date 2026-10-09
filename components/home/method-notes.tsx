import { COMPONENTS } from "@/lib/components";

export function MethodNotes() {
  return (
    <section aria-labelledby="method-heading" className="space-y-3">
      <h2 id="method-heading" className="text-xs font-medium uppercase tracking-widest text-zinc-500">
        How the score is built
      </h2>
      <dl className="space-y-4 rounded-md border border-zinc-800 p-5">
        {COMPONENTS.map((c) => (
          <div key={c.key}>
            <dt className="flex items-baseline justify-between text-sm text-zinc-200">
              {c.label}
              <span className="font-mono text-xs text-zinc-500">{Math.round(c.weight * 100)}%</span>
            </dt>
            <dd className="mt-1 text-xs leading-relaxed text-zinc-500">{c.description}</dd>
          </div>
        ))}
        <p className="border-t border-zinc-800 pt-4 text-xs leading-relaxed text-zinc-500">
          Each day is scored using only what was public that day. Language is classified; every figure comes from the
          filing, the Form 4 or the price history.
        </p>
      </dl>
    </section>
  );
}
