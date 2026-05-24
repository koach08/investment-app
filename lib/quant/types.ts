export type QuantAction = "BUY" | "SELL" | "HOLD";
export type MarketRegime = "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "VOLATILE";
export type Recommendation = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";
export type Horizon = "SHORT" | "MID" | "LONG";

export interface OHLCVBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface QuantSignal {
  name: string;
  score: number;
  confidence: number;
  reason: string;
  factors: Record<string, number | string>;
}

export interface QuantAnalysis {
  ticker: string;
  name?: string;
  price: number;
  signals: QuantSignal[];
  compositeScore: number;
  compositeConfidence: number;
  recommendation: Recommendation;
  reasons: string[];
  asOf: string;
}

export interface RegimeAnalysis {
  regime: MarketRegime;
  score: number;
  confidence: number;
  reason: string;
  factors: {
    sma20: number;
    sma50: number;
    sma200: number;
    slopePercent20: number;
    atrPercent: number;
    rangeWidthPercent: number;
  };
}

export interface StrategyProposal {
  horizon: Horizon;
  label: string;
  action: QuantAction | "MARGIN_SHORT" | "MARGIN_LONG" | "DCA" | "TRIM" | "EXIT";
  rationale: string;
  entryHint?: { type: "limit" | "market"; price?: number };
  exitHint?: { takeProfit?: number; stopLoss?: number };
  sizing?: string;
  notes?: string[];
  costEstimate?: {
    roundtripCostPercent: number;
    grossReturnPercent: number;
    netReturnPercent: number;
    breakdown: string;
  };
}

export interface InstitutionalRiskReport {
  gate: "TRADEABLE" | "REDUCE_SIZE" | "AVOID";
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

export interface PortfolioSummary {
  analyzed: number;
  byAction: Record<string, number>;
  byRegime: Record<string, number>;
  shortTermPicks: { code: string; name: string; action: string; rationale: string }[];
  midTermPicks: { code: string; name: string; action: string; rationale: string }[];
  longTermPicks: { code: string; name: string; action: string; rationale: string }[];
  shortTermSummary: string;
  midTermSummary: string;
  longTermSummary: string;
  warnings: string[];
}
