import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeAssetHealth,
  buildBuckets,
  classifyBucket,
  computeMaxDrawdown,
  isBrokerageAccount,
  type HealthInput,
  type HoldingLike,
} from "@/lib/asset-health";

const h = (o: Partial<HoldingLike>): HoldingLike => ({
  source: "sbi-auto",
  code: "X",
  name: "銘柄",
  category: "国内株式",
  currency: "JPY",
  marketValue: 0,
  pnl: 0,
  pnlPercent: 0,
  ...o,
});

const base = (o: Partial<HealthInput>): HealthInput => ({
  totalAssets: 0,
  totalLiabilities: 0,
  breakdown: [],
  holdings: [],
  manualAssets: [],
  timeline: [],
  monthlyExpense: 0,
  ...o,
});

test("名前を優先してバケットを判定する", () => {
  assert.equal(classifyBucket("みずほ銀行", "預金・現金"), "cash");
  assert.equal(classifyBucket("タイちゃん貯金", "その他"), "cash");
  assert.equal(classifyBucket("WealthNavi（ウェルスナビ）", "投資信託"), "funds");
  assert.equal(classifyBucket("SBIラップ ALL株式", "SBIラップ"), "funds");
  assert.equal(classifyBucket("コカ-コーラ", "米国株（特定口座）"), "stocks");
  assert.equal(classifyBucket("bitFlyer", "暗号資産"), "crypto");
  assert.equal(classifyBucket("金・銀・プラチナ（SBI）", "金・貴金属"), "commodities");
  // カテゴリが「その他」でも名前から拾う
  assert.equal(classifyBucket("ANAマイレージ", "その他"), "points");
});

test("証券口座の残高行を見分ける", () => {
  assert.equal(isBrokerageAccount("SBI証券", "証券"), true);
  assert.equal(isBrokerageAccount("みずほ銀行", "預金・現金"), false);
});

test("口座レベルと銘柄レベルを足しても二重計上しない", () => {
  const input = base({
    holdings: [
      h({ source: "mf-auto", name: "みずほ銀行", category: "預金・現金", marketValue: 2_000_000 }),
      h({ source: "mf-auto", name: "SBI証券", category: "証券", marketValue: 10_000_000 }),
      h({ source: "sbi-wrap", name: "SBIラップ ALL株式", category: "SBIラップ", marketValue: 6_000_000 }),
      h({ source: "sbi-metals", name: "金・銀・プラチナ", category: "金・貴金属", marketValue: 1_000_000 }),
    ],
  });
  const { buckets } = buildBuckets(input);
  const sum = Object.values(buckets).reduce((s, v) => s + v, 0);
  // 銀行 200万 + 証券 1000万 = 1200万。銘柄を足しても増えない
  assert.equal(sum, 12_000_000);
  assert.equal(buckets.cash, 2_000_000);
  assert.equal(buckets.funds, 6_000_000);
  assert.equal(buckets.commodities, 1_000_000);
  // 明細で埋まらなかった 300万 は内訳未取得へ
  assert.equal(buckets.unclassified, 3_000_000);
});

test("明細の合計が口座残高を超えたら口座残高を採用する", () => {
  const input = base({
    holdings: [
      h({ source: "mf-auto", name: "SBI証券", category: "証券", marketValue: 1_000_000 }),
      h({ source: "sbi-wrap", name: "重複した明細", category: "SBIラップ", marketValue: 3_000_000 }),
    ],
  });
  const { buckets, notes } = buildBuckets(input);
  const sum = Object.values(buckets).reduce((s, v) => s + v, 0);
  assert.equal(sum, 1_000_000);
  assert.ok(notes.some((n) => n.includes("明細")));
});

test("内訳未取得の推定枠は集中度の分子に入れない", () => {
  const health = analyzeAssetHealth(
    base({
      totalAssets: 10_000_000,
      holdings: [
        h({ source: "mf-auto", name: "SBI証券", category: "証券", marketValue: 10_000_000 }),
        h({ source: "sbi-wrap", name: "小さい投信", category: "SBIラップ", marketValue: 500_000 }),
      ],
    })
  );
  const conc = health.metrics.find((m) => m.id === "concentration");
  // 950万の未取得枠ではなく、50万の投信が最大ポジション扱いになる
  assert.equal(conc?.value, "5.0%");
  assert.ok(health.gaps.some((g) => g.includes("集中度の計算からは")));
});

test("外貨建ての評価額を円に換算する", () => {
  const withRate = analyzeAssetHealth(
    base({
      totalAssets: 10_000_000,
      holdings: [h({ source: "sbi-foreign", name: "コカ-コーラ", category: "米国株", currency: "USD", marketValue: 5_000, pnl: 1_000 })],
      fxRates: { USD: 150 },
    })
  );
  assert.equal(withRate.buckets.stocks, 750_000);
  assert.equal(withRate.unrealizedGainTotal, 150_000);
  assert.equal(Math.round(withRate.foreignPct * 10) / 10, 7.5);
});

