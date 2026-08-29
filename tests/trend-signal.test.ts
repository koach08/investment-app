import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toMonthlyBars,
  evaluateTrend,
  backtestTrend,
  toJpyMonthly,
  backtestByPeriods,
  findMonthGaps,
  type MonthlyBar,
} from "@/lib/trend-signal";
import type { OHLCVBar } from "@/lib/quant/types";

/** 指定した年月の日足を作る。closes の最後がその月の終値になる。 */
function daily(year: number, month: number, closes: number[]): OHLCVBar[] {
  return closes.map((c, i) => ({
    timestamp: Date.UTC(year, month - 1, i + 1),
    open: c,
    high: c,
    low: c,
    close: c,
    volume: 100,
  }));
}

/** 終値だけ指定して確定済み月足を並べる。2020-01 から連番。 */
function months(closes: number[], provisionalLast = false): MonthlyBar[] {
  return closes.map((c, i) => {
    const y = 2020 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    return {
      month: `${y}-${String(m).padStart(2, "0")}`,
      open: c,
      high: c,
      low: c,
      close: c,
      volume: 0,
      provisional: provisionalLast && i === closes.length - 1,
    };
  });
}

/* --- 月足への集約 --- */

test("日足を月足に集約し、終値は月の最後の日足を使う", () => {
  const bars = [...daily(2026, 6, [100, 110, 105]), ...daily(2026, 7, [120, 90])];
  const m = toMonthlyBars(bars, Date.UTC(2026, 7, 24)); // 2026-08 時点
  assert.equal(m.length, 2);
  assert.equal(m[0].month, "2026-06");
  assert.equal(m[0].close, 105);
  assert.equal(m[0].high, 110);
  assert.equal(m[1].month, "2026-07");
  assert.equal(m[1].close, 90);
  assert.equal(m[1].low, 90);
});

test("進行中の月は provisional になる", () => {
  const bars = [...daily(2026, 7, [100]), ...daily(2026, 8, [110])];
  const m = toMonthlyBars(bars, Date.UTC(2026, 7, 24)); // 2026-08 の途中
  assert.equal(m[0].provisional, false);
  assert.equal(m[1].month, "2026-08");
  assert.equal(m[1].provisional, true);
});

/* --- 判定 --- */

test("SMA が出せる月数に足りなければ null", () => {
  assert.equal(evaluateTrend(months([1, 2, 3]), 10), null);
});

