import { NextRequest, NextResponse } from "next/server";
import { fetchYahooBars } from "@/lib/quant/yahoo-fetch";
import { detectRegime } from "@/lib/quant/regime";

const PRESETS: Record<string, string> = {
  nikkei: "^N225",
  topix: "^TOPX",
  sp500: "^GSPC",
  nasdaq: "^IXIC",
  dow: "^DJI",
};

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker") ?? "^N225";
  const resolved = PRESETS[ticker.toLowerCase()] ?? ticker;
  const range = req.nextUrl.searchParams.get("range") ?? "1y";

  try {
    const data = await fetchYahooBars(resolved, range, "1d");
    const regime = detectRegime(data.bars);
    return NextResponse.json({
      ticker: resolved,
      name: data.name,
      currency: data.currency,
      lastClose: data.bars[data.bars.length - 1]?.close,
      regime,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
