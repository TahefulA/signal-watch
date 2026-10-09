const DAY_MS = 86_400_000;

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  return toIsoDate(new Date(parseIsoDate(iso).getTime() + days * DAY_MS));
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()) / DAY_MS);
}

/** Every calendar date from start to end inclusive. */
export function dateRange(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  for (let d = startIso; d <= endIso; d = addDays(d, 1)) dates.push(d);
  return dates;
}

const DISPLAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: string): string {
  return DISPLAY.format(parseIsoDate(iso));
}

export function formatShortDate(iso: string): string {
  return SHORT.format(parseIsoDate(iso));
}
