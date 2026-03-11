import { NextResponse } from "next/server";

/**
 * 地政学リスクAPI — GDELT DOC 2.0 + GKG
 *
 * 金融業界で使われるリスクモニタリングに近い仕組み:
 * - GDELT: 世界最大のオープン地政学DB（15分更新）
 * - 紛争、制裁、軍事行動、経済危機をリアルタイム検知
 * - WorldMonitor.app も内部でGDELTを使用
 *
 * Bloomberg Geopolitical Risk Indicator の簡易版として機能
 */

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  socialimage?: string;
  domain: string;
  language: string;
  sourcecountry?: string;
  tone?: number;
}

interface GeopoliticalEvent {
  category: string;
  title: string;
  source: string;
  date: string;
  tone: number;
  url: string;
  region?: string;
}

interface RiskCategory {
  name: string;
  query: string;
  weight: number;
}

// 投資に最も影響する6カテゴリに絞る（GDELT rate limit対策）
const RISK_CATEGORIES: RiskCategory[] = [
  { name: "military_conflict", query: "military conflict war", weight: 3.0 },
  { name: "sanctions_trade", query: "sanctions tariff trade war", weight: 2.5 },
  { name: "nuclear_threat", query: "nuclear missile threat", weight: 3.0 },
  { name: "energy_supply", query: "oil OPEC energy crisis", weight: 2.0 },
  { name: "financial_crisis", query: "financial crisis default", weight: 2.5 },
  { name: "supply_chain", query: "supply chain semiconductor", weight: 2.0 },
];

async function fetchGdeltArticles(query: string, maxRecords = 15): Promise<GdeltArticle[]> {
  // GDELT DOC 2.0: スペース=AND, OR演算子でOR検索
  const encodedQuery = encodeURIComponent(query);
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodedQuery}&mode=artlist&maxrecords=${maxRecords}&format=json&sort=datedesc&timespan=3d&sourcelang=eng`;

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } }); // 30min cache
    if (!res.ok) return [];
    const data = await res.json();
    return data.articles || [];
  } catch {
    return [];
  }
}

// artlistモードではtoneが返らないため、記事数ベースでリスクを評価
// 記事が多い＝世界的に注目されている＝リスクが高い

export async function GET() {
  try {
    // Fetch categories in batches of 2 (GDELT rate limit: 1 req per 5 sec)
    const categoryResults = [];
    for (let i = 0; i < RISK_CATEGORIES.length; i += 3) {
      const batch = RISK_CATEGORIES.slice(i, i + 3);
      const batchResults = await Promise.all(batch.map(async (cat) => {
        const articles = await fetchGdeltArticles(cat.query, 10);
        const events: GeopoliticalEvent[] = articles.slice(0, 5).map((a) => ({
          category: cat.name,
          title: a.title,
          source: a.domain,
          date: a.seendate,
          tone: 0,
          url: a.url,
          region: a.sourcecountry,
        }));

        // 記事数ベースのリスク: 10件中何件ヒットしたか × カテゴリ重み
        const riskContribution = (articles.length / 10) * cat.weight * 10;

        return {
          category: cat.name,
          articleCount: articles.length,
          weight: cat.weight,
          riskContribution,
          topEvents: events,
        };
      }));
      categoryResults.push(...batchResults);
      // GDELT rate limit: wait between batches
      if (i + 3 < RISK_CATEGORIES.length) {
        await new Promise((r) => setTimeout(r, 5500));
      }
    }

    // Calculate composite risk score (0-100)
    const totalWeightedRisk = categoryResults.reduce((sum, c) => sum + c.riskContribution, 0);
    const maxPossibleRisk = RISK_CATEGORIES.reduce((sum, c) => sum + c.weight * 10, 0);
    const riskScore = Math.min(100, Math.round((totalWeightedRisk / maxPossibleRisk) * 100));

    // Determine risk level
    let riskLevel: string;
    if (riskScore >= 70) riskLevel = "CRITICAL";
    else if (riskScore >= 50) riskLevel = "HIGH";
    else if (riskScore >= 30) riskLevel = "ELEVATED";
    else if (riskScore >= 15) riskLevel = "MODERATE";
    else riskLevel = "LOW";

    // Get top risk events across all categories
    const allEvents = categoryResults
      .flatMap((c) => c.topEvents)
      .sort((a, b) => a.tone - b.tone) // most negative first
      .slice(0, 15);

    // Hot spots - categories with highest risk
    const hotSpots = categoryResults
      .filter((c) => c.riskContribution > 0)
      .sort((a, b) => b.riskContribution - a.riskContribution)
      .slice(0, 5)
      .map((c) => ({
        category: c.category,
        severity: c.riskContribution > 15 ? "HIGH" : c.riskContribution > 8 ? "MEDIUM" : "LOW",
        articleCount: c.articleCount,
      }));

    // Market impact summary — categories with high article count
    const marketImpactCategories = categoryResults
      .filter((c) => c.articleCount >= 5)
      .map((c) => c.category);

    return NextResponse.json({
      riskScore,
      riskLevel,
      hotSpots,
      topEvents: allEvents,
      marketImpactCategories,
      categoryBreakdown: categoryResults.map((c) => ({
        category: c.category,
        articleCount: c.articleCount,
        riskContribution: Math.round(c.riskContribution * 100) / 100,
      })),
      timestamp: new Date().toISOString(),
      source: "GDELT DOC 2.0 API",
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Geopolitical risk fetch failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
