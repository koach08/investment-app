/**
 * 資産の「守り」診断 — AI に渡す前に、機械的に確定できる判断材料を算出する。
 *
 * 方針: 増やす話をする前に、まず「減らさない体力」がいくらあるかを数字で出す。
 * ここは純粋関数のみ。fetch も localStorage も触らない（テスト可能に保つ）。
 */

import { normalizeHoldings, toJpy, type FxRates } from "@/lib/fx";

export type Status = "good" | "warn" | "bad" | "unknown";
export type Horizon = "short" | "mid" | "long";

export interface HoldingLike {
  /** データの出所。口座残高レベルか銘柄レベルかの判定に使う */
  source?: string;
  code: string;
  name: string;
  category: string;
  currency: string;
  marketValue: number;
  pnl: number;
  pnlPercent: number;
}

export interface ManualAssetLike {
  name: string;
  category: string;
  amount: number;
  currency: string;
}

export interface TimelinePointLike {
  date: string;
  total: number;
  cash: number;
  margin: number;
  debt?: number;
}

export interface BreakdownItem {
  name: string;
  amount: number;
}

export interface HealthInput {
  /** MF 等から取れた総資産。無ければ証券合計にフォールバックさせて渡す */
  totalAssets: number;
  totalLiabilities: number;
  breakdown: BreakdownItem[];
  holdings: HoldingLike[];
  manualAssets: ManualAssetLike[];
  timeline: TimelinePointLike[];
  /** 生活費（月額・円）。未設定なら 0 を渡す */
  monthlyExpense: number;
  /** 為替レート。外貨建ての評価額を円に直すのに使う */
  fxRates?: FxRates;
  /** 生活防衛資金の目標月数。既定 6ヶ月 */
  targetCashMonths?: number;
}

export interface Metric {
  id: string;
  label: string;
  /** 表示用に整形済みの主数値 */
  value: string;
  /** 補足（内訳や実額） */
  detail?: string;
  status: Status;
  /** どういう基準でこの色にしたか */
  criterion: string;
  /** この数字が意味すること（守りの観点で一言） */
  meaning: string;
  horizons: Horizon[];
}

export interface StressScenario {
  id: string;
  label: string;
  /** 前提の説明 */
  assumption: string;
  /** 減る額（円・正の数） */
  loss: number;
  /** 残る総資産 */
  remaining: number;
  /** 総資産に対する下落率 */
  lossPct: number;
  /** 下落後、現金が生活費の何ヶ月分になるか（生活費未設定なら null） */
  monthsCoveredAfter: number | null;
}

export interface AssetBuckets {
  cash: number;
  funds: number;
  stocks: number;
  crypto: number;
  commodities: number;
  pension: number;
  insurance: number;
  points: number;
  realEstate: number;
  /** 証券口座の中身のうち、明細が取れていない分 */
  unclassified: number;
  other: number;
}

/** 集中度を測るための「1つの商品」単位。口座残高ではなく中身で数える */
export interface Position {
  key: string;
  name: string;
  value: number;
  bucket: keyof AssetBuckets;
  /** 明細が取れておらず、口座残高から逆算した枠かどうか */
  estimated: boolean;
}

export interface AssetHealth {
  totalAssets: number;
  totalLiabilities: number;
  netAssets: number;
  buckets: AssetBuckets;
  /** 値動きするもの（株式・投信・暗号資産）の合計 */
  riskAssets: number;
  riskAssetPct: number;
  cashPct: number;
  foreignPct: number;
  metrics: Metric[];
  stress: StressScenario[];
  /** 含み損を抱えた銘柄（損益通算の候補） */
  lossMakers: { code: string; name: string; pnl: number; pnlPercent: number }[];
  unrealizedLossTotal: number;
  unrealizedGainTotal: number;
  /** 実測の最大ドローダウン（資産推移データから） */
  maxDrawdown: { pct: number; amount: number; peakDate: string; troughDate: string } | null;
  /** 上位の集中ポジション（口座ではなく中身の単位） */
  topPositions: { name: string; value: number; pctOfTotal: number; estimated: boolean }[];
  /** 診断できなかった理由（データ不足など） */
  gaps: string[];
  /** 総合判定 */
  verdict: { status: Status; headline: string; summary: string };
}

