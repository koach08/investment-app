export type SignalType = "BUY" | "WATCH_BUY" | "NEUTRAL" | "WATCH_SELL" | "SELL";
export type EngineId = "claude" | "gpt4o" | "gemini" | "grok" | "perplexity";

export interface EngineResult {
  engine: EngineId;
  status: "success" | "error" | "loading";
  signal?: SignalType;
  score?: number;
  confidence?: number;
  summary?: string;
  points?: string[];
  risks?: string[];
  priceRange?: {
    entry: number;
    target: number;
    stop: number;
  };
  error?: string;
  duration?: number;
}

export interface IntegratedResult {
  signal: SignalType;
  score: number;
  consensus: number;
  engineCount: number;
}

export interface TechnicalSignal {
  rsi: number | null;
  macdHistogram: number | null;
  bbPosition: string | null;
  atr: number | null;
  close: number;
  changePercent: number;
  signal: string;
  score: number;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  category: string;
}

export interface MacroData {
  name: string;
  latestValue: string;
  previousValue: string;
  change: number;
}

export interface IFDOCOOrder {
  entryOrder: { type: "指値" | "成行" | "逆指値"; price: number };
  takeProfit: { type: "指値"; price: number };
  stopLoss: { type: "逆指値"; price: number };
}

// === Financial Services Plugin Types ===

export interface PortfolioHealth {
  sectorConcentration: string;
  topRisk: string;
  driftAlert: string;
  rebalanceActions: string[];
}

export interface CatalystEvent {
  date: string;
  event: string;
  impact: string;
  affectedTickers: string[];
}

export interface HoldingsVerdict {
  ticker: string;
  action: "継続保有" | "部分利確" | "全利確" | "損切り" | "買い増し";
  reason: string;
  thesisStatus: "有効" | "要注意" | "崩壊";
}

export interface MorningBrief {
  date: string;
  marketRegime: string;
  overnightSummary: string;
  keyMovers: { ticker: string; move: string; reason: string }[];
  sectorHeatmap: { hot: string[]; cold: string[] };
  macroSnapshot: {
    yieldCurve: string;
    dollarYen: string;
    vix: string;
    fedExpectation: string;
  };
  todaysCatalysts: { time: string; event: string; expectedImpact: string }[];
  holdingsAlert: { ticker: string; alert: string; action: string }[];
  tradeIdeas: {
    type: "long" | "short" | "pair";
    ticker: string;
    thesis: string;
    entry: string;
    target: string;
    stop: string;
    conviction: "high" | "medium" | "low";
  }[];
  riskDashboard: {
    overallRisk: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
    topRisks: string[];
    blackSwan: string;
  };
  oneLineCall: string;
}

export interface ValuationResult {
  ticker: string;
  name: string;
  currentPrice: number;
  multiples: {
    per: { current: number; industryAvg: number; historical5yAvg: number; verdict: string };
    pbr: { current: number; industryAvg: number; verdict: string };
    dividendYield: { current: string; industryAvg: string; payoutRatio: string };
    evEbitda: { current: number; industryAvg: number; verdict: string };
  };
  dcfAnalysis: {
    assumptions: { revenueGrowth: string; terminalGrowth: string; wacc: string; marginAssumption: string };
    fairValue: number;
    upside: string;
  };
  scenarios: {
    bull: { price: number; probability: string; keyAssumption: string };
    base: { price: number; probability: string; keyAssumption: string };
    bear: { price: number; probability: string; keyAssumption: string };
  };
  moatAssessment: {
    type: string;
    strength: number;
    durability: string;
    explanation: string;
  };
  peerComparison: {
    ticker: string;
    name: string;
    per: number;
    pbr: number;
    dividendYield: string;
    roePct: number;
    verdict: string;
  }[];
  investmentRating: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";
  targetPrice: number;
  riskReward: string;
  keyRisks: string[];
  catalysts: string[];
  oneLiner: string;
  summary_ja: string;
}

export interface EarningsToneEnhanced {
  overall_tone: number;
  confidence_score: number;
  guidance_revision: string;
  bullish_signals: string[];
  bearish_signals: string[];
  beat_miss: { revenue: string; eps: string; magnitude: string };
  margin_trend: string;
  management_confidence: number;
  key_metrics_changes: string[];
  forward_guidance_detail: string;
  competitive_position_change: string;
  catalyst_next_quarter: string[];
  risk_flags: string[];
  thesis_impact: string;
  summary_ja: string;
}

export interface CompetitiveImpact {
  winners: string[];
  losers: string[];
}

export interface NewsAnalysisEnhanced {
  sentiment: string;
  impactScore: number;
  impactType: string;
  affectedSectors: string[];
  affectedTickers: string[];
  competitiveImpact: CompetitiveImpact;
  supplyChainImpact: string;
  holdingsImpact: {
    ticker: string;
    impact: string;
    severity: number;
    reason: string;
    action: string;
  }[];
  tradingImplication: {
    immediate: string;
    shortTerm: string;
    mediumTerm: string;
  };
  sectorRotation: string;
  macroImplication: string;
  biasCheck: string;
  contrarian: string;
  timeHorizon: string;
  summary_ja: string;
}

export const ENGINE_CONFIG: Record<EngineId, {
  name: string;
  icon: string;
  vendor: string;
  color: string;
  weight: number;
  role?: string;
}> = {
  claude: {
    name: "Claude",
    icon: "🟣",
    vendor: "Anthropic",
    color: "#8B5CF6",
    weight: 1.0,
  },
  gpt4o: {
    name: "GPT-4o",
    icon: "🟢",
    vendor: "OpenAI",
    color: "#10B981",
    weight: 1.0,
  },
  gemini: {
    name: "Gemini",
    icon: "🔵",
    vendor: "Google",
    color: "#3B82F6",
    weight: 0.9,
  },
  grok: {
    name: "Grok",
    icon: "⚫",
    vendor: "xAI",
    color: "#6B7280",
    weight: 0.8,
  },
  perplexity: {
    name: "Perplexity",
    icon: "🔍",
    vendor: "Perplexity AI",
    color: "#06B6D4",
    weight: 0.9,
    role: "情報収集 + 分析",
  },
};
