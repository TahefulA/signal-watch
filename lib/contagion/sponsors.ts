import type { Sponsor } from "@/types";

/**
 * The sponsors searched for. Each alias is a name the firm's own entities use
 * in credit agreement definitions ("Sponsor" means Leonard Green & Partners,
 * L.P. ...). The list picks firms whose portfolios include liability
 * management exercises or bankruptcies; which companies they own, and which
 * events happened, comes from EDGAR.
 */
export const SPONSORS: Sponsor[] = [
  { id: "apollo", name: "Apollo", aliases: ["Apollo Management", "Apollo Global", "Apollo Capital", "Apollo Investment Fund", "Apollo"] },
  { id: "kkr", name: "KKR", aliases: ["Kohlberg Kravis Roberts", "KKR"] },
  { id: "leonard-green", name: "Leonard Green", aliases: ["Leonard Green", "Green Equity Investors"] },
  { id: "tpg", name: "TPG", aliases: ["TPG Global", "TPG Capital", "TPG Partners", "TPG Holdings", "TPG"] },
  { id: "bc-partners", name: "BC Partners", aliases: ["BC Partners", "BC European Capital", "BCEC"] },
  { id: "advent", name: "Advent International", aliases: ["Advent International", "Advent"] },
  { id: "platinum", name: "Platinum Equity", aliases: ["Platinum Equity"] },
  { id: "searchlight", name: "Searchlight", aliases: ["Searchlight Capital", "Searchlight"] },
  { id: "carlyle", name: "Carlyle", aliases: ["Carlyle Group", "Carlyle Partners", "Carlyle Investment", "Carlyle"] },
  { id: "blackstone", name: "Blackstone", aliases: ["Blackstone Capital Partners", "Blackstone Group", "Blackstone Inc", "Blackstone"] },
  { id: "bain", name: "Bain Capital", aliases: ["Bain Capital"] },
  { id: "hellman", name: "Hellman & Friedman", aliases: ["Hellman & Friedman", "Hellman and Friedman", "H&F"] },
  { id: "vista", name: "Vista Equity", aliases: ["Vista Equity", "VEPF"] },
];

/** The name used in the full-text search: specific enough to keep out unrelated "Apollo" or "Advent" products. */
export const SEARCH_NAME: Record<string, string> = {
  apollo: "Apollo",
  kkr: "KKR",
  "leonard-green": "Leonard Green",
  tpg: "TPG",
  "bc-partners": "BC Partners",
  advent: "Advent International",
  platinum: "Platinum Equity",
  searchlight: "Searchlight",
  carlyle: "Carlyle",
  blackstone: "Blackstone",
  bain: "Bain Capital",
  hellman: "Hellman",
  vista: "Vista Equity",
};
