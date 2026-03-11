import { NextResponse } from "next/server";

const GLOBAL_INDICES: Record<string, { symbol: string; region: string }> = {
  // アジア
  "🇯🇵 日経225":      { symbol: "^N225", region: "アジア" },
  "🇯🇵 TOPIX":        { symbol: "^TPX", region: "アジア" },
  "🇨🇳 上海総合":     { symbol: "000001.SS", region: "アジア" },
  "🇭🇰 香港ハンセン": { symbol: "^HSI", region: "アジア" },
  "🇰🇷 KOSPI":        { symbol: "^KS11", region: "アジア" },
  "🇮🇳 NIFTY50":      { symbol: "^NSEI", region: "アジア" },
  "🇦🇺 ASX200":       { symbol: "^AXJO", region: "アジア" },
  "🇸🇬 STI":          { symbol: "^STI", region: "アジア" },
  // 欧州
  "🇩🇪 DAX":          { symbol: "^GDAXI", region: "欧州" },
  "🇬🇧 FTSE100":      { symbol: "^FTSE", region: "欧州" },
  "🇫🇷 CAC40":        { symbol: "^FCHI", region: "欧州" },
  "🇮🇹 FTSE MIB":     { symbol: "FTSEMIB.MI", region: "欧州" },
  "🇪🇸 IBEX35":       { symbol: "^IBEX", region: "欧州" },
  "🇨🇭 SMI":          { symbol: "^SSMI", region: "欧州" },
  "🇳🇱 AEX":          { symbol: "^AEX", region: "欧州" },
  // 米州
  "🇺🇸 S&P500":       { symbol: "^GSPC", region: "米国" },
  "🇺🇸 NASDAQ":       { symbol: "^IXIC", region: "米国" },
  "🇺🇸 DOW":          { symbol: "^DJI", region: "米国" },
  "🇺🇸 Russell2000":  { symbol: "^RUT", region: "米国" },
  "🇧🇷 Bovespa":      { symbol: "^BVSP", region: "米国" },
  "🇲🇽 IPC":          { symbol: "^MXX", region: "米国" },
  // FX
  "💴 USD/JPY":        { symbol: "JPY=X", region: "FX" },
  "💶 EUR/USD":        { symbol: "EURUSD=X", region: "FX" },
  "💷 GBP/USD":        { symbol: "GBPUSD=X", region: "FX" },
  "🇦🇺 AUD/USD":      { symbol: "AUDUSD=X", region: "FX" },
  "🇨🇭 USD/CHF":      { symbol: "CHF=X", region: "FX" },
  "🇨🇳 USD/CNY":      { symbol: "CNY=X", region: "FX" },
  "💵 DXY":            { symbol: "DX-Y.NYB", region: "FX" },
  // 商品
  "🥇 金":             { symbol: "GC=F", region: "商品" },
  "🥈 銀":             { symbol: "SI=F", region: "商品" },
  "🟤 銅":             { symbol: "HG=F", region: "商品" },
  "🛢️ WTI":           { symbol: "CL=F", region: "商品" },
  "⛽ 天然ガス":       { symbol: "NG=F", region: "商品" },
  "🌾 小麦":           { symbol: "ZW=F", region: "商品" },
  // 仮想通貨
  "₿ BTC":             { symbol: "BTC-USD", region: "仮想通貨" },
  "Ξ ETH":             { symbol: "ETH-USD", region: "仮想通貨" },
  // ボラティリティ・金利
  "😱 VIX":            { symbol: "^VIX", region: "ボラ・金利" },
  "📊 米2年金利":      { symbol: "^IRX", region: "ボラ・金利" },
  "📊 米10年金利":     { symbol: "^TNX", region: "ボラ・金利" },
};

async function fetchQuote(symbol: string): Promise<{ close: number; prevClose: number; chgPct: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const closes = (result.indicators?.quote?.[0]?.close || []).filter((v: number | null) => v !== null);
    if (closes.length < 2) return null;

    const close = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const chgPct = ((close - prevClose) / prevClose) * 100;
    return { close, prevClose, chgPct };
  } catch {
    return null;
  }
}

export async function GET() {
  const entries = Object.entries(GLOBAL_INDICES);
  const results = await Promise.allSettled(
    entries.map(([, { symbol }]) => fetchQuote(symbol))
  );

  const response: Record<string, {
    label: string;
    symbol: string;
    close: number;
    prevClose: number;
    chgPct: number;
    region: string;
  }> = {};

  entries.forEach(([label, { symbol, region }], i) => {
    const result = results[i];
    if (result.status === "fulfilled" && result.value) {
      response[symbol] = {
        label,
        symbol,
        close: result.value.close,
        prevClose: result.value.prevClose,
        chgPct: result.value.chgPct,
        region,
      };
    }
  });

  return NextResponse.json(response);
}
