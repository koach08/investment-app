/**
 * 月次トレンドシグナル (Meb Faber 型のタイミング判定)。
 *
 * ルール: 月末終値が N ヶ月単純移動平均を上回っていれば保有、下回れば現金。
 * 出典: Faber (2006) "A Quantitative Approach to Tactical Asset Allocation" (SSRN 962461)。
 * 狙いはリターンを増やすことではなく、最大下落を浅くして積立を続けられるようにすること。
 *
 * 設計上の約束:
 * - 判定は**確定した月末終値**だけで行う。進行中の月のバーは判定に使わない。
 *   (検証した設定と実際に執行される設定がずれる事故を避けるため。crypto-trader で 3 回踏んでいる)
 * - すべて純関数。now は引数で受け取ってテスト可能にする。
 * - バックテストと本番判定は同じ evaluateTrend() を通す。単一の出所。
 */

import type { OHLCVBar } from "./quant/types";

export const DEFAULT_SMA_MONTHS = 10;

/** 乗り換え 1 回あたりの往復コスト (%)。ETF の売買手数料 + スプレッドの控えめな見積もり。 */
export const DEFAULT_SWITCH_COST_PCT = 0.05;

export interface MonthlyBar {
  /** "YYYY-MM" */
  month: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** 月が終わっていない = 終値が未確定 */
  provisional: boolean;
}

export type TrendState = "invested" | "cash";

export interface TrendSignal {
  /** 確定月末ベースの判定。これが実際に従うべきシグナル */
  state: TrendState;
  /** 判定に使った確定月 "YYYY-MM" */
  asOf: string;
  close: number;
  sma: number | null;
  /** 終値が SMA から何 % 離れているか。プラスなら上 */
  gapPct: number | null;
  /** 現在の state になった月 "YYYY-MM"。判明しなければ null */
  changedAt: string | null;
  /** 現在の state が続いている月数 */
  monthsInState: number;
  /** 前月から state が変わったか。true のときだけ発注が要る */
  changedThisMonth: boolean;
  /** 進行中の月の値で仮に判定したらどうなるか。参考表示専用で、従ってはいけない */
  provisional: {
    month: string;
    close: number;
    sma: number | null;
    state: TrendState;
    /** 確定シグナルと食い違っているか */
    diverges: boolean;
  } | null;
}

export interface BacktestStats {
  /** 年率リターン (%) */
  cagr: number;
  /** 最大ドローダウン (%)。マイナス値 */
  maxDrawdown: number;
  /** 月次リターンの年率換算標準偏差 (%) */
  volatility: number;
  /** 無リスク金利ゼロと置いた Sharpe */
  sharpe: number;
  /** 期間全体の累積リターン (%) */
  totalReturn: number;
  months: number;
}

export interface BacktestResult {
  strategy: BacktestStats;
  buyHold: BacktestStats;
  /** 乗り換え回数 */
  switches: number;
  /** 現金でいた月数の割合 (%) */
  cashMonthsPct: number;
  from: string;
  to: string;
  switchCostPct: number;
  /** 現金でいる間に付けた年利 (%) */
  cashAnnualPct: number;
}

/* ------------------------------------------------------------------ */
/* 月足への集約                                                        */
/* ------------------------------------------------------------------ */

function monthKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * 日足を月足に集約する。最後の月が now と同じ月なら provisional = true。
 * Yahoo の interval=1mo を直接使わないのは、進行中の月が確定済みと見分けられないため。
 */
export function toMonthlyBars(bars: OHLCVBar[], now: number): MonthlyBar[] {
  const byMonth = new Map<string, OHLCVBar[]>();
  for (const bar of bars) {
    const key = monthKey(bar.timestamp);
    const list = byMonth.get(key);
    if (list) list.push(bar);
    else byMonth.set(key, [bar]);
  }

  const currentMonth = monthKey(now);
  const months = Array.from(byMonth.keys()).sort();

  return months.map((month) => {
    const group = byMonth.get(month)!;
    return {
      month,
      open: group[0].open,
      high: Math.max(...group.map((b) => b.high)),
      low: Math.min(...group.map((b) => b.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((a, b) => a + b.volume, 0),
      provisional: month >= currentMonth,
    };
  });
}

/**
 * 月が飛んでいないかを調べる。返るのは欠けている月のリスト。
 *
 * Yahoo は range=max を指定すると interval=1d を無視して四半期足を返す。
 * それを月足に集約すると 1 四半期が 1 ヶ月として並び、月次リターンの連鎖も
 * 年率換算も壊れる (S&P500 の年率が +29% になった)。
 * 「取れたつもりの粒度」と「実際に返ってきた粒度」がずれる事故なので、
 * 数字を出す前に必ずここを通す。
 */
export function findMonthGaps(monthly: MonthlyBar[]): string[] {
  const gaps: string[] = [];
  for (let i = 1; i < monthly.length; i++) {
    const [py, pm] = monthly[i - 1].month.split("-").map(Number);
    const [cy, cm] = monthly[i].month.split("-").map(Number);
    let y = py;
    let m = pm + 1;
    if (m > 12) { m = 1; y++; }
    while (y < cy || (y === cy && m < cm)) {
      gaps.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) { m = 1; y++; }
      if (gaps.length > 5000) return gaps; // 壊れた系列で無限に伸ばさない
    }
  }
  return gaps;
}

/* ------------------------------------------------------------------ */
/* 判定                                                                */
/* ------------------------------------------------------------------ */

function smaAt(closes: number[], index: number, period: number): number | null {
  if (index < period - 1) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) sum += closes[i];
  return sum / period;
}

