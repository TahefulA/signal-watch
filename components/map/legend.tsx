import { ENTITY_TYPES, SEVERITIES } from "@/types/entity";
import { SEVERITY_LABELS, SEVERITY_STRIP, TYPE_LABELS, TYPE_SWATCH } from "@/lib/entity-style";

interface LegendProps {
  highConfidenceOnly?: boolean;
  onToggleConfidence?: (value: boolean) => void;
}

export function Legend({ highConfidenceOnly = false, onToggleConfidence }: LegendProps) {
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
      <span className="ml-2 text-[10px] font-medium uppercase tracking-widest text-zinc-600">Confidence</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-xs bg-emerald-500" aria-hidden />
        High
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-xs border border-emerald-500" aria-hidden />
        Medium
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-xs border border-dashed border-amber-500" aria-hidden />
        Low
      </span>
      {onToggleConfidence ? (
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-zinc-300">
          <input
            type="checkbox"
            checked={highConfidenceOnly}
            onChange={(e) => onToggleConfidence(e.target.checked)}
            className="h-3.5 w-3.5 accent-zinc-300"
          />
          Show only high confidence
        </label>
      ) : null}
    </div>
  );
}
