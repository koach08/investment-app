import type { OHLCVBar } from "./types";

export interface YahooChartResult {
  ticker: string;
  name: string;
  currency: string;
  bars: OHLCVBar[];
}

export async function fetchYahooBars(
  ticker: string,
  range = "1y",
  interval = "1d"
): Promise<YahooChartResult> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?range=${range}&interval=${interval}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Yahoo Finance ${ticker}: ${res.status}`);
  }
  const data = await res.json();
  const result = data.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${ticker}`);

  const timestamps: number[] = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const meta = result.meta || {};

  const bars: OHLCVBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close?.[i];
    if (close == null) continue;
    bars.push({
      timestamp: timestamps[i] * 1000,
      open: quote.open?.[i] ?? close,
      high: quote.high?.[i] ?? close,
      low: quote.low?.[i] ?? close,
      close,
      volume: quote.volume?.[i] ?? 0,
    });
  }

  return {
    ticker,
    name: meta.shortName || meta.longName || meta.symbol || ticker,
    currency: meta.currency || "JPY",
    bars,
  };
}
