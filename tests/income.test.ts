import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeIncome, matchesHolding, type DividendLike } from "@/lib/income";

const d = (date: string, amount: number, o: Partial<DividendLike> = {}): DividendLike => ({
  date,
  account: "特定/一般",
  product: "国内株式(現物)",
  name: "銘柄A",
  ticker: "1234.T",
  quantity: 100,
  amount,
  ...o,
});

test("直近12ヶ月は最新の入金日を基準に数える", () => {
  const inc = analyzeIncome(
    [d("2025/03/01", 10_000), d("2025/09/01", 20_000), d("2024/01/01", 99_000)],
    { totalAssets: 10_000_000, riskAssets: 5_000_000, today: new Date("2025-09-05") }
  );
  assert.equal(inc.anchorDate, "2025-09-01");
  assert.equal(inc.last12m, 30_000);
  assert.equal(inc.allTime, 129_000);
});

test("currency が USD でも円建てとして集計する", () => {
  const inc = analyzeIncome(
    [d("2025/09/01", 2_781.05, { currency: "USD", product: "米国株式" })],
    { totalAssets: 1_000_000, riskAssets: 1_000_000, today: new Date("2025-09-05") }
  );
  assert.equal(inc.last12m, 2_781.05);
});

test("非課税口座を見分ける", () => {
  const inc = analyzeIncome(
    [d("2025/09/01", 1_000, { account: "NISA(成長投資枠)" }), d("2025/09/01", 2_000)],
    { totalAssets: 1_000_000, riskAssets: 1_000_000, today: new Date("2025-09-05") }
  );
  const nisa = inc.byAccount.find((a) => a.account.includes("NISA"));
  assert.equal(nisa?.taxFree, true);
  assert.equal(inc.byAccount.find((a) => a.account === "特定/一般")?.taxFree, false);
});

test("目標インカムの逆算は実測利回りの割り算", () => {
  // 年12万・総資産1200万 → 利回り1%
  const inc = analyzeIncome(
    [d("2025/09/01", 120_000)],
    { totalAssets: 12_000_000, riskAssets: 12_000_000, today: new Date("2025-09-05") }
  );
  assert.equal(inc.yieldOnTotal, 1);
  const t = inc.targets.find((x) => x.monthlyTarget === 10_000)!;
  // 月1万 = 年12万。利回り1%なら元本1200万。すでに到達
  assert.equal(Math.round(t.requiredPrincipal!), 12_000_000);
  assert.equal(t.additionalNeeded, 0);
  const t3 = inc.targets.find((x) => x.monthlyTarget === 30_000)!;
  assert.equal(Math.round(t3.requiredPrincipal!), 36_000_000);
  assert.equal(Math.round(t3.additionalNeeded!), 24_000_000);
});

test("記録が古いと警告する", () => {
  const inc = analyzeIncome([d("2025/01/01", 1_000)], {
    totalAssets: 1_000_000,
    riskAssets: 1_000_000,
    today: new Date("2025-09-05"),
  });
  assert.ok(inc.notes.some((n) => n.includes("取り込みが止まっている")));
});

test("記録がなければ空の結果と案内を返す", () => {
  const inc = analyzeIncome([], { totalAssets: 1_000_000, riskAssets: 1_000_000 });
  assert.equal(inc.recordCount, 0);
  assert.equal(inc.last12m, 0);
  assert.ok(inc.notes[0].includes("記録がありません"));
});

test("いまの保有で裏付けが取れる配当と取れない配当を分ける", () => {
  const inc = analyzeIncome(
    [
      d("2025/09/01", 5_000, { name: "コカ-コーラ KO", ticker: "KO", product: "米国株式" }),
      d("2025/08/01", 3_000, { name: "ANAホールディングス 9202", ticker: "9202.T" }),
    ],
    {
      totalAssets: 1_000_000,
      riskAssets: 1_000_000,
      today: new Date("2025-09-05"),
      holdings: [{ name: "コカ-コーラ", code: "KO" }],
    }
  );
  assert.equal(inc.sustained.checkable, true);
  assert.equal(inc.sustained.matched, 5_000);
  assert.equal(inc.sustained.unmatched, 3_000);
  assert.equal(inc.sustained.unmatchedNames[0].name, "ANAホールディングス 9202");
  // 印が無いうちは未確認として、見込みには入れない
  assert.equal(inc.sustained.unknown, 3_000);
  assert.equal(inc.sustained.expectedForward, 5_000);
  assert.ok(inc.notes.some((n) => n.includes("見込みに入れていません")));
});

test("保有データが無ければ裏付けの判定はしない", () => {
  const inc = analyzeIncome([d("2025/09/01", 5_000)], {
    totalAssets: 1_000_000,
    riskAssets: 1_000_000,
    today: new Date("2025-09-05"),
  });
  assert.equal(inc.sustained.checkable, false);
  assert.equal(inc.sustained.matched, 0);
});

test("コード一致でも名前の部分一致でも拾う", () => {
  assert.equal(matchesHolding({ name: "日本航空 9201", ticker: "9201.T" }, [{ name: "JAL", code: "9201" }]), true);
  assert.equal(matchesHolding({ name: "コカ-コーラ KO", ticker: "KO" }, [{ name: "コカ・コーラ", code: "" }]), true);
  assert.equal(matchesHolding({ name: "任天堂 7974", ticker: "7974.T" }, [{ name: "トヨタ", code: "7203" }]), false);
});

