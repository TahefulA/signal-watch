import type { Sponsor } from "@/types";
import { SPONSORS } from "./sponsors";

/** Jaro-Winkler similarity of two strings, 0 to 1. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aHit = new Array<boolean>(a.length).fill(false);
  const bHit = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bHit[j] || a[i] !== b[j]) continue;
      aHit[i] = bHit[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let transpositions = 0;
  for (let i = 0, j = 0; i < a.length; i++) {
    if (!aHit[i]) continue;
    while (!bHit[j]) j++;
    if (a[i] !== b[j]) transpositions++;
    j++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(l ?p|llc|inc|ltd|l ?l ?c|co|corp|corporation|the|fund|funds|management|partners|group|holdings|capital|global|advisors|investors?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** How close a filed name is to a sponsor: exact alias as a whole word, or a Jaro-Winkler match on the core name. */
function score(text: string, sponsor: Sponsor): number {
  for (const alias of sponsor.aliases) {
    const re = new RegExp(`(^|[^A-Za-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])`);
    if (re.test(text)) return 1;
  }
  const core = norm(text);
  return Math.max(0, ...sponsor.aliases.map((a) => jaroWinkler(core, norm(a))));
}

/**
 * The sponsors a definition names. "Apollo Management IX, L.P." and "Apollo
 * Global Management" both resolve to Apollo; a name only close to an alias
 * counts when it scores 0.93 or better.
 */
export function sponsorsNamed(definition: string): Sponsor[] {
  const names = Array.from(definition.matchAll(/[A-Z][A-Za-z&.,'-]*(?:\s+(?:[A-Z][A-Za-z&.,'-]*|&|and|of))*/g)).map((m) => m[0]);
  return SPONSORS.filter((s) => score(definition, s) === 1 || names.some((n) => score(n, s) >= 0.93));
}

/** True when two filed company names are the same company: "Medline Inc." and "MEDLINE INC". */
export function sameCompany(a: string, b: string): boolean {
  return jaroWinkler(norm(a), norm(b)) >= 0.95;
}
