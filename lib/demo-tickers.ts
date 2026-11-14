/**
 * Tickers a visitor is likely to try, kept analysed so they open instantly
 * without touching Gemini: large caps people type first, the worked bitcoin
 * miner examples, and sponsor-backed borrowers on the contagion watch list.
 */
export const DEMO_TICKERS = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "F", "WULF", "IREN", "CIFR", "ALIT", "ADT", "BMBL"];

/**
 * Names people often look up, kept analysed weekly in the warm cron's spare
 * runs: household names and companies with heavy debt or thin cash. A ticker
 * that no longer files simply fails and the rotation moves on.
 */
export const POPULAR_TICKERS = [
  "GOOGL", "META", "NFLX", "DIS", "AMD", "INTC", "BA", "UBER", "PLTR", "SNAP",
  "GME", "AMC", "CCL", "NCLH", "RCL", "AAL", "UAL", "RIVN", "LCID", "CVNA",
  "PTON", "WBD", "PARA", "SIRI", "PLUG", "BYND", "MPW", "OPEN", "TLRY", "LYFT",
  "MARA", "RIOT", "CHPT", "SPCE", "M",
];
