import { NextRequest, NextResponse } from "next/server";
import { runQuantAnalysis } from "@/lib/quant/signals";
import { detectRegime } from "@/lib/quant/regime";
import { calculateFinalDecision } from "@/lib/quant/scoring-engine";
import { buildStrategies } from "@/lib/quant/strategy";
import { fetchYahooBars } from "@/lib/quant/yahoo-fetch";
import { saveAudit } from "@/lib/quant/audit-log";
import { assessInstitutionalRisk } from "@/lib/quant/risk-engine";

const NIKKEI_TICKER = "^N225";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ticker: string = body.ticker;
    const isHolding: boolean = !!body.isHolding;
    const avgPrice: number | undefined = body.avgPrice;
    const pnlPercent: number | undefined = body.pnlPercent;
    const persist: boolean = body.persist !== false;

    if (!ticker) {
      return NextResponse.json({ error: "ticker is required" }, { status: 400 });
    }

    const [tickerData, nikkeiData] = await Promise.all([
      fetchYahooBars(ticker, "1y", "1d"),
      fetchYahooBars(NIKKEI_TICKER, "1y", "1d").catch(() => null),
    ]);

    if (tickerData.bars.length < 30) {
      return NextResponse.json(
        { error: `データ不足: ${tickerData.bars.length} 本` },
        { status: 400 }
      );
    }

    const analysis = runQuantAnalysis(tickerData.bars, {
      ticker,
      name: tickerData.name,
    });
    const tickerRegime = detectRegime(tickerData.bars);
    const marketRegime = nikkeiData ? detectRegime(nikkeiData.bars) : tickerRegime;

    const decision = calculateFinalDecision({
      ticker,
      price: analysis.price,
      quantAnalysis: analysis,
      regime: tickerRegime,
    });
    const risk = assessInstitutionalRisk({
      bars: tickerData.bars,
      action: decision.action,
      regime: tickerRegime.regime,
      confidence: decision.confidence,
    });

    const strategies = buildStrategies({
      bars: tickerData.bars,
      analysis,
      regime: tickerRegime,
      isHolding,
      avgPrice,
      pnlPercent,
    });

    let auditId: string | undefined;
    if (persist) {
      const saved = await saveAudit({
        ticker,
        name: tickerData.name,
        price: analysis.price,
        decision,
        regime: tickerRegime,
        quantSignals: analysis.signals,
        strategies,
      });
      auditId = saved.id;
    }

    return NextResponse.json({
      ticker,
      name: tickerData.name,
      currency: tickerData.currency,
      analysis,
      tickerRegime,
      marketRegime,
      decision,
      risk,
      strategies,
      auditId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
