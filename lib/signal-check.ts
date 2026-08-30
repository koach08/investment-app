/**
 * 月次トレンドシグナルの状態を毎日確認する。
 *
 * シグナルが変わるのは年に0〜3回しかない。画面を開いて確かめる運用だと、
 * 変わった月を見落とす。毎朝のブリーフと一緒に判定して、変わったときだけ
 * 目立たせる。判定そのものは evaluateTrend（画面と同じ純関数）を通す。
 *
 * LLM は使わないので、追加のコストはほぼゼロ。
 */
import { fetchYahooBars } from "./quant/yahoo-fetch";
import { toMonthlyBars, evaluateTrend, findMonthGaps, DEFAULT_SMA_MONTHS } from "./trend-signal";
import { TREND_TARGETS } from "./trend-targets";

export interface SignalSnapshot {
  ticker: string;
  label: string;
  state: "invested" | "cash" | null;
  asOf: string | null;
  gapPct: number | null;
  monthsInState: number | null;
  /** 確定した月末の判定が今月変わったか。true のときだけ発注が要る */
  changedThisMonth: boolean;
  /** 月が飛んでいたら数字を信用しない */
  gapCount: number;
  error?: string;
}

export async function checkTrendSignals(
  now: number,
  period = DEFAULT_SMA_MONTHS
): Promise<SignalSnapshot[]> {
  return Promise.all(
    TREND_TARGETS.map(async (t): Promise<SignalSnapshot> => {
      const base: SignalSnapshot = {
        ticker: t.ticker,
        label: t.label,
        state: null,
        asOf: null,
        gapPct: null,
        monthsInState: null,
        changedThisMonth: false,
        gapCount: 0,
      };
      try {
        const r = await fetchYahooBars(t.ticker, "50y", "1d", true);
        const monthly = toMonthlyBars(r.bars, now);
        const gaps = findMonthGaps(monthly.filter((b) => !b.provisional));
        const s = evaluateTrend(monthly, period);
        if (!s) return { ...base, gapCount: gaps.length, error: "判定に必要な月数に足りません" };
        return {
          ...base,
          state: s.state,
          asOf: s.asOf,
          gapPct: s.gapPct,
          monthsInState: s.monthsInState,
          changedThisMonth: s.changedThisMonth,
          gapCount: gaps.length,
        };
      } catch (e) {
        return { ...base, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );
}

/** 発注が要るものだけ。月が飛んでいる銘柄は数字を信用できないので外す */
export function signalsNeedingAction(signals: SignalSnapshot[]): SignalSnapshot[] {
  return signals.filter((s) => s.changedThisMonth && s.gapCount === 0 && !s.error);
}