test("終値が10ヶ月SMAより上なら invested", () => {
  // 1..10 の平均は 5.5、最終月の終値 10 > 5.5
  const s = evaluateTrend(months([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 10);
  assert.ok(s);
  assert.equal(s.state, "invested");
  assert.equal(s.asOf, "2020-10");
  assert.equal(s.sma, 5.5);
  assert.ok(s.gapPct! > 0);
});

test("終値が10ヶ月SMAより下なら cash", () => {
  const s = evaluateTrend(months([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]), 10);
  assert.ok(s);
  assert.equal(s.state, "cash");
  assert.ok(s.gapPct! < 0);
});

test("進行中の月は判定に使わず、参考値として別に返す", () => {
  // 確定分は上昇で invested。進行中の月だけ暴落させる
  const m = months([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0.01], true);
  const s = evaluateTrend(m, 10);
  assert.ok(s);
  assert.equal(s.state, "invested"); // 従うべきシグナルは変わらない
  assert.equal(s.asOf, "2020-10");
  assert.ok(s.provisional);
  assert.equal(s.provisional.month, "2020-11");
  assert.equal(s.provisional.state, "cash");
  assert.equal(s.provisional.diverges, true);
});

test("state が変わった月と継続月数を返す", () => {
  // 12ヶ月ぶん。11ヶ月目で SMA を割り、12ヶ月目も下のまま
  const s = evaluateTrend(months([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 1, 1]), 10);
  assert.ok(s);
  assert.equal(s.state, "cash");
  assert.equal(s.changedAt, "2020-11");
  assert.equal(s.monthsInState, 2);
  assert.equal(s.changedThisMonth, false);
});

test("今月 state が変わったときだけ changedThisMonth が立つ", () => {
  const s = evaluateTrend(months([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 1]), 10);
  assert.ok(s);
  assert.equal(s.state, "cash");
  assert.equal(s.changedThisMonth, true);
});

/* --- バックテスト --- */

test("ずっと上昇なら strategy は buyHold とほぼ同じで、乗り換えは起きない", () => {
  const closes = Array.from({ length: 40 }, (_, i) => 100 * 1.01 ** i);
  const r = backtestTrend(months(closes), 10, 0);
  assert.ok(r);
  assert.equal(r.switches, 0);
  assert.equal(r.cashMonthsPct, 0);
  assert.ok(Math.abs(r.strategy.totalReturn - r.buyHold.totalReturn) < 1e-6);
});

test("上げてから崩れる相場で最大下落が buyHold より浅くなる", () => {
  const up = Array.from({ length: 24 }, (_, i) => 100 * 1.02 ** i);
  const peak = up[up.length - 1];
  const down = Array.from({ length: 20 }, (_, i) => peak * 0.93 ** (i + 1));
  const r = backtestTrend(months([...up, ...down]), 10, 0);
  assert.ok(r);
  assert.ok(r.strategy.maxDrawdown > r.buyHold.maxDrawdown, "strategy の DD の方が浅いはず");
  assert.ok(r.switches >= 1);
  assert.ok(r.cashMonthsPct > 0);
});

test("判定は前月末のものを当月に適用する。先読みしない", () => {
  // 10ヶ月の助走のあと、11ヶ月目で急落 → 12ヶ月目から現金。
  // 先読みしていれば 11ヶ月目の下落を避けられてしまう。
  const closes = [...Array.from({ length: 10 }, (_, i) => 100 + i), 50, 25];
  const r = backtestTrend(months(closes), 10, 0);
  assert.ok(r);
  // 11ヶ月目の -55% は食らい、12ヶ月目の -50% は避ける
  assert.ok(r.strategy.totalReturn < -50);
  assert.ok(r.strategy.totalReturn > r.buyHold.totalReturn);
});

test("乗り換えコストは switch のたびに引かれる", () => {
  const up = Array.from({ length: 24 }, (_, i) => 100 * 1.02 ** i);
  const peak = up[up.length - 1];
  const down = Array.from({ length: 20 }, (_, i) => peak * 0.93 ** (i + 1));
  const m = months([...up, ...down]);
  const free = backtestTrend(m, 10, 0)!;
  const costly = backtestTrend(m, 10, 1)!;
  assert.equal(free.switches, costly.switches);
  assert.ok(costly.strategy.totalReturn < free.strategy.totalReturn);
});

test("期間が足りなければ null", () => {
  assert.equal(backtestTrend(months([1, 2, 3, 4, 5]), 10), null);
});

/* --- 円建て換算 --- */

test("為替系列が無ければ null を返して黙って混ぜない", () => {
  assert.equal(toJpyMonthly(months([1, 2, 3]), null), null);
  assert.equal(toJpyMonthly(months([1, 2, 3]), []), null);
});

test("月ごとの実レートで掛ける", () => {
  const fx = months([100, 150, 200]);
  const m = toJpyMonthly(months([10, 10, 10]), fx);
  assert.ok(m);
  assert.equal(m.length, 3);
  assert.equal(m[0].close, 1_000);
  assert.equal(m[1].close, 1_500);
  assert.equal(m[2].close, 2_000);
});

test("為替が無い月は落とす。直近レートで埋めない", () => {
  const fx = months([100, 150]); // 2020-01, 2020-02 のみ
  const m = toJpyMonthly(months([10, 10, 10]), fx);
  assert.ok(m);
  assert.equal(m.length, 2);
  assert.equal(m[m.length - 1].month, "2020-02");
});

test("定数レートではシグナルが動かないが、実系列なら動く", () => {
  // ドル建てでは横ばい。為替だけが崩れるケース
  const usd = months(Array.from({ length: 12 }, () => 100));
  const flat = toJpyMonthly(usd, months(Array.from({ length: 12 }, () => 150)))!;
  assert.equal(evaluateTrend(flat, 10)!.state, evaluateTrend(usd, 10)!.state);

  const crashing = toJpyMonthly(
    usd,
    months([200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 100, 100])
  )!;
  assert.equal(evaluateTrend(usd, 10)!.state, "cash"); // 横ばいは SMA と同値で cash 側
  assert.equal(evaluateTrend(crashing, 10)!.state, "cash");
  // 円高で円建て終値が SMA を大きく割り込んでいることを確認
  assert.ok(evaluateTrend(crashing, 10)!.gapPct! < -20);
});

/* --- 期間分割 --- */

test("期間ごとに区切って結果を並べる", () => {
  const closes = Array.from({ length: 72 }, (_, i) => 100 * 1.01 ** i);
  const m = months(closes); // 2020-01 〜 2025-12
  const periods = backtestByPeriods(m, ["2021-01", "2023-01", "2025-01"], 10, 0);
  assert.equal(periods.length, 2);
  assert.equal(periods[0].label, "2021〜2023");
  assert.equal(periods[1].label, "2023〜2025");
  assert.ok(periods[0].result);
  assert.ok(periods[1].result);
});

test("助走ぶんを手前から確保するので、区間の頭から判定できる", () => {
  const closes = Array.from({ length: 48 }, (_, i) => 100 * 1.01 ** i);
  const m = months(closes);
  const [p] = backtestByPeriods(m, ["2022-01", "2023-01"], 10, 0);
  assert.ok(p.result);
  // 区間は12ヶ月。助走を手前から取っているので12ヶ月ぶん評価できている
  assert.ok(p.result.strategy.months >= 11);
});

test("現金の金利を入れると、現金でいた期間ぶんだけ戦略が上がる", () => {
  const up = Array.from({ length: 24 }, (_, i) => 100 * 1.02 ** i);
  const peak = up[up.length - 1];
  const down = Array.from({ length: 20 }, (_, i) => peak * 0.93 ** (i + 1));
  const m = months([...up, ...down]);
  const zero = backtestTrend(m, 10, 0, 0)!;
  const paid = backtestTrend(m, 10, 0, 2)!;
  assert.ok(zero.cashMonthsPct > 0);
  assert.ok(paid.strategy.totalReturn > zero.strategy.totalReturn);
  assert.equal(paid.buyHold.totalReturn, zero.buyHold.totalReturn); // B&H は影響を受けない
  assert.equal(paid.cashAnnualPct, 2);
});

test("月が連続していれば欠けは無い", () => {
  assert.deepEqual(findMonthGaps(months([1, 2, 3, 4])), []);
});

test("飛んでいる月を列挙する", () => {
  const m = months([1, 2, 3]);
  m.splice(1, 1); // 2020-02 を落とす
  assert.deepEqual(findMonthGaps(m), ["2020-02"]);
});

test("四半期足を月足だと思い込んだ場合に大量の欠けとして出る", () => {
  // 2020-01, 2020-04, 2020-07 だけ
  const q = months([1, 2, 3, 4, 5, 6, 7]).filter((_, i) => i % 3 === 0);
  const gaps = findMonthGaps(q);
  assert.equal(gaps.length, 4);
  assert.ok(gaps.includes("2020-02"));
  assert.ok(gaps.includes("2020-06"));
});

test("年をまたぐ欠けも拾う", () => {
  const m = months(Array.from({ length: 14 }, (_, i) => i + 1)); // 2020-01〜2021-02
  m.splice(11, 2); // 2020-12, 2021-01 を落とす
  assert.deepEqual(findMonthGaps(m), ["2020-12", "2021-01"]);
});
