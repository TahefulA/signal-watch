import type { EntityType, Severity } from "@/types";

export const TYPE_LABELS: Record<EntityType, string> = {
  company: "Company",
  risk: "Risk",
  macro: "Macro or policy",
  financial: "Financial",
  regulatory: "Regulatory",
  neutral: "Other",
};

export const TYPE_BORDER: Record<EntityType, string> = {
  company: "border-blue-600",
  risk: "border-red-600",
  macro: "border-amber-600",
  financial: "border-emerald-600",
  regulatory: "border-violet-600",
  neutral: "border-zinc-400",
};

export const TYPE_SWATCH: Record<EntityType, string> = {
  company: "bg-blue-600",
  risk: "bg-red-600",
  macro: "bg-amber-600",
  financial: "bg-emerald-600",
  regulatory: "bg-violet-600",
  neutral: "bg-zinc-400",
};

export const SEVERITY_STRIP: Record<Severity, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
  none: "bg-zinc-200",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  high: "High severity",
  medium: "Medium severity",
  low: "Low severity",
  none: "No severity",
};

/** Darker shade of each type color, used on hover. */
export const TYPE_BORDER_HOVER: Record<EntityType, string> = {
  company: "hover:border-blue-800",
  risk: "hover:border-red-800",
  macro: "hover:border-amber-800",
  financial: "hover:border-emerald-800",
  regulatory: "hover:border-violet-800",
  neutral: "hover:border-zinc-600",
};
