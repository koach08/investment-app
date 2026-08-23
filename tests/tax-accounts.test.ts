import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeTaxAccounts, taxSavedPerYear, type TaxAccountInput } from "@/lib/tax-accounts";

const base = (o: Partial<TaxAccountInput> = {}): TaxAccountInput => ({
  tsumitateUsedThisYear: 0,
  growthUsedThisYear: 0,
  lifetimeUsed: 0,
  lifetimeGrowthUsed: 0,
  idecoMonthly: 0,
  idecoMonthlyLimit: 0,
  investableCash: 0,
  today: new Date("2026-08-23"),
  ...o,
});

test("年内の残り月数は当月を含む", () => {
  assert.equal(analyzeTaxAccounts(base()).monthsLeft, 5); // 8,9,10,11,12月
  assert.equal(analyzeTaxAccounts(base({ today: new Date("2026-12-01") })).monthsLeft, 1);
  assert.equal(analyzeTaxAccounts(base({ today: new Date("2026-01-05") })).monthsLeft, 12);
});

test("残枠と月あたりの必要額を出す", () => {
  const t = analyzeTaxAccounts(base({ tsumitateUsedThisYear: 400_000, growthUsedThisYear: 1_200_000 }));
  assert.equal(t.tsumitate.remaining, 800_000);
  assert.equal(t.growth.remaining, 1_200_000);
  assert.equal(t.annual.remaining, 2_000_000);
  // 残り5ヶ月なので月16万
  assert.equal(t.tsumitate.perMonth, 160_000);
});

test("使いすぎても残枠はマイナスにならない", () => {
  const t = analyzeTaxAccounts(base({ tsumitateUsedThisYear: 5_000_000 }));
  assert.equal(t.tsumitate.remaining, 0);
  assert.equal(t.tsumitate.perMonth, 0);
});

test("生涯枠の残りが年間残枠より小さければそちらが上限になる", () => {
  const t = analyzeTaxAccounts(base({ lifetimeUsed: 17_500_000, investableCash: 10_000_000 }));
  assert.equal(t.lifetime.remaining, 500_000);
  // 年間は360万空いているが、生涯枠が50万しかないので埋められる
  assert.equal(t.canFillAnnual, true);
  assert.ok(t.notes.some((n) => n.includes("生涯枠の残り")));
});

test("現金が足りなければ不足額を出す", () => {
  const t = analyzeTaxAccounts(base({ investableCash: 1_000_000 }));
  assert.equal(t.canFillAnnual, false);
  assert.equal(t.shortfall, 2_600_000); // 360万 - 100万
});

test("iDeCo は上限が未入力なら出さない", () => {
  assert.equal(analyzeTaxAccounts(base()).ideco, null);
  const t = analyzeTaxAccounts(base({ idecoMonthly: 12_000, idecoMonthlyLimit: 20_000 }));
  assert.equal(t.ideco?.monthlyRemaining, 8_000);
  assert.equal(t.ideco?.annualRemaining, 40_000); // 8000 x 5ヶ月
});

test("非課税で浮く税額は実測利回りの割り算", () => {
  // 残枠360万・利回り1% → 年3.6万の配当に20.315%
  assert.equal(Math.round(taxSavedPerYear(3_600_000, 1)!), Math.round(36_000 * 0.20315));
  assert.equal(taxSavedPerYear(3_600_000, null), null);
  assert.equal(taxSavedPerYear(3_600_000, 0), null);
});