/** 各月の state を先頭から並べる。SMA が出せない月は null。 */
function stateSeries(bars: MonthlyBar[], period: number): (TrendState | null)[] {
  const closes = bars.map((b) => b.close);
  return bars.map((_, i) => {
    const s = smaAt(closes, i, period);
    if (s == null) return null;
    return closes[i] > s ? "invested" : "cash";
  });
}

/**
 * 確定した月末終値だけを使って現在のシグナルを出す。
 * 進行中の月は provisional として別枠で返す。従うのは state の方。
 */
export function evaluateTrend(
  monthly: MonthlyBar[],
  period = DEFAULT_SMA_MONTHS
): TrendSignal | null {
  const settled = monthly.filter((b) => !b.provisional);
  if (settled.length < period) return null;

  const states = stateSeries(settled, period);
  const lastIndex = settled.length - 1;
  const state = states[lastIndex];
  if (state == null) return null;

  const closes = settled.map((b) => b.close);
  const sma = smaAt(closes, lastIndex, period);

  // 何月からこの state が続いているか
  let changedAt: string | null = null;
  let monthsInState = 1;
  for (let i = lastIndex - 1; i >= 0; i--) {
    if (states[i] !== state) {
      changedAt = settled[i + 1].month;
      break;
    }
    if (states[i] == null) break;
    monthsInState++;
  }
  if (changedAt == null && monthsInState === settled.length) {
    // 全期間ずっと同じ state。開始月を起点として扱う
    changedAt = settled.find((_, i) => states[i] != null)?.month ?? null;
  }

  const openBar = monthly.find((b) => b.provisional);
  let provisional: TrendSignal["provisional"] = null;
  if (openBar) {
    // 進行中の月の終値を暫定値として SMA を引き直す
    const withOpen = [...closes, openBar.close];
    const pSma = smaAt(withOpen, withOpen.length - 1, period);
    const pState: TrendState = pSma != null && openBar.close > pSma ? "invested" : "cash";
    provisional = {
      month: openBar.month,
      close: openBar.close,
      sma: pSma,
      state: pState,
      diverges: pState !== state,
    };
  }

  return {
    state,
    asOf: settled[lastIndex].month,
    close: closes[lastIndex],
    sma,
    gapPct: sma != null ? ((closes[lastIndex] - sma) / sma) * 100 : null,
    changedAt,
    monthsInState,
    changedThisMonth: changedAt === settled[lastIndex].month,
    provisional,
  };
}

/* ------------------------------------------------------------------ */
/* バックテスト                                                        */
/* ------------------------------------------------------------------ */

function statsFromEquity(equity: number[]): BacktestStats {
  const months = equity.length - 1;
  if (months < 1) {
    return { cagr: 0, maxDrawdown: 0, volatility: 0, sharpe: 0, totalReturn: 0, months: 0 };
  }

  const totalReturn = (equity[equity.length - 1] / equity[0] - 1) * 100;
  const cagr = (Math.pow(equity[equity.length - 1] / equity[0], 12 / months) - 1) * 100;

  let peak = equity[0];
  let maxDrawdown = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    const dd = (v / peak - 1) * 100;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) rets.push(equity[i] / equity[i - 1] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(12) * 100;
  const sharpe = volatility === 0 ? 0 : (cagr / volatility) * 1;

  return { cagr, maxDrawdown, volatility, sharpe, totalReturn, months };
}

/**
 * Faber ルールを月足で回す。
 * 月 t の終値で判定し、その判定を月 t+1 のリターンに適用する (先読みしない)。
 */
