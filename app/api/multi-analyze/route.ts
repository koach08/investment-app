import { NextRequest, NextResponse } from "next/server";
import { analyzeWithAllEngines } from "@/lib/ai-engines";
import { ENGINE_CONFIG, type IntegratedResult, type SignalType } from "@/lib/types";

export async function POST(request: NextRequest) {
  const start = Date.now();

  try {
    const body = await request.json();
    const { ticker, signal, strategy, news, macroData } = body;

    if (!ticker || !signal) {
      return NextResponse.json({ error: "ticker and signal are required" }, { status: 400 });
    }

    // Run all 5 engines in parallel
    const engines = await analyzeWithAllEngines({
      ticker,
      signal,
      strategy: strategy || "中期",
      news,
      macroData,
    });

    // Calculate integrated result
    const successEngines = engines.filter((e) => e.status === "success" && e.score != null);

    let weightedSum = 0;
    let weightTotal = 0;
    const signalCounts: Record<string, number> = {};

    for (const e of successEngines) {
      const config = ENGINE_CONFIG[e.engine];
      const weight = config.weight;
      weightedSum += (e.score ?? 50) * weight;
      weightTotal += weight;

      const sig = e.signal ?? "NEUTRAL";
      signalCounts[sig] = (signalCounts[sig] || 0) + 1;
    }

    const avgScore = weightTotal > 0 ? weightedSum / weightTotal : 50;

    // Determine integrated signal
    let integratedSignal: SignalType;
    if (avgScore >= 65) integratedSignal = "BUY";
    else if (avgScore >= 55) integratedSignal = "WATCH_BUY";
    else if (avgScore <= 35) integratedSignal = "SELL";
    else if (avgScore <= 45) integratedSignal = "WATCH_SELL";
    else integratedSignal = "NEUTRAL";

    // Calculate consensus
    const maxSignalCount = Math.max(...Object.values(signalCounts), 0);
    const consensus = successEngines.length > 0 ? maxSignalCount / successEngines.length : 0;

    const integrated: IntegratedResult = {
      signal: integratedSignal,
      score: Math.round(avgScore),
      consensus,
      engineCount: successEngines.length,
    };

    return NextResponse.json({
      engines,
      integrated,
      consensus,
      duration: Date.now() - start,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Analysis failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
