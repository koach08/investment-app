import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { runQuantAnalysis } from "@/lib/quant/signals";
import { detectRegime } from "@/lib/quant/regime";
import { calculateFinalDecision, type ScoringResult } from "@/lib/quant/scoring-engine";
import { buildStrategies } from "@/lib/quant/strategy";
import { fetchYahooBars } from "@/lib/quant/yahoo-fetch";
import { summarizePortfolio } from "@/lib/quant/portfolio-summary";
import type { QuantAnalysis, RegimeAnalysis, StrategyProposal, PortfolioSummary } from "@/lib/quant/types";

interface Holding {
  code: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  pnlPercent: number;
  category: string;
  currency: string;
}

export interface PortfolioRow {
  code: string;
  name: string;
  category: string;
  currency: string;
  quantity: number;
  avgPrice: number;
  pnlPercent: number;
  marketValue: number;
  analysis?: QuantAnalysis;
  regime?: RegimeAnalysis;
  decision?: ScoringResult;
  strategies?: StrategyProposal[];
  error?: string;
}

async function loadHoldings(req: NextRequest): Promise<Holding[]> {
  // Allow client to POST holdings (from localStorage). Otherwise read default file.
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (Array.isArray(body?.holdings)) return body.holdings;
    } catch {
      /* fallthrough */
    }
  }
  const file = path.join(process.cwd(), "data", "holdings.json");
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

async function analyzeRow(h: Holding): Promise<PortfolioRow> {
  const base: PortfolioRow = {
    code: h.code,
    name: h.name,
    category: h.category,
    currency: h.currency,
    quantity: h.quantity,
    avgPrice: h.avgPrice,
    pnlPercent: h.pnlPercent,
    marketValue: h.marketValue,
  };

  if (!h.code) {
    return { ...base, error: "ticker未設定" };
  }

  try {
    const data = await fetchYahooBars(h.code, "1y", "1d");
    if (data.bars.length < 30) {
      return { ...base, error: `データ不足 (${data.bars.length}本)` };
    }
    const analysis = runQuantAnalysis(data.bars, { ticker: h.code, name: h.name });
    const regime = detectRegime(data.bars);
    const decision = calculateFinalDecision({
      ticker: h.code,
      price: analysis.price,
      quantAnalysis: analysis,
      regime,
    });
    const strategies = buildStrategies({
      bars: data.bars,
      analysis,
      regime,
      isHolding: true,
      avgPrice: h.avgPrice,
      pnlPercent: h.pnlPercent,
    });

    return {
      ...base,
      analysis,
      regime,
      decision,
      strategies,
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "unknown" };
  }
}

async function handle(req: NextRequest) {
  try {
    const holdings = await loadHoldings(req);
    const targets = holdings.filter(
      (h) => h.code && (h.currency === "JPY" || /\.T$/.test(h.code) || !!h.code.match(/^[A-Z]{1,5}$/))
    );

    const rows: PortfolioRow[] = [];
    for (let i = 0; i < targets.length; i += 4) {
      const batch = targets.slice(i, i + 4);
      const results = await Promise.all(batch.map(analyzeRow));
      rows.push(...results);
    }

    rows.sort((a, b) => {
      const sa = a.decision?.compositeScore ?? 0;
      const sb = b.decision?.compositeScore ?? 0;
      return Math.abs(sb) - Math.abs(sa);
    });

    const summary: PortfolioSummary = summarizePortfolio(rows);

    return NextResponse.json({ rows, summary, analyzedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
