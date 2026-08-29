/**
 * 「その成績は、インデックスに入れていた場合と比べてどうか」を出す。
 *
 * きっかけ: 累積リターンを期間なしで出すと、良し悪しが判断できない。
 * +21% は 1 年なら上出来、10 年なら市場に大きく負けている。
 * 比較対象を持たないまま自分の成績を見るのが一番危ない見方なので、
 * 同じ期間・同じ入れ方でインデックスを買った場合を横に並べる。
 *
 * 土俵を揃えるのが要点:
 * - 手元の実績 (summary.totalReturnPct) は「投じた金額に対するリターン」。
 *   時間加重ではないので、年率換算した数字を他人と比べても意味が薄い。
 * - なので**同じ定義**でインデックス側も出す。積立なら積立、一括なら一括。
 */

import type { MonthlyBar } from "./trend-signal";

export interface PeriodReturn {
  from: string;
  to: string;
  months: number;
  /** 投じた金額に対するリターン (%) */
  returnPct: number;
  /** 投じた金額 (正規化。一括は 1、積立は月数ぶん) */
  invested: number;
  /** 最終評価額 (同じ正規化) */
  finalValue: number;
  /**
   * 年率 (%)。一括の場合だけ意味を持つ。
   * 積立では資金の平均滞在期間が期間の半分ほどなので、この換算は実態より低く出る。
   */
  annualPct: number | null;
}

function sliceByMonth(bars: MonthlyBar[], from: string, to: string): MonthlyBar[] {
  return bars.filter((b) => !b.provisional && b.month >= from && b.month <= to);
}

export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  if (!fy || !fm || !ty || !tm) return 0;
  return (ty - fy) * 12 + (tm - fm);
}

/** 期首に全額を入れて持ち切った場合 */
export function lumpSumReturn(
  bars: MonthlyBar[],
  from: string,
  to: string
): PeriodReturn | null {
  const s = sliceByMonth(bars, from, to);
  if (s.length < 2) return null;
  const first = s[0].close;
  const last = s[s.length - 1].close;
  if (!(first > 0)) return null;

  const months = s.length - 1;
  const finalValue = last / first;
  return {
    from: s[0].month,
    to: s[s.length - 1].month,
    months,
    invested: 1,
    finalValue,
    returnPct: (finalValue - 1) * 100,
    annualPct: months >= 1 ? (Math.pow(finalValue, 12 / months) - 1) * 100 : null,
  };
}

/**
 * 毎月同額を積み立てた場合。1 ヶ月に 1 単位ずつ買う。
 * summary.totalReturnPct と同じ定義 (投じた総額に対するリターン) になるので、
 * そのまま横に並べられる。
 */
export function dcaReturn(bars: MonthlyBar[], from: string, to: string): PeriodReturn | null {
  const s = sliceByMonth(bars, from, to);
  if (s.length < 2) return null;
  const last = s[s.length - 1].close;

  let units = 0;
  let invested = 0;
  // 最終月は「買った瞬間に評価」になってしまうので、買い付けは最終月の 1 つ前まで
  for (let i = 0; i < s.length - 1; i++) {
    if (!(s[i].close > 0)) continue;
    units += 1 / s[i].close;
    invested += 1;
  }
  if (invested === 0) return null;

  const finalValue = units * last;
  const months = s.length - 1;
  return {
    from: s[0].month,
    to: s[s.length - 1].month,
    months,
    invested,
    finalValue,
    returnPct: (finalValue / invested - 1) * 100,
    // 積立の年率は資金の平均滞在期間が期間の半分ほど。ここで出すと誤解を生むので出さない
    annualPct: null,
  };
}

export type Verdict = "win" | "lose" | "tie";

export interface Comparison {
  label: string;
  benchmarkPct: number;
  /** 自分 − ベンチマーク (ポイント) */
  diffPt: number;
  verdict: Verdict;
}

/** 差が 1 ポイント未満なら引き分け扱いにする。誤差で勝ち負けを言わない */
export function compareTo(minePct: number, benchmarkPct: number, label: string): Comparison {
  const diffPt = minePct - benchmarkPct;
  return {
    label,
    benchmarkPct,
    diffPt,
    verdict: Math.abs(diffPt) < 1 ? "tie" : diffPt > 0 ? "win" : "lose",
  };
}

/**
 * 期間が短すぎる比較に印を付ける。
 * 12 ヶ月未満は相場の一局面しか見ていないので、勝ち負けを結論にしない。
 */
export function isTooShort(months: number): boolean {
  return months < 12;
}

/* ------------------------------------------------------------------ */
/* 投資を始めた月の推定                                                */
/* ------------------------------------------------------------------ */

export interface TimelinePointLike {
  /** "2020/03/31" と "2026-03-12" が混在する */
  date: string;
  stocks?: number;
  funds?: number;
}

/** "2020/03/31" でも "2026-03-12" でも "YYYY-MM" にする。読めなければ null */
export function toYearMonth(date: string): string | null {
  const m = date.match(/^(\d{4})[/-](\d{1,2})/);
  if (!m) return null;
  const month = Number(m[2]);
  if (!(month >= 1 && month <= 12)) return null;
  return `${m[1]}-${String(month).padStart(2, "0")}`;
}

/**
 * 資産推移から、リスク資産（株式＋投資信託）が最初に立った月を返す。
 *
 * 開始月を手で入れさせるより、持っているデータから決めた方が正確で早い。
 * 本人が上書きできる初期値として使う。
 */
export function inferStartMonth(timeline: TimelinePointLike[]): string | null {
  const points = timeline
    .map((p) => ({ ym: toYearMonth(p.date), risk: (p.stocks ?? 0) + (p.funds ?? 0) }))
    .filter((p): p is { ym: string; risk: number } => p.ym !== null)
    .sort((a, b) => a.ym.localeCompare(b.ym));

  const first = points.find((p) => p.risk > 0);
  return first ? first.ym : null;
}
