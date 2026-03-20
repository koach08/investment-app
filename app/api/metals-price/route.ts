import { NextResponse } from "next/server";

const METALS = [
  { key: "gold", symbol: "GC=F", nameJa: "金", nameEn: "Gold" },
  { key: "silver", symbol: "SI=F", nameJa: "銀", nameEn: "Silver" },
  { key: "platinum", symbol: "PL=F", nameJa: "プラチナ", nameEn: "Platinum" },
];

const TROY_OZ_TO_GRAM = 31.1035;

async function fetchYahooPrice(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data.chart?.result?.[0]?.meta;
    return meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // Fetch all metal prices + USDJPY in parallel
    const [goldUsd, silverUsd, platinumUsd, usdjpy] = await Promise.all([
      fetchYahooPrice("GC=F"),
      fetchYahooPrice("SI=F"),
      fetchYahooPrice("PL=F"),
      fetchYahooPrice("JPY=X"),
    ]);

    if (!usdjpy) {
      return NextResponse.json({ error: "為替レート取得失敗" }, { status: 502 });
    }

    const results = METALS.map((m, i) => {
      const priceUsd = [goldUsd, silverUsd, platinumUsd][i];
      if (priceUsd === null) return { ...m, priceUsd: null, priceJpyPerGram: null };
      const priceJpyPerGram = Math.round((priceUsd * usdjpy) / TROY_OZ_TO_GRAM);
      return {
        key: m.key,
        nameJa: m.nameJa,
        nameEn: m.nameEn,
        symbol: m.symbol,
        priceUsd: Math.round(priceUsd * 100) / 100,
        priceJpyPerOz: Math.round(priceUsd * usdjpy),
        priceJpyPerGram,
      };
    });

    return NextResponse.json({
      metals: results,
      usdjpy: Math.round(usdjpy * 100) / 100,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `取得失敗: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
