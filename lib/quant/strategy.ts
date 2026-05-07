import type { OHLCVBar, QuantAnalysis, RegimeAnalysis, StrategyProposal } from "./types";
import { atr } from "../indicators";

interface StrategyContext {
  bars: OHLCVBar[];
  analysis: QuantAnalysis;
  regime: RegimeAnalysis;
  isHolding?: boolean;
  avgPrice?: number;
  pnlPercent?: number;
}

// SBI証券 想定取引コスト（roundtrip = 往復, %）
// Source: SBI証券公開料金 (2026年5月時点想定)
const COST_BY_HORIZON: Record<string, { roundtrip: number; breakdown: string }> = {
  // 信用買・信用売: 株式手数料0% + 金利2.8%/年 + 貸株料1.15%/年（売建のみ）
  // 平均保有10日として、金利・貸株料を日割りで概算
  MARGIN_SHORT: { roundtrip: 0.15, breakdown: "信用売: 売買手数料0% + 金利・貸株料 約0.15% (10日保有想定)" },
  MARGIN_LONG: { roundtrip: 0.10, breakdown: "信用買: 売買手数料0% + 金利 約0.10% (10日保有想定)" },
  // 現物: アクティブプラン100万円まで無料、それ超は約0.5%
  BUY: { roundtrip: 0.05, breakdown: "現物 (ゼロ革命): 100万円まで無料、超過分にスプレッド込み概算" },
  SELL: { roundtrip: 0.05, breakdown: "現物売: ゼロ革命 + スプレッド" },
  TRIM: { roundtrip: 0.05, breakdown: "現物売 (部分): ゼロ革命 + スプレッド" },
  EXIT: { roundtrip: 0.10, breakdown: "段階売却: ゼロ革命 + スプレッド (3回想定)" },
  // DCA: 売却を伴わない。コストは購入時のスプレッドのみ
  DCA: { roundtrip: 0.02, breakdown: "DCA積立: 売買手数料0% + わずかなスプレッド" },
  HOLD: { roundtrip: 0, breakdown: "取引なし" },
};

function estimateCost(action: string, takeProfit?: number, stopLoss?: number, entryPrice?: number) {
  const cost = COST_BY_HORIZON[action] ?? COST_BY_HORIZON.HOLD;
  if (!takeProfit || !entryPrice || takeProfit === entryPrice) {
    return {
      roundtripCostPercent: cost.roundtrip,
      grossReturnPercent: 0,
      netReturnPercent: -cost.roundtrip,
      breakdown: cost.breakdown,
    };
  }
  const direction = action === "MARGIN_SHORT" ? -1 : 1;
  const grossReturn = ((takeProfit - entryPrice) / entryPrice) * 100 * direction;
  return {
    roundtripCostPercent: cost.roundtrip,
    grossReturnPercent: Number(grossReturn.toFixed(2)),
    netReturnPercent: Number((grossReturn - cost.roundtrip).toFixed(2)),
    breakdown: cost.breakdown,
  };
}

function lastATR(bars: OHLCVBar[]): number {
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const closes = bars.map((b) => b.close);
  const atrVals = atr(highs, lows, closes, 14);
  for (let i = atrVals.length - 1; i >= 0; i--) {
    const v = atrVals[i];
    if (v !== null) return v;
  }
  return 0;
}

function roundPrice(p: number): number {
  if (p > 10000) return Math.round(p / 10) * 10;
  if (p > 1000) return Math.round(p);
  return Math.round(p * 10) / 10;
}