test("売却済みの印を付けると来年の見込みから外れる", () => {
  const rows = [
    d("2025/09/01", 5_000, { name: "コカ-コーラ KO", ticker: "KO", product: "米国株式" }),
    d("2025/08/01", 3_000, { name: "ANAホールディングス 9202", ticker: "9202.T" }),
    d("2025/07/01", 2_000, { name: "日本航空 9201", ticker: "9201.T" }),
  ];
  const opts = {
    totalAssets: 1_000_000,
    riskAssets: 1_000_000,
    today: new Date("2025-09-05"),
    holdings: [{ name: "コカ-コーラ", code: "KO" }],
  };

  const sold = analyzeIncome(rows, {
    ...opts,
    statusByName: { "ANAホールディングス 9202": { status: "sold" as const } },
  });
  assert.equal(sold.sustained.soldConfirmed, 3_000);
  assert.equal(sold.sustained.unknown, 2_000);
  // 裏付けのある5,000のみ。売却分も未確認分も入れない
  assert.equal(sold.sustained.expectedForward, 5_000);
  assert.ok(sold.notes.some((n) => n.includes("来年は入りません")));

  const held = analyzeIncome(rows, {
    ...opts,
    statusByName: { "ANAホールディングス 9202": { status: "sold" as const }, "日本航空 9201": { status: "held" as const } },
  });
  assert.equal(held.sustained.heldConfirmed, 2_000);
  assert.equal(held.sustained.unknown, 0);
  assert.equal(held.sustained.expectedForward, 7_000);
});

test("印の合計は裏付けが取れない額と一致する", () => {
  const inc = analyzeIncome(
    [
      d("2025/09/01", 5_000, { name: "コカ-コーラ KO", ticker: "KO" }),
      d("2025/08/01", 3_000, { name: "ANA 9202", ticker: "9202.T" }),
      d("2025/07/01", 2_000, { name: "JAL 9201", ticker: "9201.T" }),
    ],
    {
      totalAssets: 1_000_000,
      riskAssets: 1_000_000,
      today: new Date("2025-09-05"),
      holdings: [{ name: "コカ-コーラ", code: "KO" }],
      statusByName: { "ANA 9202": { status: "sold" as const } },
    }
  );
  const s = inc.sustained;
  assert.equal(s.soldConfirmed + s.heldConfirmed + s.unknown, s.unmatched);
  assert.equal(s.matched + s.unmatched, inc.last12m);
});

test("一部売却は残った割合だけを見込みに入れる", () => {
  const inc = analyzeIncome(
    [
      d("2025/09/01", 5_000, { name: "コカ-コーラ KO", ticker: "KO" }),
      d("2025/08/01", 14_344, { name: "ANA 9202", ticker: "9202.T" }),
    ],
    {
      totalAssets: 1_000_000,
      riskAssets: 1_000_000,
      today: new Date("2025-09-05"),
      holdings: [{ name: "コカ-コーラ", code: "KO" }],
      statusByName: { "ANA 9202": { status: "partial" as const, remainingPct: 50 } },
    }
  );
  assert.equal(inc.sustained.heldConfirmed, 7_172);
  assert.equal(inc.sustained.soldConfirmed, 7_172);
  assert.equal(inc.sustained.expectedForward, 5_000 + 7_172);
});

test("印が無い分を保有扱いにするか選べる", () => {
  const rows = [
    d("2025/09/01", 5_000, { name: "コカ-コーラ KO", ticker: "KO" }),
    d("2025/08/01", 3_000, { name: "ANA 9202", ticker: "9202.T" }),
  ];
  const base = {
    totalAssets: 1_000_000,
    riskAssets: 1_000_000,
    today: new Date("2025-09-05"),
    holdings: [{ name: "コカ-コーラ", code: "KO" }],
  };
  const excluded = analyzeIncome(rows, base);
  assert.equal(excluded.sustained.expectedForward, 5_000);
  const included = analyzeIncome(rows, { ...base, unmatchedDefault: "include" as const });
  assert.equal(included.sustained.expectedForward, 8_000);
  assert.ok(included.notes.some((n) => n.includes("保有し続けているものとして")));
});

test("既定を保有扱いにしても、売却の印は優先される", () => {
  const inc = analyzeIncome(
    [
      d("2025/09/01", 5_000, { name: "コカ-コーラ KO", ticker: "KO" }),
      d("2025/08/01", 3_000, { name: "ANA 9202", ticker: "9202.T" }),
      d("2025/07/01", 2_000, { name: "フジ 4676", ticker: "4676.T" }),
    ],
    {
      totalAssets: 1_000_000,
      riskAssets: 1_000_000,
      today: new Date("2025-09-05"),
      holdings: [{ name: "コカ-コーラ", code: "KO" }],
      unmatchedDefault: "include" as const,
      statusByName: { "フジ 4676": { status: "sold" as const } },
    }
  );
  assert.equal(inc.sustained.soldConfirmed, 2_000);
  assert.equal(inc.sustained.unknown, 3_000);
  assert.equal(inc.sustained.expectedForward, 5_000 + 3_000);
});
