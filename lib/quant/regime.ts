import { sma, atr } from "../indicators";
import type { OHLCVBar, RegimeAnalysis } from "./types";

export function detectRegime(bars: OHLCVBar[]): RegimeAnalysis {
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);

  if (closes.length < 50) {
    return {
      regime: "RANGING",
      score: 0,
      confidence: 0,
      reason: "データ不足（50本未満）",
      factors: {
        sma20: 0,
        sma50: 0,
        sma200: 0,
        slopePercent20: 0,
        atrPercent: 0,
        rangeWidthPercent: 0,
      },
    };
  }

  const sma20Vals = sma(closes, 20);
  const sma50Vals = sma(closes, 50);
  const sma200Vals = sma(closes, Math.min(200, closes.length - 1));
  const atrVals = atr(highs, lows, closes, 14);

  const sma20 = sma20Vals[sma20Vals.length - 1] ?? closes[closes.length - 1];
  const sma50 = sma50Vals[sma50Vals.length - 1] ?? closes[closes.length - 1];
  const sma200 = sma200Vals[sma200Vals.length - 1] ?? sma50;
  const sma20Prev10 = sma20Vals[sma20Vals.length - 10] ?? sma20;
  const currentATR = atrVals[atrVals.length - 1] ?? 0;
  const price = closes[closes.length - 1];

  const slopePercent20 = ((sma20 - sma20Prev10) / sma20Prev10) * 100;
  const atrPercent = (currentATR / price) * 100;

  const recent = closes.slice(-30);
  const high30 = Math.max(...recent);
  const low30 = Math.min(...recent);
  const rangeWidthPercent = ((high30 - low30) / low30) * 100;

  let regime: RegimeAnalysis["regime"];
  let score = 0;
  let reason = "";

  if (atrPercent > 4) {
    regime = "VOLATILE";
    score = -20;
    reason = `高ボラティリティ (ATR ${atrPercent.toFixed(1)}%)、方向性よりリスク管理優先`;
  } else if (sma20 > sma50 && sma50 > sma200 && slopePercent20 > 0.5) {
    regime = "TRENDING_UP";
    score = 50;
    reason = `上昇トレンド (SMA20>SMA50>SMA200、傾き+${slopePercent20.toFixed(1)}%)`;
  } else if (sma20 < sma50 && sma50 < sma200 && slopePercent20 < -0.5) {
    regime = "TRENDING_DOWN";
    score = -50;
    reason = `下降トレンド (SMA20<SMA50<SMA200、傾き${slopePercent20.toFixed(1)}%)`;
  } else if (rangeWidthPercent < 8 && Math.abs(slopePercent20) < 0.3) {
    regime = "RANGING";
    score = 0;
    reason = `レンジ相場 (30日値幅${rangeWidthPercent.toFixed(1)}%、傾きほぼゼロ)`;
  } else if (sma20 > sma50 && slopePercent20 > 0) {
    regime = "TRENDING_UP";
    score = 30;
    reason = `緩やかな上昇 (SMA20>SMA50、傾き+${slopePercent20.toFixed(1)}%)`;
  } else if (sma20 < sma50 && slopePercent20 < 0) {
    regime = "TRENDING_DOWN";
    score = -30;
    reason = `緩やかな下降 (SMA20<SMA50、傾き${slopePercent20.toFixed(1)}%)`;
  } else {
    regime = "RANGING";
    score = 0;
    reason = `方向感不明瞭 (傾き${slopePercent20.toFixed(1)}%、値幅${rangeWidthPercent.toFixed(1)}%)`;
  }

  return {
    regime,
    score,
    confidence: 75,
    reason,
    factors: {
      sma20: Number(sma20.toFixed(2)),
      sma50: Number(sma50.toFixed(2)),
      sma200: Number(sma200.toFixed(2)),
      slopePercent20: Number(slopePercent20.toFixed(2)),
      atrPercent: Number(atrPercent.toFixed(2)),
      rangeWidthPercent: Number(rangeWidthPercent.toFixed(2)),
    },
  };
}
