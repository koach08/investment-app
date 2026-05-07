import { sma, ema, rsi, bollingerBands, atr } from "../indicators";
import type { OHLCVBar, QuantSignal, QuantAnalysis, Recommendation } from "./types";

function rsiMeanReversion(bars: OHLCVBar[]): QuantSignal {
  const closes = bars.map((b) => b.close);
  const rsiVals = rsi(closes, 14);
  const current = rsiVals[rsiVals.length - 1];
  const prev = rsiVals[rsiVals.length - 2];

  if (current === null || prev === null) {
    return { name: "RSI平均回帰", score: 0, confidence: 0, reason: "データ不足", factors: {} };
  }

  let score = 0;
  let reason = "";
  if (current < 25) {
    score = 80;
    reason = `RSI ${current.toFixed(1)} - 極端な売られすぎ、反発の可能性高い`;
  } else if (current < 35) {
    score = 40;
    reason = `RSI ${current.toFixed(1)} - 売られすぎ圏、買い検討`;
  } else if (current > 75) {
    score = -80;
    reason = `RSI ${current.toFixed(1)} - 極端な買われすぎ、反落の可能性高い`;
  } else if (current > 65) {
    score = -40;
    reason = `RSI ${current.toFixed(1)} - 買われすぎ圏、売り検討`;
  } else {
    reason = `RSI ${current.toFixed(1)} - 中立圏`;
  }

  const direction = current - prev;
  if (direction > 3 && score >= 0) score += 10;
  if (direction < -3 && score <= 0) score -= 10;

  return {
    name: "RSI平均回帰",
    score: Math.max(-100, Math.min(100, score)),
    confidence: 85,
    reason,
    factors: { rsi: Number(current.toFixed(2)), rsiPrev: Number(prev.toFixed(2)), direction: Number(direction.toFixed(2)) },
  };
}

function bollingerReversion(bars: OHLCVBar[]): QuantSignal {
  const closes = bars.map((b) => b.close);
  const bb = bollingerBands(closes, 20, 2);
  const lastIdx = bb.upper.length - 1;
  const upper = bb.upper[lastIdx];
  const lower = bb.lower[lastIdx];
  const middle = bb.middle[lastIdx];
  const price = closes[closes.length - 1];

  if (upper === null || lower === null || middle === null) {
    return { name: "ボリンジャー逆張り", score: 0, confidence: 0, reason: "データ不足", factors: {} };
  }

  const bandWidth = upper - lower;
  const position = bandWidth > 0 ? (price - lower) / bandWidth : 0.5;

  let score = 0;
  let reason = "";
  if (position < 0) {
    score = 70;
    reason = `価格がBB下限を下回り (位置: ${(position * 100).toFixed(0)}%)、反発の可能性`;
  } else if (position < 0.15) {
    score = 40;
    reason = `BB下限付近 (位置: ${(position * 100).toFixed(0)}%)、買いゾーン`;
  } else if (position > 1) {
    score = -70;
    reason = `価格がBB上限を上回り (位置: ${(position * 100).toFixed(0)}%)、反落の可能性`;
  } else if (position > 0.85) {
    score = -40;
    reason = `BB上限付近 (位置: ${(position * 100).toFixed(0)}%)、売りゾーン`;
  } else {
    reason = `BB中間圏 (位置: ${(position * 100).toFixed(0)}%)、方向感なし`;
  }

  return {
    name: "ボリンジャー逆張り",
    score: Math.max(-100, Math.min(100, score)),
    confidence: 75,
    reason,
    factors: {
      price: Number(price.toFixed(2)),
      upper: Number(upper.toFixed(2)),
      lower: Number(lower.toFixed(2)),
      middle: Number(middle.toFixed(2)),
      position: Number(position.toFixed(3)),
    },
  };
}

