import { NextResponse } from "next/server";
import { fetchYahooBars } from "@/lib/quant/yahoo-fetch";
import { toMonthlyBars, findMonthGaps } from "@/lib/trend-signal";
import {
  lumpSumReturn,
  dcaReturn,
  monthsBetween,
  isTooShort,
  type PeriodReturn,
} from "@/lib/benchmark";

export const revalidate = 3600;

const BENCHMARKS = [
  { ticker: "VT", label: "全世界株式" },
  { ticker: "^SP500TR", label: "S&P500 (配当込み)" },
  { ticker: "VTI", label: "米国株式全体" },
];

interface BenchmarkResult {
  ticker: string;
  label: string;
  lumpSum: PeriodReturn | null;
  dca: PeriodReturn | null;
  gapCount: number;
  error?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from"); // "YYYY-MM"
  const to = searchParams.get("to") ?? "9999-12";

  if (!from || !/^\d{4}-\d{2}$/.test(from)) {
    return NextResponse.json(
      { error: "from を YYYY-MM 形式で指定してください（投資を始めた月）" },
      { status: 400 }
    );
  }

  const now = Date.now();
  const results = await Promise.all(
    BENCHMARKS.map(async (b): Promise<BenchmarkResult> => {
      try {
        // 配当込み。落とすとインデックス側が不当に低く出て、自分の成績が良く見える
        const r = await fetchYahooBars(b.ticker, "50y", "1d", true);
        const monthly = toMonthlyBars(r.bars, now);
        const gaps = findMonthGaps(monthly.filter((x) => !x.provisional));
        return {
          ticker: b.ticker,
          label: b.label,
          lumpSum: lumpSumReturn(monthly, from, to),
          dca: dcaReturn(monthly, from, to),
          gapCount: gaps.length,
        };
      } catch (e) {
        return {
          ticker: b.ticker,
          label: b.label,
          lumpSum: null,
          dca: null,
          gapCount: 0,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    })
  );

  const actualTo = results.find((r) => r.lumpSum)?.lumpSum?.to ?? null;
  const months = actualTo ? monthsBetween(from, actualTo) : 0;

  return NextResponse.json({
    from,
    to: actualTo,
    months,
    tooShort: isTooShort(months),
    results,
    fetchedAt: new Date(now).toISOString(),
  });
}
