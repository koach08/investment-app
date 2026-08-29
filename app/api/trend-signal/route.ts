import { NextResponse } from "next/server";
import { fetchYahooBars } from "@/lib/quant/yahoo-fetch";
import {
  toMonthlyBars,
  evaluateTrend,
  backtestTrend,
  toJpyMonthly,
  backtestByPeriods,
  findMonthGaps,
  DEFAULT_SMA_MONTHS,
  DEFAULT_SWITCH_COST_PCT,
  type TrendSignal,
  type BacktestResult,
  type MonthlyBar,
  type PeriodResult,
} from "@/lib/trend-signal";

// 月次判定なので鮮度は要らない。1時間キャッシュ。
export const revalidate = 3600;

interface Target {
  ticker: string;
  label: string;
  note: string;
}

const TARGETS: Target[] = [
  { ticker: "VTI", label: "VTI", note: "米国株式全体" },
  { ticker: "VOO", label: "VOO", note: "S&P500" },
  { ticker: "VT", label: "VT", note: "全世界株式" },
];

interface TargetResult {
  ticker: string;
  label: string;
  note: string;
  name: string;
  currency: string;
  usd: { signal: TrendSignal; backtest: BacktestResult | null } | null;
  /** 円建て。為替が取れなければ null で、0 円扱いにはしない */
  jpy: { signal: TrendSignal; backtest: BacktestResult | null } | null;
  /** ドル建ての期間別。1 期間で勝っただけの結果を採用しないため */
  periods: PeriodResult[];
  /** 月が飛んでいたら数と最初の欠けを出す。0 でなければ数字を信用しない */
  gapCount: number;
  firstGap: string | null;
  error?: string;
}

/** 危機の入り方が違う区間で切る。境界は相場の局面で決め打ちする */
const PERIOD_SPLITS = ["2007-01", "2013-01", "2020-01", "2023-01", "2030-01"];

/** USD/JPY の月足系列。円建て判定は定数レートではなくこれを掛ける */
async function fetchUsdJpyMonthly(now: number): Promise<MonthlyBar[] | null> {
  try {
    const r = await fetchYahooBars("JPY=X", "50y", "1d");
    return toMonthlyBars(r.bars, now);
  } catch {
    return null;
  }
}

async function evaluateTarget(
  target: Target,
  fxMonthly: MonthlyBar[] | null,
  period: number,
  cost: number,
  cash: number,
  now: number
): Promise<TargetResult> {
  const base: TargetResult = {
    ticker: target.ticker,
    label: target.label,
    note: target.note,
    name: target.ticker,
    currency: "USD",
    usd: null,
    jpy: null,
    periods: [],
    gapCount: 0,
    firstGap: null,
  };

  try {
    // 長期の日足から月足を組む。Yahoo の interval=1mo は進行中の月を確定済みと
    // 見分けられないので使わない。range=max も interval=1d を無視して四半期足を返すので使わない。
    // 配当込み(adjclose)で取る。落とすと buy&hold 側が不当に低く出て、戦略が実力以上に見える
    const res = await fetchYahooBars(target.ticker, "50y", "1d", true);
    const monthly = toMonthlyBars(res.bars, now);

    // Yahoo は range によっては interval=1d を無視して粗い足を返す。
    // 月が飛んだまま集計すると年率が壊れるので、数字を出す前に確かめる
    const gaps = findMonthGaps(monthly);

    const usdSignal = evaluateTrend(monthly, period);
    const jpyMonthly = toJpyMonthly(monthly, fxMonthly);
    const jpySignal = jpyMonthly ? evaluateTrend(jpyMonthly, period) : null;

    return {
      ...base,
      name: res.name,
      currency: res.currency,
      usd: usdSignal ? { signal: usdSignal, backtest: backtestTrend(monthly, period, cost, cash) } : null,
      jpy:
        jpySignal && jpyMonthly
          ? { signal: jpySignal, backtest: backtestTrend(jpyMonthly, period, cost, cash) }
          : null,
      periods: backtestByPeriods(monthly, PERIOD_SPLITS, period, cost, cash).filter((p) => p.result),
      gapCount: gaps.length,
      firstGap: gaps[0] ?? null,
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = Number(searchParams.get("period") ?? DEFAULT_SMA_MONTHS);
  const cost = Number(searchParams.get("cost") ?? DEFAULT_SWITCH_COST_PCT);
  // 現金でいる間の金利。0 にすると現金が無利息の前提になり戦略側が実力より低く出る
  const cash = Number(searchParams.get("cash") ?? 2);
  const tickersParam = searchParams.get("tickers");

  const targets = tickersParam
    ? tickersParam
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
        .map((t) => TARGETS.find((x) => x.ticker === t) ?? { ticker: t, label: t, note: "" })
    : TARGETS;

  if (!Number.isFinite(period) || period < 2 || period > 36) {
    return NextResponse.json({ error: "period は 2〜36 の範囲で指定してください" }, { status: 400 });
  }

  const now = Date.now();
  const fxMonthly = await fetchUsdJpyMonthly(now);
  const usdJpy = fxMonthly?.[fxMonthly.length - 1]?.close ?? null;
  const results = await Promise.all(
    targets.map((t) => evaluateTarget(t, fxMonthly, period, cost, cash, now))
  );

  // 発注が要るのは、確定シグナルが今月変わったものだけ
  const actionNeeded = results
    .filter((r) => r.usd?.signal.changedThisMonth)
    .map((r) => ({
      ticker: r.ticker,
      state: r.usd!.signal.state,
      asOf: r.usd!.signal.asOf,
    }));

  return NextResponse.json({
    period,
    switchCostPct: cost,
    cashAnnualPct: cash,
    usdJpy,
    asOf: results.find((r) => r.usd)?.usd?.signal.asOf ?? null,
    actionNeeded,
    results,
    fetchedAt: new Date(now).toISOString(),
  });
}