function momentumTrend(bars: OHLCVBar[]): QuantSignal {
  const closes = bars.map((b) => b.close);
  if (closes.length < 50) {
    return { name: "モメンタム", score: 0, confidence: 0, reason: "データ不足", factors: {} };
  }

  const sma20Vals = sma(closes, 20);
  const sma50Vals = sma(closes, 50);
  const ema12Vals = ema(closes, 12);

  const sma20 = sma20Vals[sma20Vals.length - 1];
  const sma50 = sma50Vals[sma50Vals.length - 1];
  const sma20Prev10 = sma20Vals[sma20Vals.length - 10];
  const ema12 = ema12Vals[ema12Vals.length - 1];
  const price = closes[closes.length - 1];

  if (sma20 === null || sma50 === null || sma20Prev10 === null || ema12 === null) {
    return { name: "モメンタム", score: 0, confidence: 0, reason: "計算不能", factors: {} };
  }

  let score = 0;
  const reasons: string[] = [];

  if (sma20 > sma50) {
    score += 25;
    reasons.push("SMA20 > SMA50 (ゴールデンクロス圏)");
  } else {
    score -= 25;
    reasons.push("SMA20 < SMA50 (デッドクロス圏)");
  }

  const slopePercent = ((sma20 - sma20Prev10) / sma20Prev10) * 100;
  if (slopePercent > 1) {
    score += 30;
    reasons.push(`SMA20傾き +${slopePercent.toFixed(1)}% (強い上昇)`);
  } else if (slopePercent > 0.3) {
    score += 15;
    reasons.push(`SMA20傾き +${slopePercent.toFixed(1)}% (緩やかな上昇)`);
  } else if (slopePercent < -1) {
    score -= 30;
    reasons.push(`SMA20傾き ${slopePercent.toFixed(1)}% (強い下降)`);
  } else if (slopePercent < -0.3) {
    score -= 15;
    reasons.push(`SMA20傾き ${slopePercent.toFixed(1)}% (緩やかな下降)`);
  }

  if (price > ema12 && ema12 > sma20) {
    score += 20;
    reasons.push("価格 > EMA12 > SMA20 (強気配列)");
  } else if (price < ema12 && ema12 < sma20) {
    score -= 20;
    reasons.push("価格 < EMA12 < SMA20 (弱気配列)");
  }

  return {
    name: "モメンタム",
    score: Math.max(-100, Math.min(100, score)),
    confidence: 80,
    reason: reasons.join("; "),
    factors: {
      price: Number(price.toFixed(2)),
      sma20: Number(sma20.toFixed(2)),
      sma50: Number(sma50.toFixed(2)),
      ema12: Number(ema12.toFixed(2)),
      slopePercent: Number(slopePercent.toFixed(2)),
    },
  };
}

function volumeAnomaly(bars: OHLCVBar[]): QuantSignal {
  const volumes = bars.map((b) => b.volume).filter((v) => typeof v === "number" && !isNaN(v));
  if (volumes.length < 20) {
    return { name: "出来高異常", score: 0, confidence: 0, reason: "データ不足", factors: {} };
  }

  const recentVol = volumes[volumes.length - 1];
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;

  if (avgVol === 0) {
    return { name: "出来高異常", score: 0, confidence: 30, reason: "出来高データなし", factors: {} };
  }

  const ratio = recentVol / avgVol;
  const priceChange =
    bars.length >= 2
      ? ((bars[bars.length - 1].close - bars[bars.length - 2].close) / bars[bars.length - 2].close) * 100
      : 0;

  let score = 0;
  let reason = "";
  if (ratio > 3) {
    score = priceChange > 0 ? 40 : -40;
    reason = `出来高 ${ratio.toFixed(1)}倍（急増）、価格${priceChange > 0 ? "上昇" : "下落"}方向`;
  } else if (ratio > 2) {
    score = priceChange > 0 ? 20 : -20;
    reason = `出来高 ${ratio.toFixed(1)}倍（増加）、価格${priceChange > 0 ? "上昇" : "下落"}方向`;
  } else if (ratio < 0.3) {
    reason = `出来高 ${ratio.toFixed(1)}倍（極端に少ない）、シグナル信頼度低`;
  } else {
    reason = `出来高 ${ratio.toFixed(1)}倍（通常範囲）`;
  }

  return {
    name: "出来高異常",
    score: Math.max(-100, Math.min(100, score)),
    confidence: ratio < 0.3 ? 20 : 60,
    reason,
    factors: {
      recentVol: Math.round(recentVol),
      avgVol: Math.round(avgVol),
      ratio: Number(ratio.toFixed(2)),
      priceChange: Number(priceChange.toFixed(2)),
    },
  };
}