const YEN = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const PCT = (n: number) => `${n.toFixed(1)}%`;

/** 口座残高レベルのデータ源。これらは資産全体を重複なく覆う */
const ACCOUNT_LEVEL_SOURCES = new Set(["mf-auto", "mf-account", "zaim-auto"]);

/** 名前・カテゴリ名をバケットに割り当てる。名前を優先して見る */
export function classifyBucket(name: string, category = ""): keyof AssetBuckets {
  for (const raw of [name, category]) {
    const n = raw.replace(/\s/g, "");
    if (!n) continue;
    if (/暗号資産|仮想通貨|ビットコイン|Coincheck|bitFlyer|BITMAX/i.test(n)) return "crypto";
    if (/貴金属|金・銀|ゴールド|プラチナ|地金|コモディティ/.test(n)) return "commodities";
    if (/ポイント|マイル|マイレージ|Suica|PASMO|プリペイド|電子マネー/i.test(n)) return "points";
    if (/年金|iDeCo|確定拠出/i.test(n)) return "pension";
    if (/保険/.test(n)) return "insurance";
    if (/不動産|住宅|土地/.test(n)) return "realEstate";
    if (/預金|現金|貯金|普通|定期|銀行|ゆうちょ|MRF|預り金/.test(n)) return "cash";
    if (/投資信託|ファンド|ETF|WealthNavi|ウェルスナビ|ラップ|つみたて|投信/i.test(n)) return "funds";
    if (/株式|米国株|国内株|外国株|ADR|株$/.test(n)) return "stocks";
  }
  return "other";
}

/** 証券口座そのものの残高行か（中身は別レイヤーの明細で持っている） */
export function isBrokerageAccount(name: string, category = ""): boolean {
  return /証券|ネオモバ|マネックス|松井|カブコム/.test(`${name}${category}`);
}

function emptyBuckets(): AssetBuckets {
  return {
    cash: 0, funds: 0, stocks: 0, crypto: 0, commodities: 0,
    pension: 0, insurance: 0, points: 0, realEstate: 0, unclassified: 0, other: 0,
  };
}

export interface BucketResult {
  buckets: AssetBuckets;
  positions: Position[];
  source: "account" | "instrument";
  notes: string[];
}

/**
 * 資産を重複なく積み上げる。
 *
 * 保有データは2層に分かれている:
 *   口座レベル（MF 同期）— 銀行・証券・暗号資産の口座残高。資産全体を覆う
 *   銘柄レベル（SBI 明細）— 証券口座の中身。口座レベルの一部と重なる
 * 両方を単純に足すと二重計上になるため、口座レベルを土台にして
 * 証券口座の中身だけを銘柄レベルで置き換える。
 */
