import { test } from "node:test";
import assert from "node:assert/strict";
import {
  monthsBetween, lumpSumReturn, dcaReturn, compareTo, isTooShort, toYearMonth, inferStartMonth,
} from "@/lib/benchmark";
import type { MonthlyBar } from "@/lib/trend-signal";

/** 2020-01 から連番で月足を作る */
function months(closes: number[], provisionalLast = false): MonthlyBar[] {
  return closes.map((c, i) => {
    const y = 2020 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    return {
      month: `${y}-${String(m).padStart(2, "0")}`,
      open: c, high: c, low: c, close: c, volume: 0,
      provisional: provisionalLast && i === closes.length - 1,
    };
  });
}

test("月数の差を出す", () => {
  assert.equal(monthsBetween("2020-01", "2020-01"), 0);
  assert.equal(monthsBetween("2020-01", "2020-12"), 11);
  assert.equal(monthsBetween("2020-01", "2021-01"), 12);
  assert.equal(monthsBetween("2020-06", "2026-03"), 69);
  assert.equal(monthsBetween("", "2026-03"), 0);
});

test("一括は期首から期末までの値上がりそのもの", () => {
  const r = lumpSumReturn(months([100, 110, 120, 200]), "2020-01", "2020-04");
  assert.ok(r);
  assert.equal(r.months, 3);
  assert.equal(r.invested, 1);
  assert.equal(r.finalValue, 2);
  assert.ok(Math.abs(r.returnPct - 100) < 1e-9);
  // 3ヶ月で2倍 → 年率換算は 2^4 - 1 = 1500%
  assert.ok(Math.abs(r.annualPct! - 1500) < 0.01);
});

test("一括: 値下がりならマイナス", () => {
  const r = lumpSumReturn(months([100, 50]), "2020-01", "2020-02")!;
  assert.ok(Math.abs(r.returnPct - -50) < 1e-9);
});

test("積立: 価格が一定なら投じた額と評価額が一致してリターン0", () => {
  const r = dcaReturn(months([100, 100, 100, 100]), "2020-01", "2020-04")!;
  assert.equal(r.invested, 3); // 最終月は買わない
  assert.ok(Math.abs(r.returnPct) < 1e-9);
});

test("積立: 一括より下げ相場に強く、上げ相場に弱い", () => {
  const up = months([100, 200, 300, 400]);
  const lump = lumpSumReturn(up, "2020-01", "2020-04")!;
  const dca = dcaReturn(up, "2020-01", "2020-04")!;
  assert.ok(lump.returnPct > dca.returnPct, "上げ相場は一括が有利");

  const down = months([400, 300, 200, 100]);
  const lumpD = lumpSumReturn(down, "2020-01", "2020-04")!;
  const dcaD = dcaReturn(down, "2020-01", "2020-04")!;
  assert.ok(dcaD.returnPct > lumpD.returnPct, "下げ相場は積立が有利");
});

test("積立の年率は出さない。資金の滞在期間が半分ほどで誤解を生むため", () => {
  const r = dcaReturn(months([100, 110, 120, 130]), "2020-01", "2020-04")!;
  assert.equal(r.annualPct, null);
});

test("進行中の月は比較に使わない", () => {
  const m = months([100, 110, 999], true); // 最終月が未確定
  const r = lumpSumReturn(m, "2020-01", "2020-03")!;
  assert.equal(r.to, "2020-02");
  assert.ok(Math.abs(r.returnPct - 10) < 1e-9);
});

test("期間の指定が範囲外なら null", () => {
  assert.equal(lumpSumReturn(months([100, 110]), "2030-01", "2030-12"), null);
  assert.equal(dcaReturn(months([100, 110]), "2030-01", "2030-12"), null);
  assert.equal(lumpSumReturn(months([100]), "2020-01", "2020-01"), null);
});

test("勝ち負けは1ポイント未満なら引き分け", () => {
  assert.equal(compareTo(21.2, 15.0, "全世界株").verdict, "win");
  assert.equal(compareTo(10.0, 30.0, "全世界株").verdict, "lose");
  assert.equal(compareTo(21.2, 20.5, "全世界株").verdict, "tie");
  assert.equal(compareTo(20.5, 21.2, "全世界株").verdict, "tie");
});

test("差はポイントで返す", () => {
  const c = compareTo(21.18, 45.0, "S&P500");
  assert.ok(Math.abs(c.diffPt - -23.82) < 1e-9);
  assert.equal(c.benchmarkPct, 45.0);
  assert.equal(c.label, "S&P500");
});

test("12ヶ月未満は結論にしない印を付ける", () => {
  assert.equal(isTooShort(11), true);
  assert.equal(isTooShort(12), false);
  assert.equal(isTooShort(69), false);
});

/* --- 投資を始めた月の推定 --- */

test("日付の区切りがスラッシュでもハイフンでも読む", () => {
  assert.equal(toYearMonth("2020/03/31"), "2020-03");
  assert.equal(toYearMonth("2026-03-12"), "2026-03");
  assert.equal(toYearMonth("2020/3/1"), "2020-03");
  assert.equal(toYearMonth("こわれた"), null);
  assert.equal(toYearMonth("2020/13/01"), null, "13月は読まない");
});

test("リスク資産が最初に立った月を投資開始とみなす", () => {
  const tl = [
    { date: "2020/01/31", stocks: 0, funds: 0 },
    { date: "2020/02/29", stocks: 0, funds: 0 },
    { date: "2020/03/31", stocks: 0, funds: 308830 },
    { date: "2020/04/30", stocks: 100, funds: 400000 },
  ];
  assert.equal(inferStartMonth(tl), "2020-03");
});

test("株式だけでも投信だけでも開始とみなす", () => {
  assert.equal(inferStartMonth([{ date: "2021/05/31", stocks: 50000 }]), "2021-05");
  assert.equal(inferStartMonth([{ date: "2021/05/31", funds: 50000 }]), "2021-05");
});

test("順序が入れ替わっていても一番早い月を返す", () => {
  const tl = [
    { date: "2022/06/30", funds: 100 },
    { date: "2020/03/31", funds: 100 },
    { date: "2021/01/31", funds: 100 },
  ];
  assert.equal(inferStartMonth(tl), "2020-03");
});

test("リスク資産が一度も無ければ null", () => {
  assert.equal(inferStartMonth([{ date: "2020/01/31", stocks: 0, funds: 0 }]), null);
  assert.equal(inferStartMonth([]), null);
});

test("読めない日付は飛ばす", () => {
  const tl = [
    { date: "こわれた", funds: 999999 },
    { date: "2021/07/31", funds: 100 },
  ];
  assert.equal(inferStartMonth(tl), "2021-07");
});
