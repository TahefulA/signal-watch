import type { TickerProfile } from "@/types";

export interface UniverseEntry extends Omit<TickerProfile, "cik" | "name"> {
  /** Search phrase for news, usually the company name plus ticker. */
  news_query: string;
  /** Display name when the EDGAR conformed name reads poorly. */
  display_name?: string;
}

/** Featured tickers shown on the homepage and stored as fixtures. */
export const FEATURED: UniverseEntry[] = [
  { ticker: "WULF", display_name: "TeraWulf Inc.", sector: "Digital infrastructure", sector_etf: "XLK", news_query: "TeraWulf WULF" },
  { ticker: "F", display_name: "Ford Motor Co.", sector: "Automobiles", sector_etf: "XLY", news_query: "\"Ford Motor\" stock" },
  { ticker: "T", display_name: "AT&T Inc.", sector: "Telecommunications", sector_etf: "XLC", news_query: "\"AT&T\" stock" },
];

/** Wider set used only for the backtest. */
export const BACKTEST_UNIVERSE: UniverseEntry[] = [
  ...FEATURED,
  { ticker: "GM", sector: "Automobiles", sector_etf: "XLY", news_query: "\"General Motors\" stock" },
  { ticker: "RIVN", sector: "Automobiles", sector_etf: "XLY", news_query: "Rivian RIVN" },
  { ticker: "LCID", sector: "Automobiles", sector_etf: "XLY", news_query: "Lucid LCID" },
  { ticker: "VZ", sector: "Telecommunications", sector_etf: "XLC", news_query: "Verizon VZ stock" },
  { ticker: "CHTR", sector: "Telecommunications", sector_etf: "XLC", news_query: "Charter Communications CHTR" },
  { ticker: "WBD", sector: "Media", sector_etf: "XLC", news_query: "Warner Bros. Discovery WBD" },
  { ticker: "AAL", sector: "Airlines", sector_etf: "XLI", news_query: "American Airlines AAL stock" },
  { ticker: "BA", sector: "Aerospace", sector_etf: "XLI", news_query: "Boeing BA stock" },
  { ticker: "CCL", sector: "Leisure", sector_etf: "XLY", news_query: "Carnival CCL stock" },
  { ticker: "NCLH", sector: "Leisure", sector_etf: "XLY", news_query: "Norwegian Cruise NCLH" },
  { ticker: "M", sector: "Retail", sector_etf: "XLY", news_query: "Macy's stock" },
  { ticker: "KSS", sector: "Retail", sector_etf: "XLY", news_query: "Kohl's KSS stock" },
  { ticker: "INTC", sector: "Semiconductors", sector_etf: "XLK", news_query: "Intel INTC stock" },
  { ticker: "PLUG", sector: "Clean energy", sector_etf: "XLI", news_query: "Plug Power PLUG" },
  { ticker: "CVNA", sector: "Retail", sector_etf: "XLY", news_query: "Carvana CVNA" },
  { ticker: "UPST", sector: "Consumer lending", sector_etf: "XLF", news_query: "Upstart UPST" },
  { ticker: "CIFR", sector: "Digital infrastructure", sector_etf: "XLK", news_query: "Cipher Mining CIFR" },
];
