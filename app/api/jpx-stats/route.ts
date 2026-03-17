import { NextResponse } from "next/server";

/**
 * JPX（日本取引所グループ）市場統計データ
 *
 * 個人投資家にとって特に重要な3つのデータ:
 * 1. 空売り比率 — 40%超は売り圧力大、底打ち近い可能性も
 * 2. 信用取引残高 — 買い残/売り残の比率で需給を判断
 * 3. 投資部門別売買動向 — 海外勢・個人・法人の売買方向
 *
 * これらは「誰が何をしているか」を知るためのデータで、
 * 機関投資家の動きに個人が巻き込まれないための防衛情報。
 */

interface JPXStats {
  shortSellingRatio: {
    date: string;
    totalRatio: number;           // 空売り比率（全体）%
    nakedShortRatio: number;      // 実空売り比率（ヘッジ除く）%
    trend: string;                // 上昇/下降/横ばい
    signal: string;               // 警戒レベル
  } | null;
  marginTrading: {
    date: string;
    buyBalance: number;           // 買い残（億円）
    sellBalance: number;          // 売り残（億円）
    ratio: number;                // 信用倍率（買い残/売り残）
    buyChange: number;            // 前週比（買い残）
    sellChange: number;           // 前週比（売り残）
    signal: string;               // 需給判断
  } | null;
  investorFlows: {
    date: string;
    foreigners: { net: number; buy: number; sell: number };
    individuals: { net: number; buy: number; sell: number };
    institutions: { net: number; buy: number; sell: number };
    signal: string;
  } | null;
  timestamp: string;
}

// Cache for 30 minutes
let cache: { data: JPXStats; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

async function fetchShortSellingRatio(): Promise<JPXStats["shortSellingRatio"]> {
  try {
    // JPX publishes short selling data at this endpoint
    const res = await fetch(
      "https://www.jpx.co.jp/markets/statistics-equities/short-selling/01.html",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept-Language": "ja,en;q=0.9",
        },
      }
    );
    if (!res.ok) return null;

    const html = await res.text();

    // Extract the most recent data row from the table
    // JPX tables typically have: date, total selling, short selling, ratio
    const ratioMatches = html.match(/(\d{1,2}\.\d{1,2})\s*%/g);
    const dateMatch = html.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);

    if (ratioMatches && ratioMatches.length >= 1 && dateMatch) {
      const totalRatio = parseFloat(ratioMatches[0]);
      const nakedShortRatio = ratioMatches.length >= 2 ? parseFloat(ratioMatches[1]) : totalRatio * 0.6;

      let signal = "通常";
      if (totalRatio >= 45) signal = "極端な売り圧力（底打ちシグナルの可能性）";
      else if (totalRatio >= 40) signal = "売り圧力高め（警戒）";
      else if (totalRatio <= 30) signal = "売り圧力低い（楽観的）";

      return {
        date: `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`,
        totalRatio,
        nakedShortRatio,
        trend: "N/A",
        signal,
      };
    }
  } catch { /* ignore */ }
  return null;
}

async function fetchMarginBalance(): Promise<JPXStats["marginTrading"]> {
  try {
    const res = await fetch(
      "https://www.jpx.co.jp/markets/statistics-equities/margin/01.html",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept-Language": "ja,en;q=0.9",
        },
      }
    );
    if (!res.ok) return null;

    const html = await res.text();

    // Extract margin trading balance data
    // Look for large numbers (in 百万円 or 億円)
    const numberMatches = html.match(/[\d,]+(?:\.\d+)?/g);
    const dateMatch = html.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);

    if (numberMatches && numberMatches.length >= 4 && dateMatch) {
      // Try to extract buy/sell balance
      const numbers = numberMatches
        .map((n) => parseFloat(n.replace(/,/g, "")))
        .filter((n) => n > 1000); // Filter for meaningful amounts

      if (numbers.length >= 2) {
        const buyBalance = numbers[0];
        const sellBalance = numbers[1];
        const ratio = sellBalance > 0 ? buyBalance / sellBalance : 0;

        let signal = "中立";
        if (ratio >= 5) signal = "買い残過多（将来の売り圧力に警戒）";
        else if (ratio >= 3) signal = "やや買い偏り";
        else if (ratio <= 1.5) signal = "売り残優位（ショートカバー期待）";

        return {
          date: `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`,
          buyBalance: Math.round(buyBalance / 100), // Convert to 億円 approximation
          sellBalance: Math.round(sellBalance / 100),
          ratio: Math.round(ratio * 100) / 100,
          buyChange: 0,
          sellChange: 0,
          signal,
        };
      }
    }
  } catch { /* ignore */ }
  return null;
}

async function fetchInvestorFlows(): Promise<JPXStats["investorFlows"]> {
  try {
    // JPX investor type trading data
    const res = await fetch(
      "https://www.jpx.co.jp/markets/statistics-equities/investor-type/01.html",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept-Language": "ja,en;q=0.9",
        },
      }
    );
    if (!res.ok) return null;

    const html = await res.text();
    const dateMatch = html.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);

    // Look for patterns of buy/sell data for different investor types
    // The page has tables with categories: 外国人, 個人, 法人, etc.
    const hasData = html.includes("外国人") || html.includes("海外投資家");

    if (hasData && dateMatch) {
      // Extract numbers near investor type labels
      const extractNetFlow = (label: string): { net: number; buy: number; sell: number } => {
        const idx = html.indexOf(label);
        if (idx === -1) return { net: 0, buy: 0, sell: 0 };
        const snippet = html.slice(idx, idx + 500);
        const nums = snippet.match(/-?[\d,]+/g);
        if (nums && nums.length >= 2) {
          const buy = parseFloat(nums[0].replace(/,/g, ""));
          const sell = parseFloat(nums[1].replace(/,/g, ""));
          return { net: buy - sell, buy, sell };
        }
        return { net: 0, buy: 0, sell: 0 };
      };

      const foreigners = extractNetFlow("外国人") || extractNetFlow("海外投資家");
      const individuals = extractNetFlow("個人");
      const institutions = extractNetFlow("法人");

      let signal = "データ取得中";
      if (foreigners.net > 0 && individuals.net < 0) {
        signal = "外国人買い・個人売り（機関に追従か）";
      } else if (foreigners.net < 0 && individuals.net > 0) {
        signal = "外国人売り・個人買い（個人が受け手に注意）";
      } else if (foreigners.net > 0) {
        signal = "外国人買い越し（海外勢のリスクオン）";
      } else if (foreigners.net < 0) {
        signal = "外国人売り越し（海外勢のリスクオフ）";
      }

      return {
        date: `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`,
        foreigners,
        individuals,
        institutions,
        signal,
      };
    }
  } catch { /* ignore */ }
  return null;
}

export async function GET() {
  // Return cache if fresh
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  // Fetch all three data sources in parallel
  const [shortSelling, marginTrading, investorFlows] = await Promise.all([
    fetchShortSellingRatio(),
    fetchMarginBalance(),
    fetchInvestorFlows(),
  ]);

  const data: JPXStats = {
    shortSellingRatio: shortSelling,
    marginTrading: marginTrading,
    investorFlows: investorFlows,
    timestamp: new Date().toISOString(),
  };

  cache = { data, ts: Date.now() };
  return NextResponse.json(data);
}