function volatilityState(bars: OHLCVBar[]): QuantSignal {
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const atrVals = atr(highs, lows, closes, 14);
  const currentATR = atrVals[atrVals.length - 1];
  const price = closes[closes.length - 1];

  if (currentATR === null || price <= 0) {
    return { name: "ボラティリティ", score: 0, confidence: 0, reason: "データ不足", factors: {} };
  }

  const atrPercent = (currentATR / price) * 100;
  const validATR = atrVals.filter((v): v is number => v !== null);
  const avgATR = validATR.length > 0 ? validATR.reduce((a, b) => a + b, 0) / validATR.length : currentATR;
  const atrRatio = avgATR > 0 ? currentATR / avgATR : 1;

  let score = 0;
  let reason = "";
  if (atrPercent > 5) {
    score = -30;
    reason = `ATR ${atrPercent.toFixed(1)}%（高ボラティリティ）、取引リスク高`;
  } else if (atrRatio > 1.5) {
    score = -15;
    reason = `ATR比 ${atrRatio.toFixed(1)}倍（ボラ上昇中）、注意`;
  } else if (atrPercent < 0.5) {
    score = 5;
    reason = `ATR ${atrPercent.toFixed(1)}%（低ボラ）、安定した積立向き`;
  } else {
    reason = `ATR ${atrPercent.toFixed(1)}%（通常範囲）`;
  }

  return {
    name: "ボラティリティ",
    score,
    confidence: 70,
    reason,
    factors: {
      atr: Number(currentATR.toFixed(2)),
      atrPercent: Number(atrPercent.toFixed(2)),
      atrRatio: Number(atrRatio.toFixed(2)),
      price: Number(price.toFixed(2)),
    },
  };
}

const SIGNAL_WEIGHTS: Record<string, number> = {
  "RSI平均回帰": 1.0,
  "ボリンジャー逆張り": 0.8,
  "モメンタム": 1.2,
  "出来高異常": 0.6,
  "ボラティリティ": 0.5,
};

export function runQuantAnalysis(
  bars: OHLCVBar[],
  meta: { ticker: string; name?: string }
): QuantAnalysis {
  const signals: QuantSignal[] = [
    rsiMeanReversion(bars),
    bollingerReversion(bars),
    momentumTrend(bars),
    volumeAnomaly(bars),
    volatilityState(bars),
  ];

  let weightedSum = 0;
  let weightTotal = 0;
  for (const sig of signals) {
    if (sig.confidence > 0) {
      const w = (SIGNAL_WEIGHTS[sig.name] ?? 1.0) * (sig.confidence / 100);
      weightedSum += sig.score * w;
      weightTotal += w;
    }
  }

  const compositeScore = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;
  const compositeConfidence = (signals.filter((s) => s.confidence > 0).length / signals.length) * 100;

  let recommendation: Recommendation;
  if (compositeScore >= 50) recommendation = "STRONG_BUY";
  else if (compositeScore >= 20) recommendation = "BUY";
  else if (compositeScore <= -50) recommendation = "STRONG_SELL";
  else if (compositeScore <= -20) recommendation = "SELL";
  else recommendation = "HOLD";

  const reasons = signals
    .filter((s) => Math.abs(s.score) >= 20 && s.confidence > 30)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .map((s) => `[${s.name}] ${s.reason}`);

  const lastBar = bars[bars.length - 1];

  return {
    ticker: meta.ticker,
    name: meta.name,
    price: lastBar?.close ?? 0,
    signals,
    compositeScore,
    compositeConfidence: Math.round(compositeConfidence),
    recommendation,
    reasons,
    asOf: new Date().toISOString(),
  };
}