test("為替が分からない外貨建ては 0 円扱いにせず除外して申告する", () => {
  const noRate = analyzeAssetHealth(
    base({
      totalAssets: 10_000_000,
      holdings: [h({ source: "sbi-foreign", name: "コカ-コーラ", category: "米国株", currency: "USD", marketValue: 5_000 })],
    })
  );
  assert.equal(noRate.buckets.stocks, 0);
  assert.ok(noRate.gaps.some((g) => g.includes("円に換算できなかった")));
});

test("最大下落は期間を絞れる", () => {
  const timeline = [
    { date: "2020/01/31", total: 10_000_000, cash: 0, margin: 0 },
    { date: "2020/06/30", total: 5_000_000, cash: 0, margin: 0 },
    { date: "2025/01/31", total: 20_000_000, cash: 0, margin: 0 },
    { date: "2025/06/30", total: 18_000_000, cash: 0, margin: 0 },
    { date: "2026/01/31", total: 19_000_000, cash: 0, margin: 0 },
  ];
  const all = computeMaxDrawdown(timeline);
  assert.equal(Math.round(all!.pct), 50);
  const recent = computeMaxDrawdown(timeline, 24);
  assert.equal(Math.round(recent!.pct), 10);
});

test("生活防衛資金の判定は目標月数に従う", () => {
  const input = base({
    totalAssets: 6_000_000,
    holdings: [h({ source: "mf-auto", name: "みずほ銀行", category: "預金・現金", marketValue: 1_200_000 })],
    monthlyExpense: 300_000,
  });
  const at6 = analyzeAssetHealth({ ...input, targetCashMonths: 6 });
  const at3 = analyzeAssetHealth({ ...input, targetCashMonths: 3 });
  // 4ヶ月分。目標6なら足りない、目標3なら足りている
  assert.equal(at6.metrics.find((m) => m.id === "emergency-fund")?.status, "warn");
  assert.equal(at3.metrics.find((m) => m.id === "emergency-fund")?.status, "good");
});

test("ストレスシナリオの下落額は値動きする資産に比例する", () => {
  const health = analyzeAssetHealth(
    base({
      totalAssets: 10_000_000,
      holdings: [
        h({ source: "mf-auto", name: "みずほ銀行", category: "預金・現金", marketValue: 5_000_000 }),
        h({ source: "mf-auto", name: "WealthNavi", category: "投資信託", marketValue: 5_000_000 }),
      ],
    })
  );
  const s20 = health.stress.find((s) => s.id === "equity-20");
  assert.equal(s20?.loss, 1_000_000);
  assert.equal(s20?.remaining, 9_000_000);
  // 現金は減らない
  assert.equal(health.buckets.cash, 5_000_000);
});

test("中身が未登録なら実質の外貨比率は出さない", () => {
  const health = analyzeAssetHealth(
    base({
      totalAssets: 10_000_000,
      holdings: [
        h({ source: "mf-auto", name: "みずほ銀行", category: "預金・現金", marketValue: 5_000_000 }),
        h({ source: "mf-auto", name: "WealthNavi", category: "投資信託", marketValue: 5_000_000 }),
      ],
    })
  );
  assert.equal(health.lookThrough.coveragePct, 0);
  assert.equal(health.lookThrough.unknownValue, 5_000_000);
  assert.equal(health.metrics.find((m) => m.id === "fx-lookthrough"), undefined);
  assert.equal(health.lookThrough.needsInput[0].name, "WealthNavi");
});

test("中身を登録すると実質の外貨・株式が出る", () => {
  const health = analyzeAssetHealth(
    base({
      totalAssets: 10_000_000,
      holdings: [
        h({ source: "mf-auto", name: "みずほ銀行", category: "預金・現金", marketValue: 5_000_000 }),
        h({ source: "mf-auto", name: "WealthNavi", category: "投資信託", marketValue: 5_000_000 }),
      ],
      composition: { WealthNavi: { foreignPct: 80, equityPct: 70 } },
    })
  );
  assert.equal(health.lookThrough.coveragePct, 100);
  assert.equal(health.lookThrough.foreignValue, 4_000_000);
  assert.equal(health.lookThrough.equityValue, 3_500_000);
  const m = health.metrics.find((mm) => mm.id === "fx-lookthrough");
  assert.equal(m?.value, "40.0%");
});

test("個別株は中身の登録を求めない", () => {
  const health = analyzeAssetHealth(
    base({
      totalAssets: 2_000_000,
      holdings: [
        h({ source: "sbi-auto", name: "日本航空", category: "国内株式", currency: "JPY", marketValue: 1_000_000 }),
        h({ source: "sbi-foreign", name: "コカ-コーラ", category: "米国株", currency: "USD", marketValue: 10_000 }),
      ],
      fxRates: { USD: 100 },
    })
  );
  // どちらも自動で判定できるので入力は不要
  assert.equal(health.lookThrough.needsInput.length, 0);
  assert.equal(health.lookThrough.coveragePct, 100);
  // 株式は両方、外貨は米国株だけ
  assert.equal(health.lookThrough.equityValue, 2_000_000);
  assert.equal(health.lookThrough.foreignValue, 1_000_000);
});