export function buildStrategies(ctx: StrategyContext): StrategyProposal[] {
  const { analysis, regime, bars, isHolding, pnlPercent } = ctx;
  const price = analysis.price;
  const atrValue = lastATR(bars);
  const atrPct = price > 0 ? (atrValue / price) * 100 : 0;

  const proposals: StrategyProposal[] = [];

  // ─────── 短期（信用売買含む、1〜10営業日） ───────
  const shortLabel = "短期 (1〜10営業日)";
  if (analysis.compositeScore <= -40 && regime.regime !== "TRENDING_UP") {
    proposals.push({
      horizon: "SHORT",
      label: shortLabel,
      action: "MARGIN_SHORT",
      rationale: `クオンツ${analysis.compositeScore}pt + ${regime.regime}。短期反落の確率高い。信用売建で取りにいく。`,
      entryHint: { type: "limit", price: roundPrice(price) },
      exitHint: {
        takeProfit: roundPrice(price - atrValue * 2),
        stopLoss: roundPrice(price + atrValue * 1.5),
      },
      sizing: "ポジション小さめ (口座の5%以内)、信用建玉",
      notes: ["逆日歩・貸株料に注意", "急反発で損切ライン即執行"],
    });
  } else if (analysis.compositeScore >= 40 && regime.regime !== "TRENDING_DOWN") {
    proposals.push({
      horizon: "SHORT",
      label: shortLabel,
      action: "MARGIN_LONG",
      rationale: `クオンツ${analysis.compositeScore}pt + ${regime.regime}。短期上昇の確率高い。信用買で取りにいく。`,
      entryHint: { type: "limit", price: roundPrice(price) },
      exitHint: {
        takeProfit: roundPrice(price + atrValue * 2),
        stopLoss: roundPrice(price - atrValue * 1.5),
      },
      sizing: "ポジション小さめ (口座の5%以内)、信用建玉",
      notes: ["金利コストに注意", "目標到達で機械的に利確"],
    });
  } else if (atrPct > 4) {
    proposals.push({
      horizon: "SHORT",
      label: shortLabel,
      action: "HOLD",
      rationale: `ATR ${atrPct.toFixed(1)}%の高ボラ。短期は手を出さず様子見。`,
      sizing: "見送り",
      notes: ["ボラ収束まで待機"],
    });
  } else {
    proposals.push({
      horizon: "SHORT",
      label: shortLabel,
      action: "HOLD",
      rationale: `クオンツ${analysis.compositeScore}pt、レジーム${regime.regime}。短期エッジなし。`,
      sizing: "見送り",
    });
  }

  // ─────── 中期（数週間〜2ヶ月） ───────
  const midLabel = "中期 (2週〜2ヶ月)";
  if (regime.regime === "TRENDING_UP" && analysis.compositeScore >= 20) {
    proposals.push({
      horizon: "MID",
      label: midLabel,
      action: "BUY",
      rationale: `上昇トレンド継続中。クオンツも${analysis.compositeScore}ptで買いシグナル。押し目で拾う。`,
      entryHint: { type: "limit", price: roundPrice(price - atrValue * 0.5) },
      exitHint: {
        takeProfit: roundPrice(price + atrValue * 4),
        stopLoss: roundPrice(price - atrValue * 2.5),
      },
      sizing: "口座の10〜15%",
      notes: ["SMA50を割ったらトレンド転換と判断", "決算前に部分利確"],
    });
  } else if (regime.regime === "TRENDING_DOWN" && analysis.compositeScore <= -20) {
    if (isHolding) {
      proposals.push({
        horizon: "MID",
        label: midLabel,
        action: "TRIM",
        rationale: `下降トレンド + クオンツ${analysis.compositeScore}pt。中期で含み損拡大リスク。半分利確 or 損切。`,
        sizing: `保有数量の50%を売却${pnlPercent !== undefined ? `（現在 ${pnlPercent.toFixed(1)}%）` : ""}`,
      });
    } else {
      proposals.push({
        horizon: "MID",
        label: midLabel,
        action: "HOLD",
        rationale: `下降トレンド。中期では新規買い見送り。底値確認まで待機。`,
        sizing: "新規エントリー見送り",
      });
    }
  } else if (regime.regime === "RANGING") {
    proposals.push({
      horizon: "MID",
      label: midLabel,
      action: "HOLD",
      rationale: `レンジ相場。中期トレンド戦略は機能しない。レンジ下限のみ買い検討。`,
      entryHint: { type: "limit", price: roundPrice(price - atrValue * 1.5) },
      sizing: "レンジ下限指値、ヒットしなければスキップ",
    });
  } else {
    proposals.push({
      horizon: "MID",
      label: midLabel,
      action: "HOLD",
      rationale: `${regime.regime} + クオンツ${analysis.compositeScore}pt。中期では明確なエッジなし。`,
    });
  }

  // ─────── 長期（半年以上、積立向き） ───────
  const longLabel = "長期 (6ヶ月以上)";
  if (analysis.compositeScore >= 0 && regime.regime !== "TRENDING_DOWN") {
    proposals.push({
      horizon: "LONG",
      label: longLabel,
      action: "DCA",
      rationale: `長期視点ではトレンド・クオンツとも悪くない。定額積立 (DCA) でポジション構築。`,
      sizing: "月1回 / 四半期1回の定額買付",
      notes: ["短期の値動きは気にしない", "決算でテーゼ崩壊なければ継続"],
    });
  } else if (regime.regime === "TRENDING_DOWN" && analysis.compositeScore <= -40) {
    if (isHolding && (pnlPercent ?? 0) < -15) {
      proposals.push({
        horizon: "LONG",
        label: longLabel,
        action: "EXIT",
        rationale: `下降トレンド + 含み損${pnlPercent?.toFixed(1)}%。テーゼ崩壊の可能性あり。長期も撤退検討。`,
        sizing: "段階的に全売却（3回に分けて）",
      });
    } else {
      proposals.push({
        horizon: "LONG",
        label: longLabel,
        action: "HOLD",
        rationale: `下降トレンド。長期積立は底打ち確認後に再開。`,
        sizing: "積立一時停止、現金温存",
      });
    }
  } else {
    proposals.push({
      horizon: "LONG",
      label: longLabel,
      action: "DCA",
      rationale: `中立シグナル。長期視点では時間分散でリスク低減。`,
      sizing: "通常通りの定額積立を継続",
    });
  }

  // 各提案に SBI 想定コスト・期待リターン (net) を付与
  for (const p of proposals) {
    p.costEstimate = estimateCost(
      p.action,
      p.exitHint?.takeProfit,
      p.exitHint?.stopLoss,
      p.entryHint?.price ?? price
    );
  }

  return proposals;
}
