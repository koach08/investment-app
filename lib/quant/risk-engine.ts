import type { MarketRegime, OHLCVBar, QuantAction } from "./types";
import { atr, sma } from "../indicators";

export type RiskGate = "TRADEABLE" | "REDUCE_SIZE" | "AVOID";

export interface InstitutionalRiskReport {
  gate: RiskGate;
  riskScore: number;
  annualizedVolatilityPercent: number;
  valueAtRisk95Percent: number;
  conditionalVaR95Percent: number;
  maxDrawdownPercent: number;
  atrPercent: number;
  liquidityScore: number;
  trendQuality: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  suggestedPositionPercent: number;
  maxLossAtSuggestedSizePercent: number;
  killSwitch: boolean;
  warnings: string[];
}

export interface RiskInput {
  bars: OHLCVBar[];
  action: QuantAction | "MARGIN_LONG" | "MARGIN_SHORT" | "DCA" | "TRIM" | "EXIT";
  regime?: MarketRegime;
  confidence?: number;
  accountRiskBudgetPercent?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.floor((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[idx];
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function maxDrawdown(closes: number[]): number {
  let peak = closes[0] ?? 0;
  let maxDd = 0;
  for (const close of closes) {
    peak = Math.max(peak, close);
    if (peak > 0) maxDd = Math.min(maxDd, (close - peak) / peak);
  }
  return Math.abs(maxDd) * 100;
}

function latestATRPercent(bars: OHLCVBar[]): number {
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const closes = bars.map((b) => b.close);
  const atrValues = atr(highs, lows, closes, 14);
  const latestAtr = [...atrValues].reverse().find((value): value is number => value !== null) ?? 0;
  const price = closes[closes.length - 1] ?? 0;
  return price > 0 ? (latestAtr / price) * 100 : 0;
}

function trendQuality(closes: number[]): number {
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const latest20 = sma20[sma20.length - 1];
  const latest50 = sma50[sma50.length - 1];
  const previous20 = sma20[sma20.length - 11];
  if (latest20 === null || latest50 === null || previous20 === null || !latest20 || !previous20) return 50;
  const spread = ((latest20 - latest50) / latest50) * 100;
  const slope = ((latest20 - previous20) / previous20) * 100;
  return Math.round(clamp(50 + spread * 6 + slope * 8, 0, 100));
}

function liquidityScore(bars: OHLCVBar[]): number {
  const recent = bars.slice(-20).filter((b) => b.volume > 0);
  if (recent.length < 10) return 45;
  const turnover = recent.map((b) => b.close * b.volume);
  const avgTurnover = turnover.reduce((sum, value) => sum + value, 0) / turnover.length;
  const score = 25 + Math.log10(Math.max(avgTurnover, 1)) * 8;
  return Math.round(clamp(score, 0, 100));
}

export function assessInstitutionalRisk(input: RiskInput): InstitutionalRiskReport {
  const { bars, action, regime, confidence = 50, accountRiskBudgetPercent = 0.65 } = input;
  const closes = bars.map((b) => b.close).filter((value) => Number.isFinite(value) && value > 0);
  const price = closes[closes.length - 1] ?? 0;
  const returns = closes.slice(1).map((close, index) => ((close - closes[index]) / closes[index]) * 100);
  const downsideReturns = returns.filter((value) => value < 0);

  const dailyVol = stdev(returns);
  const annualizedVolatilityPercent = dailyVol * Math.sqrt(252);
  const valueAtRisk95Percent = Math.abs(percentile(returns, 0.05));
  const tail = downsideReturns.filter((value) => value <= -valueAtRisk95Percent);
  const conditionalVaR95Percent = Math.abs(
    tail.length > 0 ? tail.reduce((sum, value) => sum + value, 0) / tail.length : -valueAtRisk95Percent
  );
  const maxDrawdownPercent = maxDrawdown(closes);
  const atrPercent = latestATRPercent(bars);
  const liq = liquidityScore(bars);
  const trend = trendQuality(closes);

  const riskPenalty =
    annualizedVolatilityPercent * 0.55 +
    conditionalVaR95Percent * 4 +
    maxDrawdownPercent * 0.55 +
    Math.max(0, 55 - liq) * 0.5 +
    (regime === "VOLATILE" ? 18 : 0) +
    (regime === "TRENDING_DOWN" && action !== "SELL" && action !== "MARGIN_SHORT" ? 12 : 0);
  const convictionBoost = clamp(confidence - 50, 0, 45) * 0.45;
  const riskScore = Math.round(clamp(100 - riskPenalty + convictionBoost, 0, 100));

  const stopDistancePercent = Math.max(atrPercent * 1.6, conditionalVaR95Percent * 0.8, 1.8);
  const direction = action === "SELL" || action === "MARGIN_SHORT" || action === "TRIM" || action === "EXIT" ? -1 : 1;
  const canEnter = action !== "HOLD" && action !== "TRIM" && action !== "EXIT";
  const stopLossPrice = canEnter && price > 0 ? price * (1 - direction * stopDistancePercent / 100) : undefined;
  const takeProfitPrice = canEnter && price > 0 ? price * (1 + direction * stopDistancePercent * 1.8 / 100) : undefined;

  const rawSize = stopDistancePercent > 0 ? accountRiskBudgetPercent / stopDistancePercent * 100 : 0;
  const confidenceScaler = clamp(confidence / 100, 0.25, 0.9);
  const regimeScaler = regime === "VOLATILE" ? 0.45 : regime === "TRENDING_DOWN" && direction > 0 ? 0.55 : 1;
  const actionCap = action === "MARGIN_LONG" || action === "MARGIN_SHORT" ? 5 : action === "DCA" ? 12 : 15;
  const suggestedPositionPercent = canEnter
    ? Number(clamp(rawSize * confidenceScaler * regimeScaler, 0, actionCap).toFixed(2))
    : 0;
  const maxLossAtSuggestedSizePercent = Number(((suggestedPositionPercent * stopDistancePercent) / 100).toFixed(2));

  const warnings: string[] = [];
  if (annualizedVolatilityPercent > 55) warnings.push("年率ボラが高く、通常より小さいサイズが必要");
  if (conditionalVaR95Percent > 5) warnings.push("左側テールが厚い。急落時の損失が想定より膨らみやすい");
  if (maxDrawdownPercent > 30) warnings.push("過去1年の最大ドローダウンが大きい");
  if (liq < 45) warnings.push("出来高・売買代金が薄く、約定品質に注意");
  if (regime === "VOLATILE") warnings.push("市場レジームが高ボラ。新規エントリーは縮小");
  if (action === "BUY" && regime === "TRENDING_DOWN") warnings.push("下降レジームでの買い。反転確認まで待機を優先");

  const killSwitch = riskScore < 30 || conditionalVaR95Percent > 8 || annualizedVolatilityPercent > 85;
  const gate: RiskGate = killSwitch ? "AVOID" : riskScore < 55 || warnings.length >= 2 ? "REDUCE_SIZE" : "TRADEABLE";

  return {
    gate,
    riskScore,
    annualizedVolatilityPercent: Number(annualizedVolatilityPercent.toFixed(2)),
    valueAtRisk95Percent: Number(valueAtRisk95Percent.toFixed(2)),
    conditionalVaR95Percent: Number(conditionalVaR95Percent.toFixed(2)),
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
    atrPercent: Number(atrPercent.toFixed(2)),
    liquidityScore: liq,
    trendQuality: trend,
    stopLossPrice: stopLossPrice ? Number(stopLossPrice.toFixed(2)) : undefined,
    takeProfitPrice: takeProfitPrice ? Number(takeProfitPrice.toFixed(2)) : undefined,
    suggestedPositionPercent,
    maxLossAtSuggestedSizePercent,
    killSwitch,
    warnings,
  };
}