export function buildBuckets(input: HealthInput): BucketResult {
  const notes: string[] = [];
  const buckets = emptyBuckets();
  const positions: Position[] = [];

  const accountRows = input.holdings.filter((h) => ACCOUNT_LEVEL_SOURCES.has(h.source ?? ""));
  const instrumentRows = input.holdings.filter((h) => !ACCOUNT_LEVEL_SOURCES.has(h.source ?? ""));

  const addPosition = (name: string, value: number, bucket: keyof AssetBuckets, estimated = false) => {
    if (value <= 0) return;
    if (bucket === "cash" || bucket === "points" || bucket === "pension" || bucket === "insurance") return;
    positions.push({ key: `${name}-${value}`, name, value, bucket, estimated });
  };

  if (accountRows.length > 0) {
    const brokerageRows = accountRows.filter((h) => isBrokerageAccount(h.name, h.category));
    const brokerageTotal = brokerageRows.reduce((s, h) => s + h.marketValue, 0);
    const instrumentTotal = instrumentRows.reduce((s, h) => s + h.marketValue, 0);

    // 証券口座以外の口座はそのまま計上
    for (const h of accountRows) {
      if (isBrokerageAccount(h.name, h.category)) continue;
      const b = classifyBucket(h.name, h.category);
      buckets[b] += h.marketValue;
      addPosition(h.name, h.marketValue, b);
    }

    if (instrumentTotal > brokerageTotal * 1.02 && brokerageTotal > 0) {
      // 明細の合計が口座残高を超えている。足すと膨らむので口座残高側を採用する
      buckets.unclassified += brokerageTotal;
      addPosition("証券口座（明細と残高が不一致）", brokerageTotal, "unclassified", true);
      notes.push(
        `証券口座の残高 ${YEN(brokerageTotal)} より明細の合計 ${YEN(instrumentTotal)} の方が大きいため、明細を使わず口座残高で計上しました。明細が重複している可能性があります。`
      );
    } else {
      for (const h of instrumentRows) {
        const b = classifyBucket(h.name, h.category);
        buckets[b] += h.marketValue;
        addPosition(h.name, h.marketValue, b);
      }
      const remainder = brokerageTotal - instrumentTotal;
      if (remainder > 0) {
        buckets.unclassified += remainder;
        addPosition("証券口座の内訳未取得分", remainder, "unclassified", true);
        if (brokerageTotal > 0 && remainder / brokerageTotal > 0.05) {
          notes.push(
            `証券口座 ${YEN(brokerageTotal)} のうち ${YEN(remainder)} は明細が取れていません。国内株や預り金が含まれている可能性があり、この分は値動きの有無を判定できません。`
          );
        }
      }
    }
  } else {
    for (const h of instrumentRows) {
      const b = classifyBucket(h.name, h.category);
      buckets[b] += h.marketValue;
      addPosition(h.name, h.marketValue, b);
    }
    notes.push("マネーフォワードの口座同期が無いため、証券口座と手動入力だけで判定しています。銀行預金が入っていないと現金比率が実態より低く出ます。");
  }

  for (const m of input.manualAssets) {
    const b = classifyBucket(m.name, m.category);
    buckets[b] += m.amount;
    addPosition(m.name, m.amount, b);
  }

  positions.sort((a, b) => b.value - a.value);
  return { buckets, positions, source: accountRows.length > 0 ? "account" : "instrument", notes };
}