export function backtestTrend(
  monthly: MonthlyBar[],
  period = DEFAULT_SMA_MONTHS,
  switchCostPct = DEFAULT_SWITCH_COST_PCT,
  /**
   * 現金でいる間に付く年利 (%)。0 にすると現金が無利息という前提になり、
   * 戦略側が実力より低く出る。MMF や個人向け国債を置く想定なら 2 前後。
   */
  cashAnnualPct = 0
): BacktestResult | null {
  const settled = monthly.filter((b) => !b.provisional);
  if (settled.length < period + 2) return null;

  const states = stateSeries(settled, period);

  let stratEquity = 1;
  let holdEquity = 1;
  const stratSeries: number[] = [];
  const holdSeries: number[] = [];
  let switches = 0;
  let cashMonths = 0;
  let prevState: TrendState | null = null;
  let started = false;

  for (let i = period; i < settled.length; i++) {
    const decision = states[i - 1]; // 前月末の判定に従って今月を過ごす
    if (decision == null) continue;

    if (!started) {
      started = true;
      stratSeries.push(stratEquity);
      holdSeries.push(holdEquity);
    }

    const monthReturn = settled[i].close / settled[i - 1].close - 1;
    holdEquity *= 1 + monthReturn;

    if (decision === "invested") {
      stratEquity *= 1 + monthReturn;
    } else {
      stratEquity *= 1 + cashAnnualPct / 100 / 12;
      cashMonths++;
    }

    if (prevState != null && decision !== prevState) {
      switches++;
      stratEquity *= 1 - switchCostPct / 100;
    }
    prevState = decision;

    stratSeries.push(stratEquity);
    holdSeries.push(holdEquity);
  }

  if (stratSeries.length < 2) return null;

  return {
    strategy: statsFromEquity(stratSeries),
    buyHold: statsFromEquity(holdSeries),
    switches,
    cashMonthsPct: (cashMonths / (stratSeries.length - 1)) * 100,
    from: settled[period].month,
    to: settled[settled.length - 1].month,
    switchCostPct,
    cashAnnualPct,
  };
}

/**
 * 月足を円建てに直す。為替は**月ごとの実系列**で掛ける。
 *
 * 定数レートを全期間に掛けてはいけない。定数倍は終値と SMA の上下関係を変えないので、
 * 円建てシグナルがドル建てと必ず一致し、為替を見ている意味が消える。
 * (最初この形で実装して、円建て判定が常にドル建てと同一になった)
 *
 * 為替が無い月は落とす。0 円や直近レートで埋めない。
 */
export function toJpyMonthly(
  monthly: MonthlyBar[],
  fxMonthly: MonthlyBar[] | null
): MonthlyBar[] | null {
  if (!fxMonthly || fxMonthly.length === 0) return null;

  const rate = new Map<string, number>();
  for (const f of fxMonthly) {
    if (Number.isFinite(f.close) && f.close > 0) rate.set(f.month, f.close);
  }

  const out: MonthlyBar[] = [];
  for (const b of monthly) {
    const r = rate.get(b.month);
    if (r == null) continue;
    out.push({
      ...b,
      open: b.open * r,
      high: b.high * r,
      low: b.low * r,
      close: b.close * r,
    });
  }
  return out.length > 0 ? out : null;
}

export interface PeriodResult {
  label: string;
  from: string;
  to: string;
  result: BacktestResult | null;
}

/**
 * 期間を区切って並べる。1 期間で勝っただけの結果を採用しないため。
 * splits は ["2007-01", "2014-01", ...] のような月の境界。
 */
export function backtestByPeriods(
  monthly: MonthlyBar[],
  splits: string[],
  period = DEFAULT_SMA_MONTHS,
  switchCostPct = DEFAULT_SWITCH_COST_PCT,
  cashAnnualPct = 0
): PeriodResult[] {
  const out: PeriodResult[] = [];
  for (let i = 0; i < splits.length - 1; i++) {
    const from = splits[i];
    const to = splits[i + 1];
    // SMA の助走ぶんを手前から確保する
    const startIndex = monthly.findIndex((b) => b.month >= from);
    if (startIndex < 0) continue;
    const warmup = Math.max(0, startIndex - period);
    const slice = monthly.filter(
      (b, idx) => idx >= warmup && b.month < to
    );
    out.push({
      label: `${from.slice(0, 4)}〜${to.slice(0, 4)}`,
      from,
      to,
      result: backtestTrend(slice, period, switchCostPct, cashAnnualPct),
    });
  }
  return out;
}
