import type { QuantAction, QuantAnalysis, RegimeAnalysis } from "./types";

export interface ScoringInput {
  ticker: string;
  price: number;
  quantAnalysis: QuantAnalysis;
  regime: RegimeAnalysis;
  technicalScore?: number;
  fundamentalScore?: number;
  fundamentalReason?: string;
}

export interface ScoringVote {
  source: string;
  action: QuantAction;
  score: number;
  confidence: number;
  weight: number;
  reasons: string[];
}

export interface ScoringResult {
  ticker: string;
  action: QuantAction;
  confidence: number;
  reason: string;
  compositeScore: number;
  agreement: number;
  votes: ScoringVote[];
}

const WEIGHTS = {
  quant: 0.5,
  regime: 0.25,
  technical: 0.15,
  fundamental: 0.1,
};

function normalizeTechnical(score: number): number {
  return Math.max(-100, Math.min(100, score * 20));
}

function actionFromScore(score: number, threshold = 15): QuantAction {
  if (score > threshold) return "BUY";
  if (score < -threshold) return "SELL";
  return "HOLD";
}

export function calculateFinalDecision(input: ScoringInput): ScoringResult {
  const quantScore = input.quantAnalysis.compositeScore;
  const regimeScore = input.regime.score;
  const techScore = input.technicalScore !== undefined ? normalizeTechnical(input.technicalScore) : 0;
  const fundamentalScore = input.fundamentalScore ?? 0;

  const haveTechnical = input.technicalScore !== undefined;
  const haveFundamental = input.fundamentalScore !== undefined;

  let weightTotal = WEIGHTS.quant + WEIGHTS.regime;
  if (haveTechnical) weightTotal += WEIGHTS.technical;
  if (haveFundamental) weightTotal += WEIGHTS.fundamental;

  const compositeScore =
    (quantScore * WEIGHTS.quant +
      regimeScore * WEIGHTS.regime +
      (haveTechnical ? techScore * WEIGHTS.technical : 0) +
      (haveFundamental ? fundamentalScore * WEIGHTS.fundamental : 0)) /
    weightTotal;

  const dirs = [Math.sign(quantScore), Math.sign(regimeScore)];
  if (haveTechnical) dirs.push(Math.sign(techScore));
  if (haveFundamental) dirs.push(Math.sign(fundamentalScore));
  const buyVotes = dirs.filter((d) => d > 0).length;
  const sellVotes = dirs.filter((d) => d < 0).length;
  const agreement = Math.max(buyVotes, sellVotes) / dirs.length;

  let action: QuantAction;
  if (Math.abs(compositeScore) < 12 || agreement < 0.5) action = "HOLD";
  else if (compositeScore > 0) action = "BUY";
  else action = "SELL";

  const confidence = Math.round(
    agreement * 100 * 0.55 +
      input.quantAnalysis.compositeConfidence * 0.25 +
      input.regime.confidence * 0.2
  );

  const votes: ScoringVote[] = [
    {
      source: "quant",
      action: actionFromScore(quantScore),
      score: quantScore,
      confidence: input.quantAnalysis.compositeConfidence,
      weight: WEIGHTS.quant / weightTotal,
      reasons: input.quantAnalysis.reasons,
    },
    {
      source: "regime",
      action: actionFromScore(regimeScore, 20),
      score: regimeScore,
      confidence: input.regime.confidence,
      weight: WEIGHTS.regime / weightTotal,
      reasons: [`${input.regime.regime}: ${input.regime.reason}`],
    },
  ];
  if (haveTechnical) {
    votes.push({
      source: "technical",
      action: actionFromScore(techScore, 40),
      score: techScore,
      confidence: 70,
      weight: WEIGHTS.technical / weightTotal,
      reasons: [`テクニカルスコア: ${input.technicalScore}`],
    });
  }
  if (haveFundamental) {
    votes.push({
      source: "fundamental",
      action: actionFromScore(fundamentalScore, 20),
      score: fundamentalScore,
      confidence: 65,
      weight: WEIGHTS.fundamental / weightTotal,
      reasons: [input.fundamentalReason ?? `ファンダスコア: ${fundamentalScore}`],
    });
  }

  const reasonParts: string[] = [];
  if (Math.abs(quantScore) >= 20) {
    reasonParts.push(`クオンツ${quantScore > 0 ? "買い" : "売り"} (${quantScore}pt)`);
  }
  reasonParts.push(`レジーム: ${input.regime.regime}`);
  if (haveTechnical && Math.abs(techScore) >= 40) {
    reasonParts.push(`テクニカル${techScore > 0 ? "買い" : "売り"}`);
  }

  const reason = `[総合${compositeScore.toFixed(0)}pt, 一致${(agreement * 100).toFixed(0)}%] ${reasonParts.join(" | ")}`;

  return {
    ticker: input.ticker,
    action,
    confidence,
    reason,
    compositeScore: Math.round(compositeScore),
    agreement,
    votes,
  };
}