/** 資産推移から実測の最大ドローダウンを取る */
export function computeMaxDrawdown(
  timeline: TimelinePointLike[],
  sinceMonths?: number
): AssetHealth["maxDrawdown"] {
  let source = timeline;
  if (sinceMonths && timeline.length > 0) {
    const sortedAll = [...timeline].sort((a, b) => a.date.localeCompare(b.date));
    const lastDate = new Date(sortedAll[sortedAll.length - 1].date.replace(/\//g, "-"));
    if (!Number.isNaN(lastDate.getTime())) {
      const cutoff = new Date(lastDate);
      cutoff.setMonth(cutoff.getMonth() - sinceMonths);
      source = sortedAll.filter((p) => {
        const d = new Date(p.date.replace(/\//g, "-"));
        return Number.isNaN(d.getTime()) ? false : d >= cutoff;
      });
    }
  }
  if (source.length < 3) return null;
  const sorted = [...source].sort((a, b) => a.date.localeCompare(b.date));
  let peak = sorted[0].total;
  let peakDate = sorted[0].date;
  let worst = { pct: 0, amount: 0, peakDate, troughDate: sorted[0].date };
  for (const p of sorted) {
    if (p.total > peak) {
      peak = p.total;
      peakDate = p.date;
    }
    if (peak > 0) {
      const drop = peak - p.total;
      const pct = (drop / peak) * 100;
      if (pct > worst.pct) worst = { pct, amount: drop, peakDate, troughDate: p.date };
    }
  }
  return worst.pct > 0 ? worst : null;
}

export function analyzeAssetHealth(rawInput: HealthInput): AssetHealth {
  const fxRates = rawInput.fxRates ?? {};
  const preGaps: string[] = [];

  // 外貨建ての評価額を円に揃える。ここを飛ばすと桁がずれたまま合算される
  const normalized = normalizeHoldings(rawInput.holdings, fxRates);
  if (normalized.unconverted.length > 0) {
    const names = normalized.unconverted.map((u) => `${u.name}(${u.currency})`).join(", ");
    preGaps.push(
      `為替レートが取れず円に換算できなかった保有が ${normalized.unconverted.length}件あります（${names}）。この分は診断から除いています。`
    );
  }
  const normalizedManual = rawInput.manualAssets.map((m) => {
    const amount = toJpy(m.amount, m.currency, fxRates);
    return amount === null ? null : { ...m, amount };
  });
  const droppedManual = normalizedManual.filter((m) => m === null).length;
  if (droppedManual > 0) {
    preGaps.push(`手動入力のうち ${droppedManual}件は為替レートが無く円に換算できないため、診断から除いています。`);
  }

  const input: HealthInput = {
    ...rawInput,
    holdings: normalized.rows,
    manualAssets: normalizedManual.filter((m): m is NonNullable<typeof m> => m !== null),
  };

  const foreignRows = normalized.rows.filter((h) => h.originalCurrency !== "JPY");

  const targetMonths = input.targetCashMonths ?? 6;
  const { buckets, positions, notes } = buildBuckets(input);
  const gaps: string[] = [...preGaps, ...notes];

  if (input.monthlyExpense <= 0) gaps.push("月の生活費が未設定です。生活防衛資金と下落後の耐久月数は判定できません。");
  if (input.timeline.length < 3) gaps.push("資産推移の記録が3点未満のため、実測の最大下落は出せません。");
  if (positions.length === 0) gaps.push("値動きする商品が1件も取り込まれていないため、集中度と下落耐性の判定ができません。");

  const bucketSum = Object.values(buckets).reduce((s, v) => s + v, 0);
  const totalAssets = input.totalAssets > 0 ? input.totalAssets : bucketSum;
  const totalLiabilities = input.totalLiabilities;
  const netAssets = totalAssets - totalLiabilities;

  if (totalAssets > 0 && bucketSum > 0 && Math.abs(bucketSum - totalAssets) / totalAssets > 0.05) {
    gaps.push(
      `内訳の合計 ${YEN(bucketSum)} と総資産 ${YEN(totalAssets)} が ${YEN(Math.abs(bucketSum - totalAssets))} ずれています。どちらかの取り込みが古いか、覆えていない口座があります。`
    );
  }

  // 値動きするもの。内訳未取得の証券口座分も、動く前提で数える
  const riskAssets = buckets.stocks + buckets.funds + buckets.crypto + buckets.commodities + buckets.unclassified;
  const riskAssetPct = totalAssets > 0 ? (riskAssets / totalAssets) * 100 : 0;
  const cashPct = totalAssets > 0 ? (buckets.cash / totalAssets) * 100 : 0;

  // 外貨エクスポージャー（銘柄レベルの通貨と手動入力から）
  const foreignValue =
    foreignRows.reduce((s, h) => s + h.marketValue, 0) +
    input.manualAssets.filter((m) => m.currency && m.currency.toUpperCase() !== "JPY").reduce((s, m) => s + m.amount, 0);
  const foreignPct = totalAssets > 0 ? (foreignValue / totalAssets) * 100 : 0;
  // 投信・ラップ・内訳未取得分は中身の通貨が分からない
  const fxOpaque = buckets.funds + buckets.unclassified;
  if (fxOpaque > totalAssets * 0.2) {
    gaps.push(
      `投信・ラップ・内訳未取得の ${YEN(fxOpaque)} は中身の通貨が分かりません。実際の外貨比率はここに出ている数字よりかなり高い可能性があります。`
    );
  }

  // 集中度（口座ではなく商品の単位。内訳不明の推定枠は分子から外す）
  const realPositions = positions.filter((p) => !p.estimated);
  const estimatedTotal = positions.filter((p) => p.estimated).reduce((s, p) => s + p.value, 0);
  const topPositions = positions.slice(0, 6).map((p) => ({
    name: p.name,
    value: p.value,
    pctOfTotal: totalAssets > 0 ? (p.value / totalAssets) * 100 : 0,
    estimated: p.estimated,
  }));
  const pctOf = (v: number) => (totalAssets > 0 ? (v / totalAssets) * 100 : 0);
  const topPct = realPositions.length > 0 ? pctOf(realPositions[0].value) : 0;
  const top3Pct = realPositions.slice(0, 3).reduce((s, p) => s + pctOf(p.value), 0);
  if (estimatedTotal > 0) {
    gaps.push(
      `集中度の計算からは、内訳が取れていない ${YEN(estimatedTotal)} を除いています。この中に大きな一銘柄が入っていれば、実際の集中度はここに出ている数字より高くなります。`
    );
  }

  // 含み損益（銘柄レベルのみ。口座残高行には損益が無い）
  const pnlRows = input.holdings.filter((h) => h.pnl !== 0);
  const lossMakers = pnlRows
    .filter((h) => h.pnl < 0)
    .sort((a, b) => a.pnl - b.pnl)
    .map((h) => ({ code: h.code, name: h.name, pnl: h.pnl, pnlPercent: h.pnlPercent }));
  const unrealizedLossTotal = lossMakers.reduce((s, h) => s + h.pnl, 0);
  const unrealizedGainTotal = pnlRows.filter((h) => h.pnl > 0).reduce((s, h) => s + h.pnl, 0);

  const maxDrawdown = computeMaxDrawdown(input.timeline, 36) ?? computeMaxDrawdown(input.timeline);
  const allTimeDrawdown = computeMaxDrawdown(input.timeline);
  if (maxDrawdown) {
    gaps.push("資産推移には入出金も含まれます。実測の最大下落には、相場以外の理由で資産が動いた分も混ざっています。");
  }

  const monthsCovered = input.monthlyExpense > 0 ? buckets.cash / input.monthlyExpense : null;

  const metrics: Metric[] = [];

  metrics.push({
    id: "emergency-fund",
    label: "生活防衛資金",
    value: monthsCovered === null ? "未設定" : `${monthsCovered.toFixed(1)}ヶ月分`,
    detail: monthsCovered === null
      ? "月の生活費を入力すると判定できます"
      : `現金 ${YEN(buckets.cash)} ÷ 生活費 ${YEN(input.monthlyExpense)}/月`,
    status: monthsCovered === null ? "unknown" : monthsCovered >= targetMonths ? "good" : monthsCovered >= 3 ? "warn" : "bad",
    criterion: `${targetMonths}ヶ月以上で緑、3ヶ月未満で赤`,
    meaning: "相場が下がったときに、投資分を売らずに耐えられる期間。ここが薄いと、いちばん売ってはいけない場面で売ることになる。",
    horizons: ["short"],
  });

  metrics.push({
    id: "risk-ratio",
    label: "リスク資産比率",
    value: PCT(riskAssetPct),
    detail: `投信 ${YEN(buckets.funds)} / 株式 ${YEN(buckets.stocks)} / 暗号資産 ${YEN(buckets.crypto)} / 貴金属 ${YEN(buckets.commodities)}${buckets.unclassified > 0 ? ` / 内訳未取得 ${YEN(buckets.unclassified)}` : ""}`,
    status: riskAssetPct > 80 ? "bad" : riskAssetPct > 65 ? "warn" : riskAssetPct < 15 ? "warn" : "good",
    criterion: "80%超は赤（守りが薄い）、15%未満も黄（増えない）",
    meaning: "値動きするものが総資産の何割か。高いほど増えるが、下げも同じ倍率で来る。",
    horizons: ["short", "mid", "long"],
  });

  metrics.push({
    id: "cash-ratio",
    label: "現金比率",
    value: PCT(cashPct),
    detail: YEN(buckets.cash),
    status: cashPct < 10 ? "bad" : cashPct < 20 ? "warn" : cashPct > 70 ? "warn" : "good",
    criterion: "10%未満は赤、70%超も黄（インフレで目減り）",
    meaning: "下落時の買い増し余力でもある。多すぎると円のまま価値が減る。",
    horizons: ["short", "mid"],
  });

  metrics.push({
    id: "concentration",
    label: "最大ポジションの集中度",
    value: realPositions.length === 0 ? "判定不可" : PCT(topPct),
    detail: realPositions[0] ? `${realPositions[0].name} ${YEN(realPositions[0].value)}` : undefined,
    status: realPositions.length === 0 ? "unknown" : topPct > 20 ? "bad" : topPct > 10 ? "warn" : "good",
    criterion: "総資産の20%超で赤、10%超で黄",
    meaning: "1つの商品が崩れたときに資産全体がどれだけ削られるか。守りでいちばん効くのがここ。",
    horizons: ["short", "mid", "long"],
  });

  metrics.push({
    id: "concentration-top3",
    label: "上位3ポジションの集中度",
    value: realPositions.length === 0 ? "判定不可" : PCT(top3Pct),
    detail: realPositions.slice(0, 3).map((p) => `${p.name} ${PCT(pctOf(p.value))}`).join(" / ") || undefined,
    status: realPositions.length === 0 ? "unknown" : top3Pct > 45 ? "bad" : top3Pct > 30 ? "warn" : "good",
    criterion: "45%超で赤、30%超で黄",
    meaning: "同じ方向に動く3つに寄っていると、分散しているつもりで分散できていない。",
    horizons: ["mid", "long"],
  });

  metrics.push({
    id: "fx-exposure",
    label: "外貨エクスポージャー（直接保有分）",
    value: positions.length === 0 ? "判定不可" : PCT(foreignPct),
    detail:
      `外貨建ての直接保有 ${YEN(foreignValue)}（円が10%高くなると ${YEN(foreignValue * 0.1)} 目減り）` +
      (fxOpaque > 0 ? ` / 中身が見えない投信・未取得分 ${YEN(fxOpaque)} は含みません` : ""),
    status:
      positions.length === 0
        ? "unknown"
        : fxOpaque > totalAssets * 0.2
          ? "unknown"
          : foreignPct > 60
            ? "warn"
            : foreignPct < 10
              ? "warn"
              : "good",
    criterion: "60%超は為替に賭けすぎ、10%未満は円に賭けすぎ",
    meaning: "生活費は円で出ていく。円高が来たときに家計と資産が同時に痛まないかを見る。円建ての投信でも中身が外国株なら実際の外貨比率はこれより高い。",
    horizons: ["mid", "long"],
  });

  const leverage = netAssets > 0 ? (totalLiabilities / netAssets) * 100 : 0;
  metrics.push({
    id: "liabilities",
    label: "負債比率",
    value: PCT(leverage),
    detail: `負債 ${YEN(totalLiabilities)} / 純資産 ${YEN(netAssets)}`,
    status: leverage > 30 ? "bad" : leverage > 15 ? "warn" : "good",
    criterion: "純資産比30%超で赤、15%超で黄",
    meaning: "カード残高を含めた負債。相場と関係なく毎月出ていくので、守りの前提として先に潰す対象。",
    horizons: ["short"],
  });

  metrics.push({
    id: "max-drawdown",
    label: "実測の最大下落（直近3年）",
    value: maxDrawdown ? PCT(maxDrawdown.pct) : "データ不足",
    detail: maxDrawdown
      ? `${maxDrawdown.peakDate} → ${maxDrawdown.troughDate} で ${YEN(maxDrawdown.amount)} 減（入出金を含む）` +
        (allTimeDrawdown && allTimeDrawdown.pct > maxDrawdown.pct + 0.5
          ? ` / 全期間では ${PCT(allTimeDrawdown.pct)}（${allTimeDrawdown.peakDate}→${allTimeDrawdown.troughDate}）`
          : "")
      : undefined,
    status: maxDrawdown === null ? "unknown" : maxDrawdown.pct > 25 ? "bad" : maxDrawdown.pct > 15 ? "warn" : "good",
    criterion: "25%超で赤、15%超で黄",
    meaning: "この資産で実際に起きた減り幅。相場以外の理由も混ざるが、体感として耐えた幅の目安になる。",
    horizons: ["short", "mid"],
  });

  if (pnlRows.length > 0) {
    metrics.push({
      id: "unrealized-loss",
      label: "含み損の合計",
      value: YEN(Math.abs(unrealizedLossTotal)),
      detail: `${lossMakers.length}銘柄が含み損 / 含み益は ${YEN(unrealizedGainTotal)}`,
      status: unrealizedGainTotal + unrealizedLossTotal < 0 ? "warn" : "good",
      criterion: "含み益と相殺してマイナスなら黄",
      meaning: "年末までなら、含み損を確定させて含み益と損益通算し、税金を減らせる余地がある。",
      horizons: ["short"],
    });
  }

  // ストレスシナリオ
  const stress: StressScenario[] = [];
  const mkStress = (id: string, label: string, assumption: string, loss: number): StressScenario => ({
    id,
    label,
    assumption,
    loss,
    remaining: totalAssets - loss,
    lossPct: totalAssets > 0 ? (loss / totalAssets) * 100 : 0,
    monthsCoveredAfter: input.monthlyExpense > 0 ? buckets.cash / input.monthlyExpense : null,
  });

  for (const drop of [10, 20, 30]) {
    stress.push(
      mkStress(
        `equity-${drop}`,
        `値動きする資産が ${drop}% 下がる`,
        `${YEN(riskAssets)} が一律 ${drop}% 下落。現金・年金・保険・ポイントは据え置き。`,
        riskAssets * (drop / 100)
      )
    );
  }
  if (foreignValue > 0) {
    stress.push(
      mkStress(
        "fx-10",
        "円が 10% 高くなる",
        `外貨建て資産 ${YEN(foreignValue)} の円換算が 10% 目減り。価格自体は変わらないと仮定。`,
        foreignValue * 0.1
      )
    );
  }
  stress.push(
    mkStress(
      "combo",
      "下落20% と 円高10% が同時に来る",
      "2020年3月や2008年に近い形。値動き資産が20%下げ、同時に円高が10%進む。",
      riskAssets * 0.2 + foreignValue * 0.1 * 0.8
    )
  );

  const bad = metrics.filter((m) => m.status === "bad").length;
  const warn = metrics.filter((m) => m.status === "warn").length;
  let verdict: AssetHealth["verdict"];
  if (metrics.every((m) => m.status === "unknown")) {
    verdict = {
      status: "unknown",
      headline: "判定に必要なデータが足りません",
      summary: "MF 同期か CSV 取り込みを行い、月の生活費を入力すると診断できます。",
    };
  } else if (bad >= 2) {
    verdict = {
      status: "bad",
      headline: "増やす前に、まず穴を塞ぐ段階",
      summary: `赤が${bad}件あります。この状態で新しく買い増すと、下げが来たときに投資分を取り崩すことになります。赤の項目から順に潰すのが先です。`,
    };
  } else if (bad === 1 || warn >= 3) {
    verdict = {
      status: "warn",
      headline: "守りは概ね立っているが、寄りがある",
      summary: `赤${bad}件・黄${warn}件。致命的ではないものの、偏っている箇所があります。買い増すなら、まずその偏りを薄める方向で。`,
    };
  } else {
    verdict = {
      status: "good",
      headline: "守りは立っている。増やす話をしてよい段階",
      summary: `赤なし・黄${warn}件。生活防衛資金と分散が確保できているので、余剰の範囲で中長期の積み増しを検討できます。`,
    };
  }

  return {
    totalAssets,
    totalLiabilities,
    netAssets,
    buckets,
    riskAssets,
    riskAssetPct,
    cashPct,
    foreignPct,
    metrics,
    stress,
    lossMakers: lossMakers.slice(0, 10),
    unrealizedLossTotal,
    unrealizedGainTotal,
    maxDrawdown,
    topPositions,
    gaps,
    verdict,
  };
}

/** AI に渡すためのテキスト要約（JSON をそのまま投げるより読み違いが減る） */
export function healthToBriefing(h: AssetHealth, monthlyExpense: number): string {
  const lines: string[] = [];
  lines.push(`## 資産の現況（アプリが実データから算出。ここが唯一の正）`);
  lines.push(`- 総資産: ${YEN(h.totalAssets)} / 負債: ${YEN(h.totalLiabilities)} / 純資産: ${YEN(h.netAssets)}`);
  lines.push(`- 内訳: 現金 ${YEN(h.buckets.cash)}(${PCT(h.cashPct)}) / 投信 ${YEN(h.buckets.funds)} / 株式 ${YEN(h.buckets.stocks)} / 暗号資産 ${YEN(h.buckets.crypto)} / 貴金属 ${YEN(h.buckets.commodities)} / 年金 ${YEN(h.buckets.pension)} / 保険 ${YEN(h.buckets.insurance)} / ポイント ${YEN(h.buckets.points)} / 証券口座の内訳未取得 ${YEN(h.buckets.unclassified)} / その他 ${YEN(h.buckets.other)}`);
  lines.push(`- 値動きする資産の合計: ${YEN(h.riskAssets)}（総資産の ${PCT(h.riskAssetPct)}）`);
  lines.push(`- 外貨エクスポージャー: ${PCT(h.foreignPct)}`);
  if (monthlyExpense > 0) lines.push(`- 月の生活費: ${YEN(monthlyExpense)}`);

  lines.push(`\n## 守りの診断結果`);
  for (const m of h.metrics) {
    const mark = m.status === "good" ? "OK" : m.status === "warn" ? "注意" : m.status === "bad" ? "要対処" : "判定不可";
    lines.push(`- [${mark}] ${m.label}: ${m.value}${m.detail ? `（${m.detail}）` : ""} — 基準: ${m.criterion}`);
  }

  if (h.topPositions.length > 0) {
    lines.push(`\n## 上位ポジション（総資産比。口座単位ではなく中身の単位）`);
    for (const t of h.topPositions) {
      lines.push(`- ${t.name}: ${YEN(t.value)} / ${PCT(t.pctOfTotal)}${t.estimated ? "（口座残高から逆算した推定枠）" : ""}`);
    }
  }

  if (h.lossMakers.length > 0) {
    lines.push(`\n## 含み損の銘柄（損益通算の候補）`);
    for (const l of h.lossMakers) lines.push(`- ${l.name}(${l.code}): ${YEN(l.pnl)}（${l.pnlPercent.toFixed(1)}%）`);
    lines.push(`- 含み損合計 ${YEN(h.unrealizedLossTotal)} / 含み益合計 ${YEN(h.unrealizedGainTotal)}`);
  }

  lines.push(`\n## ストレスシナリオ（アプリ算出）`);
  for (const s of h.stress) {
    lines.push(`- ${s.label}: ${YEN(s.loss)} 減（総資産の ${PCT(s.lossPct)}）→ 残り ${YEN(s.remaining)}`);
  }

  if (h.maxDrawdown) {
    lines.push(`\n- 実測の最大下落: ${PCT(h.maxDrawdown.pct)}（${h.maxDrawdown.peakDate} → ${h.maxDrawdown.troughDate}、${YEN(h.maxDrawdown.amount)}）`);
  }

  if (h.gaps.length > 0) {
    lines.push(`\n## データの欠け（推測で埋めないこと）`);
    for (const g of h.gaps) lines.push(`- ${g}`);
  }

  return lines.join("\n");
}
