import { test } from "node:test";
import assert from "node:assert/strict";
import { toJpy, normalizeHoldings, type FxRates } from "@/lib/fx";

const rates: FxRates = { JPY: 1, USD: 150, SGD: 115 };

test("円はそのまま、外貨はレートを掛ける", () => {
  assert.equal(toJpy(1000, "JPY", rates), 1000);
  assert.equal(toJpy(1000, undefined, rates), 1000);
  assert.equal(toJpy(100, "USD", rates), 15_000);
  assert.equal(toJpy(100, "usd", rates), 15_000);
  assert.equal(toJpy(100, "SGD", rates), 11_500);
});

test("レートが無い通貨は 0 円にせず null を返す", () => {
  assert.equal(toJpy(100, "EUR", rates), null);
  assert.equal(toJpy(100, "USD", { JPY: 1 }), null);
  // 0 や負のレートも使わない
  assert.equal(toJpy(100, "USD", { USD: 0 }), null);
});

test("換算できない行は落として呼び出し側に返す", () => {
  const { rows, unconverted } = normalizeHoldings(
    [
      { name: "国内株", marketValue: 1000, currency: "JPY", pnl: 100 },
      { name: "米国株", marketValue: 100, currency: "USD", pnl: 10 },
      { name: "シンガポール株", marketValue: 50, currency: "SGD", pnl: 5 },
      { name: "謎の通貨", marketValue: 999, currency: "XYZ", pnl: 0 },
    ],
    rates
  );
  assert.equal(rows.length, 3);
  assert.equal(rows.reduce((s, r) => s + r.marketValue, 0), 1000 + 15_000 + 5_750);
  assert.equal(rows.reduce((s, r) => s + r.pnl, 0), 100 + 1_500 + 575);
  assert.equal(unconverted.length, 1);
  assert.equal(unconverted[0].name, "謎の通貨");
  assert.equal(unconverted[0].currency, "XYZ");
});

test("元の通貨は残しておく", () => {
  const { rows } = normalizeHoldings([{ name: "米国株", marketValue: 100, currency: "usd" }], rates);
  assert.equal(rows[0].originalCurrency, "USD");
  assert.equal(rows[0].marketValue, 15_000);
  // pnl 未指定なら 0
  assert.equal(rows[0].pnl, 0);
});
