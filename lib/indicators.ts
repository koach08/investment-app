export function sma(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return result;
}

export function ema(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      const slice = data.slice(0, period);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    } else {
      const prev = result[i - 1]!;
      result.push(data[i] * k + prev * (1 - k));
    }
  }
  return result;
}

export function rsi(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      result.push(null);
      continue;
    }
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);

    if (i < period) {
      result.push(null);
    } else if (i === period) {
      const avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
      if (avgLoss === 0) {
        result.push(100);
      } else {
        result.push(100 - 100 / (1 + avgGain / avgLoss));
      }
    } else {
      const prevRsi = result[i - 1]!;
      const prevAvgGain = (100 / (100 - prevRsi) - 1) > 0
        ? gains[gains.length - 2] * (period - 1) / period
        : 0;
      const avgGain = (prevAvgGain * (period - 1) + gains[gains.length - 1]) / period;
      const avgLoss = ((gains.length > 1 ? losses[losses.length - 2] : 0) * (period - 1) + losses[losses.length - 1]) / period;
      if (avgLoss === 0) {
        result.push(100);
      } else {
        result.push(100 - 100 / (1 + avgGain / avgLoss));
      }
    }
  }
  return result;
}

export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      macdLine.push(emaFast[i]! - emaSlow[i]!);
    } else {
      macdLine.push(null);
    }
  }

  const validMacd = macdLine.filter((v) => v !== null) as number[];
  const signalLine = ema(validMacd, signal);

  const fullSignal: (number | null)[] = [];
  const histogram: (number | null)[] = [];
  let j = 0;
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] !== null) {
      const sig = signalLine[j] ?? null;
      fullSignal.push(sig);
      histogram.push(sig !== null ? macdLine[i]! - sig : null);
      j++;
    } else {
      fullSignal.push(null);
      histogram.push(null);
    }
  }

  return { macd: macdLine, signal: fullSignal, histogram };
}

export function bollingerBands(
  closes: number[],
  period = 20,
  mult = 2
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = sma(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (middle[i] === null) {
      upper.push(null);
      lower.push(null);
    } else {
      const slice = closes.slice(i - period + 1, i + 1);
      const mean = middle[i]!;
      const std = Math.sqrt(slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period);
      upper.push(mean + mult * std);
      lower.push(mean - mult * std);
    }
  }
  return { upper, middle, lower };
}

export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): (number | null)[] {
  const trueRanges: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      trueRanges.push(highs[i] - lows[i]);
    } else {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }
  }
  return sma(trueRanges, period);
}

export interface ScanSignal {
  ticker: string;
  name: string;
  close: number;
  rsi: number | null;
  macdHistogram: number | null;
  bbPosition: string | null;
  signal: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";
  score: number;
}

export function generateSignal(
  closes: number[],
  highs: number[],
  lows: number[]
): { signal: ScanSignal["signal"]; score: number; rsiVal: number | null; macdHist: number | null; bbPos: string | null } {
  let score = 0;

  const rsiVals = rsi(closes);
  const rsiVal = rsiVals[rsiVals.length - 1];
  if (rsiVal !== null) {
    if (rsiVal < 30) score += 2;
    else if (rsiVal < 40) score += 1;
    else if (rsiVal > 70) score -= 2;
    else if (rsiVal > 60) score -= 1;
  }

  const macdResult = macd(closes);
  const macdHist = macdResult.histogram[macdResult.histogram.length - 1];
  const prevMacdHist = macdResult.histogram[macdResult.histogram.length - 2];
  if (macdHist !== null && prevMacdHist !== null) {
    if (macdHist > 0 && prevMacdHist <= 0) score += 2;
    else if (macdHist > 0) score += 1;
    else if (macdHist < 0 && prevMacdHist >= 0) score -= 2;
    else if (macdHist < 0) score -= 1;
  }

  const bb = bollingerBands(closes);
  const lastClose = closes[closes.length - 1];
  const lastUpper = bb.upper[bb.upper.length - 1];
  const lastLower = bb.lower[bb.lower.length - 1];
  let bbPos: string | null = null;
  if (lastUpper !== null && lastLower !== null) {
    if (lastClose <= lastLower) {
      score += 1;
      bbPos = "下限突破";
    } else if (lastClose >= lastUpper) {
      score -= 1;
      bbPos = "上限突破";
    } else {
      bbPos = "バンド内";
    }
  }

  let signal: ScanSignal["signal"];
  if (score >= 4) signal = "STRONG_BUY";
  else if (score >= 2) signal = "BUY";
  else if (score <= -4) signal = "STRONG_SELL";
  else if (score <= -2) signal = "SELL";
  else signal = "NEUTRAL";

  return { signal, score, rsiVal: rsiVal ?? null, macdHist: macdHist ?? null, bbPos };
}
