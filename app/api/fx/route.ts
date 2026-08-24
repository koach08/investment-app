import { NextResponse } from "next/server";

/**
 * 円換算レートをまとめて返す。
 *
 * 保有データには USD だけでなく SGD なども混ざる（data/holdings.json に実在する）。
 * 合算する前に必ず円へ揃えるため、扱う通貨のレートを1か所で出す。
 * 取れなかった通貨は返さない。呼び出し側で 0 円扱いにせず「換算できない」と扱うこと。
 */

const PAIRS: { code: string; symbol: string }[] = [
  { code: "USD", symbol: "JPY=X" },
  { code: "EUR", symbol: "EURJPY=X" },
  { code: "GBP", symbol: "GBPJPY=X" },
  { code: "AUD", symbol: "AUDJPY=X" },
  { code: "SGD", symbol: "SGDJPY=X" },
  { code: "HKD", symbol: "HKDJPY=X" },
  { code: "CNY", symbol: "CNYJPY=X" },
];

async function fetchYahooPrice(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 900 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" && price > 0 ? price : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const results = await Promise.all(PAIRS.map((p) => fetchYahooPrice(p.symbol)));

  const rates: Record<string, number> = { JPY: 1 };
  const missing: string[] = [];
  PAIRS.forEach((p, i) => {
    const v = results[i];
    if (v === null) missing.push(p.code);
    else rates[p.code] = Math.round(v * 10000) / 10000;
  });

  return NextResponse.json({
    rates,
    missing,
    fetchedAt: new Date().toISOString(),
  });
}
