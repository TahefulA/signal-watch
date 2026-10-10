import { ENTITY_TYPES, SEVERITIES } from "@/types/entity";
import { SEVERITY_LABELS, SEVERITY_STRIP, TYPE_LABELS, TYPE_SWATCH } from "@/lib/entity-style";

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-400">
      <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Border</span>
      {ENTITY_TYPES.map((type) => (
        <span key={type} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-xs ${TYPE_SWATCH[type]}`} aria-hidden />
          {TYPE_LABELS[type]}
        </span>
      ))}
      <span className="ml-2 text-[10px] font-medium uppercase tracking-widest text-zinc-600">Left strip</span>
      {SEVERITIES.map((severity) => (
        <span key={severity} className="inline-flex items-center gap-1.5">
          <span className={`h-3 w-1 ${SEVERITY_STRIP[severity]}`} aria-hidden />
          {SEVERITY_LABELS[severity].replace(" severity", "")}
        </span>
      ))}
    </div>
  );
}
