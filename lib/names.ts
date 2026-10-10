/** Name matching shared by entity resolution, change detection and peer comparison. */

const SUFFIXES = new Set(["inc", "corp", "corporation", "co", "company", "llc", "lp", "ltd", "plc", "pbc", "the", "and", "of", "a", "an"]);

/** Lower-cased words with a crude plural stem, so "tariffs" matches "tariff". */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0)
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

export function keyWords(name: string): string[] {
  return words(name).filter((w) => !SUFFIXES.has(w));
}

/** Entity resolution: "Anthropic PBC" and "Anthropic" are the same; so are names sharing most key words. */
export function sameEntity(a: string, b: string): boolean {
  const ka = keyWords(a);
  const kb = keyWords(b);
  if (ka.length === 0 || kb.length === 0) return false;
  if (ka.join(" ") === kb.join(" ")) return true;
  const sa = new Set(ka);
  const sb = new Set(kb);
  const shared = ka.filter((w) => sb.has(w)).length;
  const smaller = Math.min(sa.size, sb.size);
  // "Fluidstack" vs "Fluidstack Ltd" (subset), or "NY Data Center Moratorium" vs "New York Data Center Moratorium".
  if (shared === smaller && smaller >= 1 && (smaller >= 2 || ka.length === 1 || kb.length === 1)) return true;
  return shared / new Set([...ka, ...kb]).size >= 0.6;
}

const CONNECTORS = new Set(["of", "the", "and", "for", "&"]);

/** True when one name is the initials of the other, e.g. "NYPA" and "New York Power Authority". */
export function isAcronym(short: string, long: string): boolean {
  const s = short.replace(/[^A-Za-z]/g, "");
  if (s.length < 2 || s.length > 6 || s !== s.toUpperCase()) return false;
  const initials = long
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0 && !CONNECTORS.has(w.toLowerCase()))
    .map((w) => w[0].toUpperCase())
    .join("");
  return initials === s;
}
