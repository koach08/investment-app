import { NextResponse } from "next/server";

/**
 * CNN Fear & Greed Index — 7つの市場指標の複合センチメント
 *
 * 機関投資家が見ているのと同じ「群衆心理の温度計」。
 * 0 = Extreme Fear（恐怖の極み → 買いチャンス?）
 * 100 = Extreme Greed（強欲の極み → 危険信号?）
 *
 * Components: Stock Price Momentum, Stock Price Strength, Stock Price Breadth,
 *             Put/Call Ratio, Market Volatility (VIX), Safe Haven Demand, Junk Bond Demand
 */

interface FearGreedData {
  score: number;
  rating: string;
  timestamp: string;
  previousClose: number;
  oneWeekAgo: number;
  oneMonthAgo: number;
  oneYearAgo: number;
  components?: {
    name: string;
    score: number;
    rating: string;
  }[];
}

// Cache for 15 minutes
let cache: { data: FearGreedData; ts: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000;

function ratingFromScore(score: number): string {
  if (score <= 25) return "Extreme Fear";
  if (score <= 45) return "Fear";
  if (score <= 55) return "Neutral";
  if (score <= 75) return "Greed";
  return "Extreme Greed";
}

function ratingJa(rating: string): string {
  switch (rating) {
    case "Extreme Fear": return "極度の恐怖";
    case "Fear": return "恐怖";
    case "Neutral": return "中立";
    case "Greed": return "強欲";
    case "Extreme Greed": return "極度の強欲";
    default: return rating;
  }
}

export async function GET() {
  // Return cache if fresh
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    // CNN Fear & Greed API endpoint
    const res = await fetch(
      "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
        },
        next: { revalidate: 900 },
      }
    );

    if (!res.ok) {
      throw new Error(`CNN API returned ${res.status}`);
    }

    const raw = await res.json();
    const fg = raw?.fear_and_greed;

    if (!fg) {
      throw new Error("No fear_and_greed data in response");
    }

    const data: FearGreedData = {
      score: Math.round(fg.score ?? 50),
      rating: ratingJa(fg.rating ?? ratingFromScore(fg.score ?? 50)),
      timestamp: fg.timestamp ? new Date(fg.timestamp).toISOString() : new Date().toISOString(),
      previousClose: Math.round(fg.previous_close ?? fg.score ?? 50),
      oneWeekAgo: Math.round(fg.previous_1_week ?? fg.score ?? 50),
      oneMonthAgo: Math.round(fg.previous_1_month ?? fg.score ?? 50),
      oneYearAgo: Math.round(fg.previous_1_year ?? fg.score ?? 50),
    };

    // Try to extract component data
    const componentKeys = [
      { key: "stock_price_momentum", name: "株価モメンタム" },
      { key: "stock_price_strength", name: "株価強度" },
      { key: "stock_price_breadth", name: "株価ブレッドス" },
      { key: "put_call_options", name: "プット/コール比率" },
      { key: "market_volatility", name: "市場ボラティリティ(VIX)" },
      { key: "safe_haven_demand", name: "安全資産需要" },
      { key: "junk_bond_demand", name: "ジャンクボンド需要" },
    ];

    const components: FearGreedData["components"] = [];
    for (const { key, name } of componentKeys) {
      const comp = raw?.[key];
      if (comp && comp.score !== undefined) {
        components.push({
          name,
          score: Math.round(comp.score),
          rating: ratingJa(comp.rating ?? ratingFromScore(comp.score)),
        });
      }
    }
    if (components.length > 0) {
      data.components = components;
    }

    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (e) {
    // Fallback: try Alternative.me Fear & Greed Index (crypto-focused but correlated)
    try {
      const altRes = await fetch("https://api.alternative.me/fng/?limit=2&format=json");
      if (altRes.ok) {
        const altData = await altRes.json();
        const current = altData?.data?.[0];
        const prev = altData?.data?.[1];
        if (current) {
          const score = parseInt(current.value, 10);
          const data: FearGreedData = {
            score,
            rating: ratingJa(ratingFromScore(score)),
            timestamp: new Date(parseInt(current.timestamp, 10) * 1000).toISOString(),
            previousClose: prev ? parseInt(prev.value, 10) : score,
            oneWeekAgo: score,
            oneMonthAgo: score,
            oneYearAgo: score,
          };
          cache = { data, ts: Date.now() };
          return NextResponse.json({ ...data, source: "alternative.me (crypto proxy)" });
        }
      }
    } catch { /* ignore fallback error */ }

    return NextResponse.json(
      { error: `Fear & Greed Index fetch failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
