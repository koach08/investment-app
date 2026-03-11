import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  const period = request.nextUrl.searchParams.get("period") || "6mo";

  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const periodMap: Record<string, { range: string; interval: string }> = {
    "1mo": { range: "1mo", interval: "1d" },
    "3mo": { range: "3mo", interval: "1d" },
    "6mo": { range: "6mo", interval: "1d" },
    "1y": { range: "1y", interval: "1d" },
    "5y": { range: "5y", interval: "1wk" },
  };

  const { range, interval } = periodMap[period] || periodMap["6mo"];

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Yahoo Finance returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) {
      return NextResponse.json({ error: "No data found" }, { status: 404 });
    }

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const meta = result.meta || {};

    const prices = timestamps.map((t: number, i: number) => ({
      date: new Date(t * 1000).toISOString().split("T")[0],
      open: quote.open?.[i] ?? null,
      high: quote.high?.[i] ?? null,
      low: quote.low?.[i] ?? null,
      close: quote.close?.[i] ?? null,
      volume: quote.volume?.[i] ?? null,
    })).filter((p: { close: number | null }) => p.close !== null);

    return NextResponse.json({
      ticker,
      currency: meta.currency || "JPY",
      name: meta.shortName || meta.symbol || ticker,
      exchange: meta.exchangeName || "",
      prices,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to fetch: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
