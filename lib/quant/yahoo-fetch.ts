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
  interval = "1d",
  /**
   * true にすると終値に配当・分割調整後の adjclose を使う。
   * 長期のリターン比較では配当を落とすと buy&hold 側が不当に低く出るので、
   * バックテスト用途では true にする。既定は false（既存の呼び出しの挙動を変えない）。
   */
  adjusted = false
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
  const adjcloseSeries: (number | null)[] | undefined =
    result.indicators?.adjclose?.[0]?.adjclose;
  const meta = result.meta || {};

  const bars: OHLCVBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const raw = quote.close?.[i];
    if (raw == null) continue;
    // adjusted 指定でも adjclose が無い銘柄はある。その場合は素の終値に落とす
    const close = adjusted ? adjcloseSeries?.[i] ?? raw : raw;
    if (close == null) continue;
    // OHLC を同じ倍率で寄せる。調整後は水準が変わるので open/high/low だけ生のままだと矛盾する
    const ratio = close / raw;
    bars.push({
      timestamp: timestamps[i] * 1000,
      open: (quote.open?.[i] ?? raw) * ratio,
      high: (quote.high?.[i] ?? raw) * ratio,
      low: (quote.low?.[i] ?? raw) * ratio,
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
