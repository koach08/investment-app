"use client";

import { useState, useEffect, useRef } from "react";
import { clsx } from "clsx";
import TickerLink from "@/components/TickerLink";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { generateSignal, atr } from "@/lib/indicators";
import { ChevronDown } from "lucide-react";

interface Pick {
  ticker: string;
  name: string;
  action: string;
  reason: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  winProbability: number;
  riskReward: string;
  timeframe: string;
  thesis?: string;
  thesisBreaker?: string;
  valuation?: string;
  dividend?: string;
  shareholderBenefits?: string;
  ifdoco?: {
    entryOrder: { type: string; price: number };
    takeProfit: { type: string; price: number };
    stopLoss: { type: string; price: number };
  };
  holdingPeriod?: string;
  exitDate?: string;
}

interface StrategySection {
  title: string;
  description: string;
  picks: Pick[];
}

interface Strategy {
  marketOverview: string;
  riskLevel: string;
  riskComment: string;
  macroRegime?: string;
  portfolioHealth?: {
    sectorConcentration: string;
    topRisk: string;
    driftAlert: string;
    rebalanceActions: string[];
  };
  catalysts?: { date: string; event: string; impact: string; affectedTickers: string[] }[];
  strategies: {
    shortTerm: StrategySection;
    midTerm: StrategySection;
    longTerm: StrategySection;
  };
  holdingsVerdict?: { ticker: string; action: string; reason: string; thesisStatus: string }[];
  overallAdvice: string;
  watchList: string[];
  taxOptimization?: string;
  disclaimer: string;
}

interface MorningBriefData {
  date: string;
  marketRegime: string;
  overnightSummary: string;
  keyMovers: { ticker: string; move: string; reason: string }[];
  sectorHeatmap: { hot: string[]; cold: string[] };
  macroSnapshot: { yieldCurve: string; dollarYen: string; vix: string; fedExpectation: string };
  todaysCatalysts: { time: string; event: string; expectedImpact: string }[];
  holdingsAlert: { ticker: string; alert: string; action: string }[];
  tradeIdeas: { type: string; ticker: string; thesis: string; entry: string; target: string; stop: string; conviction: string }[];
  riskDashboard: { overallRisk: string; topRisks: string[]; blackSwan: string };
  oneLineCall: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface HoldingWithSignal {
  code: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  pnlPercent: number;
  signal?: string;
  score?: number;
}

interface NewsAnalysis {
  sentiment: string;
  impactScore: number;
  impactType?: string;
  affectedSectors: string[];
  affectedTickers: string[];
  competitiveImpact?: { winners: string[]; losers: string[] };
  supplyChainImpact?: string;
  holdingsImpact: { ticker: string; impact: string; severity?: number; reason: string; action?: string }[];
  tradingImplication: string | { immediate: string; shortTerm: string; mediumTerm: string };
  sectorRotation?: string;
  macroImplication?: string;
  biasCheck: string;
  contrarian?: string;
  timeHorizon: string;
  summary_ja: string;
}

interface MarginTrade {
  ticker: string;
  name: string;
  direction: string;
  conviction: string;
  probabilityOfProfit: number;
  thesis: string;
  thesisBreaker: string;
  technicalSetup: string;
  entryPrice: number;
  targetPrice: number;
  stopLossPrice: number;
  ifdoco: {
    entryOrder: { type: string; price: number; condition?: string };
    takeProfit: { type: string; price: number };
    stopLoss: { type: string; price: number; triggerPrice?: number };
  };
  holdingPeriod: string;
  exitDate: string;
  positionSize: string;
  estimatedInterestCost: string;
  marginRequirement: string;
  catalysts: string[];
  atrBasis: string;
}

interface ExistingPositionAction {
  ticker: string;
  action: string;
  urgency: string;
  reason: string;
  targetAction: string;
}

interface MarginStrategy {
  marketVerdict: {
    signal: string;
    confidence: number;
    reasoning: string;
    keyFactors: string[];
    volatilityRegime: string;
    trendDirection: string;
  };
  marginBuyCandidates: MarginTrade[];
  shortSellCandidates: MarginTrade[];
  noTradeReason: string | null;
  existingPositionReview: ExistingPositionAction[];
  riskDashboard: {
    recommendedMarginUtilization: string;
    maxConcurrentPositions: number;
    dailyInterestCostEstimate: string;
    weeklyDecayCost: string;
    marginMaintenanceBuffer: string;
    portfolioHeatLevel: string;
  };
  weeklyOutlook: string;
  disclaimer: string;
}

const MARGIN_CANDIDATES = [
  { ticker: "7203.T", name: "トヨタ自動車" },
  { ticker: "6758.T", name: "ソニーグループ" },
  { ticker: "8306.T", name: "三菱UFJ" },
  { ticker: "9984.T", name: "ソフトバンクグループ" },
  { ticker: "6861.T", name: "キーエンス" },
  { ticker: "9432.T", name: "NTT" },
  { ticker: "6902.T", name: "デンソー" },
  { ticker: "7974.T", name: "任天堂" },
  { ticker: "4063.T", name: "信越化学" },
  { ticker: "8035.T", name: "東京エレクトロン" },
  { ticker: "6501.T", name: "日立製作所" },
  { ticker: "7741.T", name: "HOYA" },
  { ticker: "6098.T", name: "リクルート" },
  { ticker: "4568.T", name: "第一三共" },
  { ticker: "6920.T", name: "レーザーテック" },
  { ticker: "8001.T", name: "伊藤忠商事" },
  { ticker: "6594.T", name: "ニデック" },
  { ticker: "9983.T", name: "ファーストリテイリング" },
  { ticker: "3382.T", name: "セブン&アイ" },
  { ticker: "2914.T", name: "JT" },
];

const VERDICT_COLORS: Record<string, string> = {
  GO: "border-green-500 bg-green-950/30 text-green-400",
  CAUTION: "border-yellow-500 bg-yellow-950/30 text-yellow-400",
  NO_TRADE: "border-red-500 bg-red-950/30 text-red-400",
};

const HEAT_COLORS: Record<string, string> = {
  LOW: "text-green-400",
  MEDIUM: "text-yellow-400",
  HIGH: "text-orange-400",
  OVERHEATED: "text-red-400",
};

const URGENCY_COLORS: Record<string, string> = {
  HIGH: "bg-red-500/20 text-red-400 border-red-800",
  MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-800",
  LOW: "bg-zinc-700 text-zinc-300 border-zinc-600",
};

const RISK_COLORS: Record<string, string> = {
  LOW: "text-green-400 bg-green-950/30 border-green-800",
  MEDIUM: "text-yellow-400 bg-yellow-950/30 border-yellow-800",
  HIGH: "text-orange-400 bg-orange-950/30 border-orange-800",
  VERY_HIGH: "text-red-400 bg-red-950/30 border-red-800",
};

const RISK_LABELS: Record<string, string> = {
  LOW: "低リスク",
  MEDIUM: "中リスク",
  HIGH: "高リスク",
  VERY_HIGH: "非常に高リスク",
};

// Auto-link ticker symbols in text
function renderWithTickerLinks(text: string) {
  const tickerRegex = /\b(\d{4}\.T|[A-Z]{2,5})\b/g;
  const parts: (string | { ticker: string; key: number })[] = [];
  let lastIndex = 0;
  let match;
  let keyCounter = 0;

  while ((match = tickerRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push({ ticker: match[1], key: keyCounter++ });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.map((part) => {
    if (typeof part === "string") return part;
    return <TickerLink key={part.key} ticker={part.ticker} />;
  });
}

function MarginTradeCard({ trade }: { trade: MarginTrade }) {
  const isShort = trade.direction === "空売り";
  return (
    <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TickerLink ticker={trade.ticker} className="font-mono text-blue-400 font-bold hover:underline" />
          <span className="text-sm text-zinc-300">{trade.name}</span>
          <span className={clsx(
            "px-2 py-0.5 rounded text-xs font-bold",
            isShort ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
          )}>
            {trade.direction}
          </span>
          <span className={clsx(
            "px-1.5 py-0.5 rounded text-xs",
            trade.conviction === "HIGH" ? "bg-green-800/30 text-green-400" :
            trade.conviction === "MEDIUM" ? "bg-yellow-800/30 text-yellow-400" :
            "bg-zinc-700 text-zinc-400"
          )}>
            {trade.conviction}
          </span>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-500">勝率</div>
          <div className={clsx(
            "text-xl font-black",
            trade.probabilityOfProfit >= 60 ? "text-green-400" :
            trade.probabilityOfProfit >= 45 ? "text-yellow-400" : "text-red-400"
          )}>
            {trade.probabilityOfProfit}%
          </div>
        </div>
      </div>

      {/* Thesis */}
      <div className="space-y-1 mb-3">
        <div className="text-xs">
          <span className="text-cyan-500 font-semibold">テーゼ: </span>
          <span className="text-zinc-300">{trade.thesis}</span>
        </div>
        <div className="text-xs">
          <span className="text-red-500 font-semibold">撤退条件: </span>
          <span className="text-zinc-400">{trade.thesisBreaker}</span>
        </div>
        <div className="text-xs">
          <span className="text-purple-500 font-semibold">テクニカル: </span>
          <span className="text-zinc-400">{trade.technicalSetup}</span>
        </div>
      </div>

      {/* IFDOCO Box - Enlarged for SBI input */}
      {trade.ifdoco && (
        <div className="border-2 border-yellow-700/50 bg-yellow-950/10 rounded-lg p-4 mb-3">
          <div className="text-sm font-bold text-yellow-400 mb-3 flex items-center gap-2">
            SBI証券 IFDOCO注文
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-zinc-900 rounded-lg p-3">
              <div className="text-xs text-zinc-500 mb-1">IF注文（新規建て）</div>
              <div className="text-xs text-zinc-400">{trade.ifdoco.entryOrder.type}</div>
              <div className="text-2xl font-black text-white font-mono">
                {trade.ifdoco.entryOrder.price?.toLocaleString()}
              </div>
              {trade.ifdoco.entryOrder.condition && (
                <div className="text-xs text-zinc-500 mt-1">{trade.ifdoco.entryOrder.condition}</div>
              )}
            </div>
            <div className="bg-zinc-900 rounded-lg p-3">
              <div className="text-xs text-zinc-500 mb-1">OCO利確（指値）</div>
              <div className="text-2xl font-black text-green-400 font-mono">
                {trade.ifdoco.takeProfit.price?.toLocaleString()}
              </div>
            </div>
            <div className="bg-zinc-900 rounded-lg p-3">
              <div className="text-xs text-zinc-500 mb-1">OCO損切（逆指値）</div>
              <div className="text-2xl font-black text-red-400 font-mono">
                {trade.ifdoco.stopLoss.price?.toLocaleString()}
              </div>
              {trade.ifdoco.stopLoss.triggerPrice && (
                <div className="text-xs text-zinc-500 mt-1">
                  トリガー: {trade.ifdoco.stopLoss.triggerPrice?.toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Price targets row */}
      <div className="flex gap-4 text-xs mb-2">
        <div>
          <span className="text-zinc-500">エントリー: </span>
          <span className="text-white font-mono font-bold">¥{trade.entryPrice?.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-zinc-500">利確: </span>
          <span className="text-green-400 font-mono font-bold">¥{trade.targetPrice?.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-zinc-500">損切: </span>
          <span className="text-red-400 font-mono font-bold">¥{trade.stopLossPrice?.toLocaleString()}</span>
        </div>
      </div>

      {/* Position details */}
      <div className="flex flex-wrap gap-3 text-xs mb-2">
        <div>
          <span className="text-zinc-500">数量: </span>
          <span className="text-zinc-300">{trade.positionSize}</span>
        </div>
        <div>
          <span className="text-zinc-500">保有期間: </span>
          <span className="text-zinc-300">{trade.holdingPeriod}</span>
        </div>
        <div>
          <span className="text-zinc-500">決済予定: </span>
          <span className="text-yellow-400">{trade.exitDate}</span>
        </div>
        <div>
          <span className="text-zinc-500">金利コスト: </span>
          <span className="text-orange-400">{trade.estimatedInterestCost}</span>
        </div>
        <div>
          <span className="text-zinc-500">必要証拠金: </span>
          <span className="text-cyan-400">{trade.marginRequirement}</span>
        </div>
      </div>

      {/* ATR basis */}
      {trade.atrBasis && (
        <div className="text-xs mb-2">
          <span className="text-zinc-500">ATR根拠: </span>
          <span className="text-zinc-400">{trade.atrBasis}</span>
        </div>
      )}

      {/* Catalysts */}
      {trade.catalysts?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {trade.catalysts.map((c, i) => (
            <span key={i} className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-400">{c}</span>
          ))}
        </div>
      )}

      {/* Win probability bar */}
      <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={clsx(
            "h-full rounded-full transition-all duration-1000",
            trade.probabilityOfProfit >= 60 ? "bg-green-500" :
            trade.probabilityOfProfit >= 45 ? "bg-yellow-500" : "bg-red-500"
          )}
          style={{ width: `${trade.probabilityOfProfit}%` }}
        />
      </div>
    </div>
  );
}

// Try to recover structured JSON from rawText when API JSON parsing fails
function tryRecoverJson<T>(text: string, validator: (obj: T) => boolean): T | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  // Try multiple extraction strategies
  const strategies = [
    () => cleaned,
    () => cleaned.match(/\{[\s\S]*\}/)?.[0],
    () => {
      // Handle case where JSON is split across markdown sections
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end > start) return cleaned.slice(start, end + 1);
      return null;
    },
  ];
  for (const extract of strategies) {
    const candidate = extract();
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as T;
      if (validator(parsed)) return parsed;
    } catch { /* try next strategy */ }
  }
  return null;
}

function riskToPercent(level: string): number {
  switch (level) {
    case "LOW": return 20;
    case "MEDIUM": return 45;
    case "HIGH": return 70;
    case "VERY_HIGH": return 95;
    default: return 50;
  }
}

const RISK_GRADIENT_COLORS: Record<string, string> = {
  LOW: "from-green-500 to-green-600",
  MEDIUM: "from-yellow-500 to-yellow-600",
  HIGH: "from-orange-500 to-orange-600",
  VERY_HIGH: "from-red-500 to-red-600",
};

export default function AdvisorPage() {
  const [activeTab, setActiveTab] = useState<"morning" | "strategy" | "margin" | "chat" | "news">("morning");
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [rawText, setRawText] = useState("");
  const [strategyLoading, setStrategyLoading] = useState(false);

  // Chat state — localStorageで1週間保持
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatInitialized = useRef(false);

  // Market context for chat
  const [marketContext, setMarketContext] = useState<Record<string, unknown> | null>(null);

  // Holdings state
  const [holdings, setHoldings] = useState<HoldingWithSignal[]>([]);

  // News analysis state
  const [newsText, setNewsText] = useState("");
  const [newsAnalysis, setNewsAnalysis] = useState<NewsAnalysis | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsRawText, setNewsRawText] = useState("");

  // Morning brief state
  const [morningBrief, setMorningBrief] = useState<MorningBriefData | null>(null);
  const [morningLoading, setMorningLoading] = useState(false);
  const [morningRawText, setMorningRawText] = useState("");

  // Margin strategy state
  const [marginStrategy, setMarginStrategy] = useState<MarginStrategy | null>(null);
  const [marginLoading, setMarginLoading] = useState(false);
  const [marginRawText, setMarginRawText] = useState("");

  // Expandable pick cards in strategy view
  const [expandedPicks, setExpandedPicks] = useState<Set<string>>(new Set());
  const togglePick = (id: string) => {
    setExpandedPicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load chat history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("advisor-chat-history");
      if (saved) {
        const { messages: savedMsgs, timestamp } = JSON.parse(saved);
        const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - timestamp < oneWeekMs && savedMsgs?.length > 0) {
          setMessages(savedMsgs);
        } else {
          localStorage.removeItem("advisor-chat-history");
        }
      }
    } catch { /* ignore */ }
    chatInitialized.current = true;
  }, []);

  // Save chat history to localStorage on change
  useEffect(() => {
    if (!chatInitialized.current) return;
    try {
      if (messages.length > 0) {
        localStorage.setItem("advisor-chat-history", JSON.stringify({
          messages,
          timestamp: Date.now(),
        }));
      } else {
        localStorage.removeItem("advisor-chat-history");
      }
    } catch { /* ignore */ }
  }, [messages]);

  // Load holdings on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("investment-app-assets");
      if (saved) {
        const parsed = JSON.parse(saved);
        setHoldings(parsed.filter((h: HoldingWithSignal) => h.code));
      }
    } catch {
      // ignore
    }
  }, []);

  const generateStrategy = async () => {
    setStrategyLoading(true);
    setStrategy(null);
    setRawText("");

    try {
      // Fetch market data in parallel
      const [indicesRes, fredRes, newsRes] = await Promise.all([
        fetch("/api/global-indices").then((r) => r.json()),
        fetch("/api/economic-calendar").then((r) => r.json()),
        fetch("/api/news?category=global").then((r) => r.json()),
      ]);

      const indicesArr = Object.values(indicesRes);
      const ctx = { indices: indicesArr, fredData: fredRes.data, news: newsRes.news };

      // Fetch market data for holdings and compute signals (batch of 4)
      let enrichedHoldings: HoldingWithSignal[] = [];
      if (holdings.length > 0) {
        const holdingsCopy = [...holdings];
        for (let i = 0; i < holdingsCopy.length; i += 4) {
          const batch = holdingsCopy.slice(i, i + 4);
          const batchResults = await Promise.all(
            batch.map(async (h) => {
              try {
                const res = await fetch(`/api/market?ticker=${encodeURIComponent(h.code)}&period=6mo`);
                const data = await res.json();
                if (data.prices && data.prices.length >= 30) {
                  const closes = data.prices.map((p: { close: number }) => p.close);
                  const highs = data.prices.map((p: { high: number }) => p.high);
                  const lows = data.prices.map((p: { low: number }) => p.low);
                  const { signal, score } = generateSignal(closes, highs, lows);
                  const currentPrice = closes[closes.length - 1];
                  return {
                    ...h,
                    currentPrice,
                    marketValue: currentPrice * h.quantity,
                    pnl: (currentPrice - h.avgPrice) * h.quantity,
                    pnlPercent: ((currentPrice - h.avgPrice) / h.avgPrice) * 100,
                    signal,
                    score,
                  };
                }
              } catch {
                // ignore
              }
              return h;
            })
          );
          enrichedHoldings.push(...batchResults);
        }
      }

      // Optionally fetch earnings tone, fed tone, geopolitical risk, sentiment, and JPX stats
      let earningsTone = null;
      let fedTone = null;
      let geopoliticalRisk = null;
      let fearGreed = null;
      let jpxStats = null;
      try {
        const [etRes, ftRes, geoRes, fgRes, jpxRes] = await Promise.all([
          fetch("/api/earnings-tone").then((r) => r.json()).catch(() => null),
          fetch("/api/fed-tone").then((r) => r.json()).catch(() => null),
          fetch("/api/geopolitical-risk").then((r) => r.json()).catch(() => null),
          fetch("/api/fear-greed").then((r) => r.json()).catch(() => null),
          fetch("/api/jpx-stats").then((r) => r.json()).catch(() => null),
        ]);
        earningsTone = etRes;
        fedTone = ftRes;
        geopoliticalRisk = geoRes;
        fearGreed = fgRes;
        jpxStats = jpxRes;
      } catch {
        // optional data, ignore errors
      }

      setMarketContext({ ...ctx, holdings: enrichedHoldings, geopoliticalRisk, fearGreed, jpxStats });

      const res = await fetch("/api/daily-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          indices: indicesArr,
          fredData: fredRes.data,
          news: newsRes.news,
          holdings: enrichedHoldings,
          earningsTone,
          fedTone,
          geopoliticalRisk,
          fearGreed,
          jpxStats,
        }),
      });
      const data = await res.json();

      if (data.strategy) {
        setStrategy(data.strategy);
      } else if (data.rawText) {
        const recovered = tryRecoverJson<Strategy>(data.rawText, (s) => !!(s.marketOverview || s.strategies));
        if (recovered) {
          setStrategy(recovered);
        } else {
          setRawText(data.rawText);
        }
      } else if (data.error) {
        setRawText(`エラー: ${data.error}`);
      }
    } catch {
      setRawText("戦略生成に失敗しました。");
    }
    setStrategyLoading(false);
  };

  const exportChatAsMarkdown = () => {
    if (messages.length === 0) return;
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    let md = `# AI投資相談ログ（${dateStr}）\n\n`;
    messages.forEach((msg) => {
      if (msg.role === "user") {
        md += `## Q:\n${msg.content}\n\n`;
      } else {
        md += `## A (AI投資アドバイザー):\n${msg.content}\n\n---\n\n`;
      }
    });
    md += `\n> エクスポート日時: ${now.toLocaleString("ja-JP")}\n`;
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AI投資相談_${dateStr}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem("advisor-chat-history");
  };

  const cancelChat = () => {
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    // Remove the last user message that was sent
    setMessages((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].role === "user") {
        return prev.slice(0, -1);
      }
      return prev;
    });
    setChatLoading(false);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setChatInput("");
    setChatLoading(true);

    const abortController = new AbortController();
    chatAbortRef.current = abortController;

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          context: {
            ...marketContext,
            holdings,
          },
        }),
        signal: abortController.signal,
      });
      const data = await res.json();
      if (data.reply) {
        setMessages([...newMessages, { role: "assistant", content: data.reply }]);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // cancelled by user — do nothing
        return;
      }
      setMessages([
        ...newMessages,
        { role: "assistant", content: "通信エラーが発生しました。再度お試しください。" },
      ]);
    }
    setChatLoading(false);
  };

  const analyzeNews = async () => {
    if (!newsText.trim() || newsLoading) return;
    setNewsLoading(true);
    setNewsAnalysis(null);
    setNewsRawText("");

    try {
      const res = await fetch("/api/news-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: newsText,
          holdings,
        }),
      });
      const data = await res.json();
      if (data.analysis) {
        setNewsAnalysis(data.analysis);
      } else if (data.rawText) {
        setNewsRawText(data.rawText);
      } else if (data.error) {
        setNewsRawText(`エラー: ${data.error}`);
      }
    } catch {
      setNewsRawText("分析に失敗しました。");
    }
    setNewsLoading(false);
  };

  const generateMorningBrief = async () => {
    setMorningLoading(true);
    setMorningBrief(null);
    setMorningRawText("");

    try {
      const [indicesRes, fredRes, newsRes] = await Promise.all([
        fetch("/api/global-indices").then((r) => r.json()),
        fetch("/api/economic-calendar").then((r) => r.json()),
        fetch("/api/news?category=global").then((r) => r.json()),
      ]);

      let fedTone = null;
      let geopoliticalRisk = null;
      let fearGreed = null;
      let jpxStats = null;
      try {
        const [ftRes, geoRes, fgRes, jpxRes] = await Promise.all([
          fetch("/api/fed-tone").then((r) => r.json()).catch(() => null),
          fetch("/api/geopolitical-risk").then((r) => r.json()).catch(() => null),
          fetch("/api/fear-greed").then((r) => r.json()).catch(() => null),
          fetch("/api/jpx-stats").then((r) => r.json()).catch(() => null),
        ]);
        fedTone = ftRes;
        geopoliticalRisk = geoRes;
        fearGreed = fgRes;
        jpxStats = jpxRes;
      } catch { /* optional */ }

      const res = await fetch("/api/morning-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          indices: Object.values(indicesRes),
          fredData: fredRes.data,
          news: newsRes.news,
          holdings,
          fedTone,
          geopoliticalRisk,
          fearGreed,
          jpxStats,
        }),
      });
      const data = await res.json();
      if (data.brief) {
        setMorningBrief(data.brief);
      } else if (data.rawText) {
        const recovered = tryRecoverJson<MorningBriefData>(data.rawText, (b) => !!(b.oneLineCall || b.overnightSummary));
        if (recovered) {
          setMorningBrief(recovered);
        } else {
          setMorningRawText(data.rawText);
        }
      } else if (data.error) {
        setMorningRawText(`エラー: ${data.error}`);
      }
    } catch {
      setMorningRawText("モーニングブリーフ生成に失敗しました。");
    }
    setMorningLoading(false);
  };

  const generateMarginStrategy = async () => {
    setMarginLoading(true);
    setMarginStrategy(null);
    setMarginRawText("");

    try {
      // Fetch market data in parallel
      const [indicesRes, fredRes, newsRes] = await Promise.all([
        fetch("/api/global-indices").then((r) => r.json()),
        fetch("/api/economic-calendar").then((r) => r.json()),
        fetch("/api/news?category=global").then((r) => r.json()),
      ]);

      // Fetch optional tone data + geopolitical risk + sentiment + JPX stats
      let earningsTone = null;
      let fedTone = null;
      let geopoliticalRisk = null;
      let fearGreed = null;
      let jpxStats = null;
      try {
        const [etRes, ftRes, geoRes, fgRes, jpxRes] = await Promise.all([
          fetch("/api/earnings-tone").then((r) => r.json()).catch(() => null),
          fetch("/api/fed-tone").then((r) => r.json()).catch(() => null),
          fetch("/api/geopolitical-risk").then((r) => r.json()).catch(() => null),
          fetch("/api/fear-greed").then((r) => r.json()).catch(() => null),
          fetch("/api/jpx-stats").then((r) => r.json()).catch(() => null),
        ]);
        earningsTone = etRes;
        fedTone = ftRes;
        geopoliticalRisk = geoRes;
        fearGreed = fgRes;
        jpxStats = jpxRes;
      } catch { /* optional */ }

      // Collect all tickers to scan: MARGIN_CANDIDATES + existing margin holdings
      const marginHoldingsList = holdings.filter((h) =>
        h.name?.includes("信用") || h.code?.includes("信用")
      );
      const extraTickers = marginHoldingsList
        .filter((h) => !MARGIN_CANDIDATES.some((c) => c.ticker === h.code))
        .map((h) => ({ ticker: h.code, name: h.name }));
      const allTickers = [...MARGIN_CANDIDATES, ...extraTickers];

      // Fetch market data for candidates in batches of 4
      interface CandidateData {
        ticker: string;
        name: string;
        close: number;
        rsi: number | null;
        macdHistogram: number | null;
        bbPosition: string | null;
        signal: string;
        score: number;
        atr14: number | null;
        volume: number;
        avgVolume: number;
        change5d: number;
        change20d: number;
      }
      const candidateTickers: CandidateData[] = [];

      for (let i = 0; i < allTickers.length; i += 4) {
        const batch = allTickers.slice(i, i + 4);
        const batchResults = await Promise.all(
          batch.map(async (t) => {
            try {
              const res = await fetch(`/api/market?ticker=${encodeURIComponent(t.ticker)}&period=6mo`);
              const data = await res.json();
              if (data.prices && data.prices.length >= 30) {
                const closes = data.prices.map((p: { close: number }) => p.close);
                const highs = data.prices.map((p: { high: number }) => p.high);
                const lows = data.prices.map((p: { low: number }) => p.low);
                const volumes = data.prices.map((p: { volume: number }) => p.volume);
                const { signal, score, rsiVal, macdHist, bbPos } = generateSignal(closes, highs, lows);
                const atrValues = atr(highs, lows, closes, 14);
                const atr14 = atrValues[atrValues.length - 1];
                const currentClose = closes[closes.length - 1];
                const close5dAgo = closes[closes.length - 6] || closes[0];
                const close20dAgo = closes[closes.length - 21] || closes[0];
                const currentVolume = volumes[volumes.length - 1] || 0;
                const avgVolume = volumes.slice(-20).reduce((a: number, b: number) => a + b, 0) / Math.min(20, volumes.length);

                return {
                  ticker: t.ticker,
                  name: t.name,
                  close: currentClose,
                  rsi: rsiVal,
                  macdHistogram: macdHist,
                  bbPosition: bbPos,
                  signal,
                  score,
                  atr14,
                  volume: currentVolume,
                  avgVolume: Math.round(avgVolume),
                  change5d: ((currentClose - close5dAgo) / close5dAgo) * 100,
                  change20d: ((currentClose - close20dAgo) / close20dAgo) * 100,
                } as CandidateData;
              }
            } catch { /* skip failed tickers */ }
            return null;
          })
        );
        candidateTickers.push(...batchResults.filter((r): r is CandidateData => r !== null));
      }

      // Build margin holdings for existing positions
      const marginHoldings = marginHoldingsList.map((h) => ({
        ticker: h.code,
        name: h.name,
        direction: h.name?.includes("空売") ? "空売り" : "信用買い",
        entryPrice: h.avgPrice,
        currentPrice: h.currentPrice,
        quantity: h.quantity,
        pnl: h.pnl,
        pnlPercent: h.pnlPercent,
      }));

      const res = await fetch("/api/margin-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          indices: Object.values(indicesRes),
          fredData: fredRes.data,
          news: newsRes.news,
          earningsTone,
          fedTone,
          geopoliticalRisk,
          fearGreed,
          jpxStats,
          candidateTickers,
          marginHoldings,
        }),
      });
      const data = await res.json();

      if (data.strategy) {
        setMarginStrategy(data.strategy);
      } else if (data.rawText) {
        const recovered = tryRecoverJson<MarginStrategy>(data.rawText, (s) => !!(s.marketVerdict || s.marginBuyCandidates));
        if (recovered) {
          setMarginStrategy(recovered);
        } else {
          setMarginRawText(data.rawText);
        }
      } else if (data.error) {
        setMarginRawText(`エラー: ${data.error}`);
      }
    } catch {
      setMarginRawText("信用取引分析の生成に失敗しました。");
    }
    setMarginLoading(false);
  };

  const quickQuestions = [
    "今の相場環境で配当利回りが高いおすすめ銘柄は？",
    "100万円で分散投資するならどう配分する？",
    "株主優待が充実している銘柄を教えて",
    "信用取引で短期トレードするならどの銘柄？",
    "今の円安環境で有利な投資先は？",
    "NISAで長期保有するのにおすすめの銘柄は？",
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">AI投資アドバイザー</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab("morning")}
          className={clsx(
            "px-4 py-2 rounded-t text-sm font-medium",
            activeTab === "morning"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:bg-zinc-800/50"
          )}
        >
          モーニングブリーフ
        </button>
        <button
          onClick={() => setActiveTab("strategy")}
          className={clsx(
            "px-4 py-2 rounded-t text-sm font-medium",
            activeTab === "strategy"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:bg-zinc-800/50"
          )}
        >
          投資戦略
        </button>
        <button
          onClick={() => setActiveTab("margin")}
          className={clsx(
            "px-4 py-2 rounded-t text-sm font-medium",
            activeTab === "margin"
              ? "bg-red-900/80 text-red-200 border-b-2 border-red-500"
              : "text-red-400/70 hover:bg-red-950/30"
          )}
        >
          信用取引
        </button>
        <button
          onClick={() => setActiveTab("chat")}
          className={clsx(
            "px-4 py-2 rounded-t text-sm font-medium",
            activeTab === "chat"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:bg-zinc-800/50"
          )}
        >
          AI相談
        </button>
        <button
          onClick={() => setActiveTab("news")}
          className={clsx(
            "px-4 py-2 rounded-t text-sm font-medium",
            activeTab === "news"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:bg-zinc-800/50"
          )}
        >
          ニュース分析
        </button>
      </div>

      {/* ===== MORNING BRIEF TAB ===== */}
      {activeTab === "morning" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-zinc-400">
              機関投資家レベルのモーニングブリーフ。夜間の動き、セクター動向、今日のカタリストを一覧。
            </p>
            <button
              onClick={generateMorningBrief}
              disabled={morningLoading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium"
            >
              {morningLoading ? "生成中..." : "ブリーフ生成"}
            </button>
          </div>

          {morningLoading && (
            <div className="text-center text-zinc-500 py-12">
              <div className="animate-pulse">市場データを収集し、モーニングブリーフを生成中...</div>
            </div>
          )}

          {morningBrief && (
            <div className="space-y-4">
              {/* One Line Call */}
              <div className="border border-blue-800/50 bg-blue-950/20 rounded-lg p-4 text-center">
                <div className="text-xs text-blue-400 mb-1">Today&apos;s Call</div>
                <div className="text-lg font-bold text-blue-300">{morningBrief.oneLineCall}</div>
                <div className="text-xs text-zinc-500 mt-1">{morningBrief.marketRegime}</div>
              </div>

              {/* Risk Dashboard */}
              <div className={clsx(
                "border rounded-lg p-4",
                RISK_COLORS[morningBrief.riskDashboard?.overallRisk] || RISK_COLORS.MEDIUM
              )}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">
                    {morningBrief.riskDashboard?.overallRisk === "LOW" ? "🟢" :
                     morningBrief.riskDashboard?.overallRisk === "MEDIUM" ? "🟡" :
                     morningBrief.riskDashboard?.overallRisk === "HIGH" ? "🟠" : "🔴"}
                  </span>
                  <span className="font-bold">
                    リスク: {RISK_LABELS[morningBrief.riskDashboard?.overallRisk] || morningBrief.riskDashboard?.overallRisk}
                  </span>
                </div>
                {morningBrief.riskDashboard?.topRisks?.map((r, i) => (
                  <div key={i} className="text-sm text-zinc-300 ml-6">• {r}</div>
                ))}
                {morningBrief.riskDashboard?.blackSwan && (
                  <div className="text-xs text-red-400/70 mt-2 ml-6">
                    テールリスク: {morningBrief.riskDashboard.blackSwan}
                  </div>
                )}
              </div>

              {/* Overnight Summary */}
              <div className="border border-zinc-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-zinc-400 mb-2">夜間サマリー</h3>
                <p className="text-sm text-zinc-300 leading-relaxed">{morningBrief.overnightSummary}</p>
              </div>

              {/* Key Movers */}
              {morningBrief.keyMovers?.length > 0 && (
                <div className="border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-400 mb-2">主要変動銘柄</h3>
                  <div className="space-y-1">
                    {morningBrief.keyMovers.map((m, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <TickerLink ticker={m.ticker} />
                        <span className={clsx(
                          "font-mono font-bold",
                          m.move.startsWith("+") ? "text-green-400" : "text-red-400"
                        )}>{m.move}</span>
                        <span className="text-zinc-500">{m.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sector Heatmap */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-green-800/30 bg-green-950/10 rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-green-400 mb-2">HOT セクター</h3>
                  {morningBrief.sectorHeatmap?.hot?.map((s, i) => (
                    <div key={i} className="text-sm text-green-300 mb-1">+ {s}</div>
                  ))}
                </div>
                <div className="border border-red-800/30 bg-red-950/10 rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-red-400 mb-2">COLD セクター</h3>
                  {morningBrief.sectorHeatmap?.cold?.map((s, i) => (
                    <div key={i} className="text-sm text-red-300 mb-1">- {s}</div>
                  ))}
                </div>
              </div>

              {/* Macro Snapshot */}
              <div className="border border-zinc-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-zinc-400 mb-2">マクロスナップショット</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-zinc-500">イールドカーブ: </span><span className="text-zinc-300">{morningBrief.macroSnapshot?.yieldCurve}</span></div>
                  <div><span className="text-zinc-500">ドル円: </span><span className="text-zinc-300">{morningBrief.macroSnapshot?.dollarYen}</span></div>
                  <div><span className="text-zinc-500">VIX: </span><span className="text-zinc-300">{morningBrief.macroSnapshot?.vix}</span></div>
                  <div><span className="text-zinc-500">FRB期待: </span><span className="text-zinc-300">{morningBrief.macroSnapshot?.fedExpectation}</span></div>
                </div>
              </div>

              {/* Today's Catalysts */}
              {morningBrief.todaysCatalysts?.length > 0 && (
                <div className="border border-yellow-800/30 bg-yellow-950/10 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-yellow-400 mb-2">今日のカタリスト</h3>
                  {morningBrief.todaysCatalysts.map((c, i) => (
                    <div key={i} className="flex gap-3 text-sm mb-1">
                      <span className="text-yellow-500 font-mono shrink-0">{c.time}</span>
                      <span className="text-zinc-300">{c.event}</span>
                      <span className="text-zinc-500">{c.expectedImpact}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Holdings Alerts */}
              {morningBrief.holdingsAlert?.length > 0 && (
                <div className="border border-orange-800/30 bg-orange-950/10 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-orange-400 mb-2">保有銘柄アラート</h3>
                  {morningBrief.holdingsAlert.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm mb-2">
                      <TickerLink ticker={a.ticker} />
                      <div>
                        <div className="text-zinc-300">{a.alert}</div>
                        <div className="text-orange-400 text-xs">{a.action}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Trade Ideas */}
              {morningBrief.tradeIdeas?.length > 0 && (
                <div className="border border-purple-800/30 bg-purple-950/10 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-purple-400 mb-2">トレードアイデア</h3>
                  {morningBrief.tradeIdeas.map((t, i) => (
                    <div key={i} className="border border-zinc-800 rounded p-3 mb-2 bg-zinc-900/50">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={clsx(
                          "px-1.5 py-0.5 rounded text-xs font-bold",
                          t.type === "long" ? "bg-green-500/20 text-green-400" :
                          t.type === "short" ? "bg-red-500/20 text-red-400" :
                          "bg-blue-500/20 text-blue-400"
                        )}>
                          {t.type.toUpperCase()}
                        </span>
                        <TickerLink ticker={t.ticker} />
                        <span className={clsx(
                          "px-1.5 py-0.5 rounded text-xs",
                          t.conviction === "high" ? "bg-green-800/30 text-green-400" :
                          t.conviction === "medium" ? "bg-yellow-800/30 text-yellow-400" :
                          "bg-zinc-700 text-zinc-400"
                        )}>
                          {t.conviction}
                        </span>
                      </div>
                      <div className="text-sm text-zinc-300">{t.thesis}</div>
                      <div className="flex gap-3 mt-1 text-xs">
                        <span className="text-zinc-500">Entry: <span className="text-white font-mono">{t.entry}</span></span>
                        <span className="text-zinc-500">Target: <span className="text-green-400 font-mono">{t.target}</span></span>
                        <span className="text-zinc-500">Stop: <span className="text-red-400 font-mono">{t.stop}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick jump */}
              <div className="text-center flex gap-3 justify-center">
                <button onClick={() => setActiveTab("strategy")} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">
                  詳細戦略を見る →
                </button>
                <button onClick={() => setActiveTab("chat")} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">
                  AIに相談する →
                </button>
              </div>
            </div>
          )}

          {morningRawText && !morningBrief && (
            <div className="border border-zinc-800 rounded-lg p-4">
              <MarkdownRenderer content={morningRawText} />
            </div>
          )}

          {!morningBrief && !morningRawText && !morningLoading && (
            <div className="text-center text-zinc-500 mt-12">
              <p className="text-lg">「ブリーフ生成」で今日のモーニングブリーフを取得</p>
              <p className="text-sm mt-2">
                夜間の市場動向、セクター動向、カタリスト、トレードアイデアを
                <br />
                機関投資家レベルで一覧表示します
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===== STRATEGY TAB ===== */}
      {activeTab === "strategy" && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <p className="text-sm text-zinc-400">
              市場データ・経済指標・ニュース
              {holdings.length > 0 && `・保有${holdings.length}銘柄`}
              を統合分析
            </p>
            <button
              onClick={generateStrategy}
              disabled={strategyLoading}
              className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-bold transition-colors"
            >
              {strategyLoading ? "分析中..." : "戦略を生成"}
            </button>
          </div>

          {strategyLoading && (
            <div className="text-center text-zinc-500 py-16">
              <div className="inline-block w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4" />
              <div className="text-sm">市場データを収集し、戦略を生成中...</div>
            </div>
          )}

          {strategy && (
            <div className="space-y-5">

              {/* ── EXECUTIVE DASHBOARD ── */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
                {/* Market Overview */}
                <div className="border border-zinc-800 rounded-xl p-5 bg-gradient-to-br from-zinc-900/80 to-zinc-950">
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-base font-bold text-zinc-100">市場概況</h2>
                    {strategy.macroRegime && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
                        {strategy.macroRegime}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed">{strategy.marketOverview}</p>
                </div>

                {/* Risk Gauge */}
                <div className={clsx(
                  "border rounded-xl p-5 flex flex-col items-center justify-center text-center",
                  RISK_COLORS[strategy.riskLevel] || RISK_COLORS.MEDIUM
                )}>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-400 mb-1">Risk Level</div>
                  <div className="text-2xl font-black mb-2">
                    {RISK_LABELS[strategy.riskLevel] || strategy.riskLevel}
                  </div>
                  {/* Gauge bar */}
                  <div className="w-full h-2 rounded-full bg-zinc-800/80 overflow-hidden mb-3">
                    <div
                      className={clsx("h-full rounded-full bg-gradient-to-r transition-all duration-1000", RISK_GRADIENT_COLORS[strategy.riskLevel] || "from-yellow-500 to-yellow-600")}
                      style={{ width: `${riskToPercent(strategy.riskLevel)}%` }}
                    />
                  </div>
                  <p className="text-xs leading-relaxed opacity-80">{strategy.riskComment}</p>
                </div>
              </div>

              {/* ── PORTFOLIO HEALTH ── */}
              {strategy.portfolioHealth && (
                <div className="border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="bg-yellow-500/5 border-b border-zinc-800 px-5 py-3 flex items-center gap-2">
                    <span className="text-yellow-400 text-sm">&#9888;</span>
                    <h2 className="text-sm font-bold text-yellow-400">ポートフォリオ診断</h2>
                  </div>
                  <div className="p-5">
                    {/* KPI row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div className="bg-zinc-900/60 rounded-lg p-3">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">セクター集中度</div>
                        <div className={clsx(
                          "text-sm font-bold",
                          strategy.portfolioHealth.sectorConcentration === "問題なし" ? "text-green-400" :
                          strategy.portfolioHealth.sectorConcentration === "やや偏り" ? "text-yellow-400" :
                          "text-red-400"
                        )}>
                          {strategy.portfolioHealth.sectorConcentration}
                        </div>
                      </div>
                      <div className="bg-zinc-900/60 rounded-lg p-3 md:col-span-2">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">最大リスク</div>
                        <div className="text-sm text-zinc-300">{strategy.portfolioHealth.topRisk}</div>
                      </div>
                    </div>

                    {/* Drift alert */}
                    {strategy.portfolioHealth.driftAlert && (
                      <div className="bg-orange-500/5 border border-orange-800/30 rounded-lg p-3 mb-4">
                        <div className="text-[10px] uppercase tracking-wider text-orange-500 mb-1">ドリフト警告</div>
                        <div className="text-sm text-orange-300">{strategy.portfolioHealth.driftAlert}</div>
                      </div>
                    )}

                    {/* Rebalance actions */}
                    {strategy.portfolioHealth.rebalanceActions?.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">リバランス提案</div>
                        <div className="space-y-2">
                          {strategy.portfolioHealth.rebalanceActions.map((a, i) => (
                            <div key={i} className="flex items-start gap-2.5 text-sm bg-zinc-900/40 rounded-lg px-3 py-2.5">
                              <span className="text-yellow-500 shrink-0 mt-0.5 font-bold">{i + 1}</span>
                              <span className="text-zinc-300">{a}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── HOLDINGS VERDICT ── */}
              {strategy.holdingsVerdict && strategy.holdingsVerdict.length > 0 && (
                <div className="border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="bg-zinc-900/80 border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-zinc-200">保有銘柄判定</h2>
                    <span className="text-xs text-zinc-500 font-mono">{strategy.holdingsVerdict.length} holdings</span>
                  </div>
                  <div className="divide-y divide-zinc-800/60">
                    {strategy.holdingsVerdict.map((hv, i) => (
                      <div key={i} className="px-5 py-3 flex items-center gap-3 hover:bg-zinc-800/20 transition-colors">
                        <TickerLink ticker={hv.ticker} className="font-mono text-blue-400 font-bold text-sm w-16 shrink-0" />
                        <span className={clsx(
                          "px-2 py-0.5 rounded text-xs font-bold shrink-0 min-w-[60px] text-center",
                          hv.action === "損切り" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                          hv.action === "全利確" || hv.action === "部分利確" ? "bg-green-500/20 text-green-400 border border-green-500/30" :
                          hv.action === "買い増し" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" :
                          "bg-zinc-700/50 text-zinc-300 border border-zinc-600/30"
                        )}>
                          {hv.action}
                        </span>
                        <span className={clsx(
                          "text-xs px-1.5 py-0.5 rounded shrink-0",
                          hv.thesisStatus === "有効" ? "text-green-400 bg-green-500/10" :
                          hv.thesisStatus === "崩壊" ? "text-red-400 bg-red-500/10" :
                          "text-yellow-400 bg-yellow-500/10"
                        )}>
                          {hv.thesisStatus}
                        </span>
                        <span className="text-xs text-zinc-500 flex-1 truncate">{hv.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── CATALYST TIMELINE ── */}
              {strategy.catalysts && strategy.catalysts.length > 0 && (
                <div className="border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="bg-zinc-900/80 border-b border-zinc-800 px-5 py-3">
                    <h2 className="text-sm font-bold text-zinc-200">カタリスト・タイムライン</h2>
                  </div>
                  <div className="p-5">
                    <div className="relative border-l-2 border-zinc-700/60 ml-3 space-y-5">
                      {strategy.catalysts.map((c, i) => (
                        <div key={i} className="relative pl-7">
                          {/* Timeline dot */}
                          <div className={clsx(
                            "absolute -left-[9px] top-0.5 w-4 h-4 rounded-full border-2",
                            i === 0 ? "bg-blue-500/30 border-blue-400" : "bg-zinc-800 border-zinc-600"
                          )} />
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono text-blue-400 shrink-0 bg-blue-500/10 px-2 py-0.5 rounded">{c.date}</span>
                              <span className="text-sm font-medium text-zinc-200">{c.event}</span>
                            </div>
                            <p className="text-xs text-zinc-500 leading-relaxed">{c.impact}</p>
                            {c.affectedTickers?.length > 0 && (
                              <div className="flex gap-1.5 mt-0.5">
                                {c.affectedTickers.map((t, j) => (
                                  <TickerLink key={j} ticker={t} className="text-xs font-mono text-blue-400/70 hover:text-blue-400" />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── STRATEGY SECTIONS (Short / Mid / Long) ── */}
              {(["shortTerm", "midTerm", "longTerm"] as const).map((key) => {
                const section = strategy.strategies[key];
                if (!section) return null;
                const config = {
                  shortTerm: { gradient: "from-orange-500/8 to-transparent", accent: "border-orange-800/40", badge: "bg-orange-500/15 text-orange-400" },
                  midTerm: { gradient: "from-blue-500/8 to-transparent", accent: "border-blue-800/40", badge: "bg-blue-500/15 text-blue-400" },
                  longTerm: { gradient: "from-emerald-500/8 to-transparent", accent: "border-emerald-800/40", badge: "bg-emerald-500/15 text-emerald-400" },
                }[key];

                return (
                  <div key={key} className={clsx("border rounded-xl overflow-hidden", config.accent)}>
                    {/* Section header */}
                    <div className={`bg-gradient-to-r ${config.gradient} border-b border-zinc-800/60 px-5 py-4`}>
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-base font-bold text-zinc-100">{section.title}</h2>
                        <span className={clsx("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", config.badge)}>
                          {key === "shortTerm" ? "Short" : key === "midTerm" ? "Mid" : "Long"}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-400">{section.description}</p>
                    </div>

                    {/* Picks as expandable rows */}
                    <div className="divide-y divide-zinc-800/40">
                      {section.picks?.map((pick, i) => {
                        const pickId = `${key}-${i}`;
                        const isExpanded = expandedPicks.has(pickId);

                        return (
                          <div key={i} className="bg-zinc-950/30">
                            {/* Pick summary row (always visible, clickable) */}
                            <button
                              onClick={() => togglePick(pickId)}
                              className="w-full px-5 py-4 flex items-center gap-3 hover:bg-zinc-800/20 transition-colors text-left"
                            >
                              {/* Ticker + Name + Action */}
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <TickerLink ticker={pick.ticker} className="font-mono text-blue-400 font-bold text-sm shrink-0" />
                                <span className="text-sm text-zinc-300 truncate">{pick.name}</span>
                                <span className={clsx(
                                  "px-2 py-0.5 rounded text-xs font-bold shrink-0",
                                  pick.action.includes("買") ? "bg-green-500/20 text-green-400" :
                                  pick.action.includes("売") ? "bg-red-500/20 text-red-400" :
                                  "bg-zinc-700 text-zinc-300"
                                )}>
                                  {pick.action}
                                </span>
                              </div>

                              {/* Price range mini */}
                              <div className="hidden lg:flex items-center gap-1 text-xs shrink-0">
                                <span className="text-zinc-500 font-mono">¥{pick.entryPrice?.toLocaleString()}</span>
                                <span className="text-zinc-600">→</span>
                                <span className="text-green-400 font-mono">¥{pick.targetPrice?.toLocaleString()}</span>
                              </div>

                              {/* Win probability */}
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="w-14 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                  <div
                                    className={clsx(
                                      "h-full rounded-full",
                                      pick.winProbability >= 60 ? "bg-green-500" :
                                      pick.winProbability >= 45 ? "bg-yellow-500" : "bg-red-500"
                                    )}
                                    style={{ width: `${pick.winProbability}%` }}
                                  />
                                </div>
                                <span className={clsx(
                                  "text-sm font-bold font-mono w-10 text-right",
                                  pick.winProbability >= 60 ? "text-green-400" :
                                  pick.winProbability >= 45 ? "text-yellow-400" : "text-red-400"
                                )}>
                                  {pick.winProbability}%
                                </span>
                              </div>

                              {/* Chevron */}
                              <ChevronDown className={clsx(
                                "w-4 h-4 text-zinc-500 transition-transform duration-200 shrink-0",
                                isExpanded && "rotate-180"
                              )} />
                            </button>

                            {/* Expanded detail panel */}
                            {isExpanded && (
                              <div className="px-5 pb-5 space-y-4 border-t border-zinc-800/30 bg-zinc-900/20">
                                {/* Reason */}
                                <p className="text-sm text-zinc-400 pt-4 leading-relaxed">{pick.reason}</p>

                                {/* Thesis & Exit condition */}
                                {(pick.thesis || pick.thesisBreaker) && (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {pick.thesis && (
                                      <div className="bg-cyan-500/5 border border-cyan-800/20 rounded-lg p-3">
                                        <div className="text-[10px] uppercase tracking-wider text-cyan-500 font-bold mb-1">投資テーゼ</div>
                                        <div className="text-sm text-zinc-300 leading-relaxed">{pick.thesis}</div>
                                      </div>
                                    )}
                                    {pick.thesisBreaker && (
                                      <div className="bg-red-500/5 border border-red-800/20 rounded-lg p-3">
                                        <div className="text-[10px] uppercase tracking-wider text-red-500 font-bold mb-1">撤退条件</div>
                                        <div className="text-sm text-zinc-400 leading-relaxed">{pick.thesisBreaker}</div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Valuation */}
                                {pick.valuation && (
                                  <div className="bg-purple-500/5 border border-purple-800/20 rounded-lg p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-purple-500 font-bold mb-1">バリュエーション</div>
                                    <div className="text-sm text-zinc-400 leading-relaxed">{pick.valuation}</div>
                                  </div>
                                )}

                                {/* Price targets grid */}
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                  <div className="bg-zinc-900/80 rounded-lg p-3 text-center">
                                    <div className="text-[10px] text-zinc-500 mb-1">Entry</div>
                                    <div className="text-lg font-black font-mono text-white">¥{pick.entryPrice?.toLocaleString()}</div>
                                  </div>
                                  <div className="bg-zinc-900/80 rounded-lg p-3 text-center">
                                    <div className="text-[10px] text-zinc-500 mb-1">Target</div>
                                    <div className="text-lg font-black font-mono text-green-400">¥{pick.targetPrice?.toLocaleString()}</div>
                                  </div>
                                  <div className="bg-zinc-900/80 rounded-lg p-3 text-center">
                                    <div className="text-[10px] text-zinc-500 mb-1">Stop Loss</div>
                                    <div className="text-lg font-black font-mono text-red-400">¥{pick.stopLoss?.toLocaleString()}</div>
                                  </div>
                                  <div className="bg-zinc-900/80 rounded-lg p-3 text-center">
                                    <div className="text-[10px] text-zinc-500 mb-1">Risk/Reward</div>
                                    <div className="text-lg font-black font-mono text-cyan-400">{pick.riskReward}</div>
                                  </div>
                                  <div className="bg-zinc-900/80 rounded-lg p-3 text-center">
                                    <div className="text-[10px] text-zinc-500 mb-1">Timeframe</div>
                                    <div className="text-base font-bold text-zinc-300">{pick.timeframe}</div>
                                  </div>
                                </div>

                                {/* IFDOCO Order Ticket */}
                                {pick.ifdoco && (
                                  <div className="border-2 border-yellow-700/30 bg-yellow-950/5 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                                      <span className="text-sm font-bold text-yellow-400">IFDOCO注文</span>
                                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">SBI証券</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                      <div className="bg-zinc-900/80 rounded-lg p-4 text-center">
                                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">IF 新規建て</div>
                                        <div className="text-xs text-zinc-400 mb-1">{pick.ifdoco.entryOrder.type}</div>
                                        <div className="text-2xl font-black font-mono text-white">¥{pick.ifdoco.entryOrder.price?.toLocaleString()}</div>
                                      </div>
                                      <div className="bg-zinc-900/80 rounded-lg p-4 text-center border border-green-800/20">
                                        <div className="text-[10px] text-green-500 uppercase tracking-wider mb-1">OCO 利確</div>
                                        <div className="text-xs text-zinc-400 mb-1">{pick.ifdoco.takeProfit.type}</div>
                                        <div className="text-2xl font-black font-mono text-green-400">¥{pick.ifdoco.takeProfit.price?.toLocaleString()}</div>
                                      </div>
                                      <div className="bg-zinc-900/80 rounded-lg p-4 text-center border border-red-800/20">
                                        <div className="text-[10px] text-red-500 uppercase tracking-wider mb-1">OCO 損切</div>
                                        <div className="text-xs text-zinc-400 mb-1">{pick.ifdoco.stopLoss.type}</div>
                                        <div className="text-2xl font-black font-mono text-red-400">¥{pick.ifdoco.stopLoss.price?.toLocaleString()}</div>
                                      </div>
                                    </div>
                                    {(pick.holdingPeriod || pick.exitDate) && (
                                      <div className="flex gap-6 mt-3 text-xs justify-center text-zinc-400">
                                        {pick.holdingPeriod && <span>保有期間: <span className="text-zinc-300">{pick.holdingPeriod}</span></span>}
                                        {pick.exitDate && <span>決済予定: <span className="text-yellow-400">{pick.exitDate}</span></span>}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Dividend & Benefits */}
                                {(pick.dividend || pick.shareholderBenefits) && (
                                  <div className="flex flex-wrap gap-3">
                                    {pick.dividend && (
                                      <div className="bg-zinc-900/60 rounded-lg px-3 py-2 text-sm">
                                        <span className="text-zinc-500 text-xs mr-1">配当:</span>
                                        <span className="text-yellow-400 font-medium">{pick.dividend}</span>
                                      </div>
                                    )}
                                    {pick.shareholderBenefits && (
                                      <div className="bg-zinc-900/60 rounded-lg px-3 py-2 text-sm">
                                        <span className="text-zinc-500 text-xs mr-1">優待:</span>
                                        <span className="text-pink-400 font-medium">{pick.shareholderBenefits}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* ── OVERALL ADVICE ── */}
              <div className="border border-purple-800/30 bg-gradient-to-br from-purple-950/20 to-zinc-950 rounded-xl p-6">
                <h2 className="text-base font-bold mb-3 text-zinc-100">全体アドバイス</h2>
                <p className="text-sm text-zinc-300 leading-relaxed">{strategy.overallAdvice}</p>
              </div>

              {/* ── WATCH LIST ── */}
              {strategy.watchList && strategy.watchList.length > 0 && (
                <div className="border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="bg-zinc-900/80 border-b border-zinc-800 px-5 py-3">
                    <h2 className="text-sm font-bold text-zinc-200">注目ポイント</h2>
                  </div>
                  <div className="p-5">
                    <ul className="space-y-2">
                      {strategy.watchList.map((item, i) => (
                        <li key={i} className="text-sm text-zinc-300 flex gap-2">
                          <span className="text-yellow-500 shrink-0">&#x25CF;</span>
                          <span>{renderWithTickerLinks(item)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* ── TAX OPTIMIZATION ── */}
              {strategy.taxOptimization && (
                <div className="border border-emerald-800/20 bg-emerald-950/5 rounded-xl p-5">
                  <h2 className="text-sm font-bold text-emerald-400 mb-2">税金最適化</h2>
                  <p className="text-sm text-zinc-300 leading-relaxed">{strategy.taxOptimization}</p>
                </div>
              )}

              {/* ── DISCLAIMER ── */}
              <div className="text-xs text-zinc-600 p-4 border border-zinc-800/30 rounded-xl bg-zinc-950/50">
                {strategy.disclaimer || "本分析は情報提供を目的としたものであり、投資助言ではありません。投資判断は自己責任でお願いします。"}
              </div>

              {/* Quick jump */}
              <div className="text-center">
                <button
                  onClick={() => setActiveTab("chat")}
                  className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors"
                >
                  この戦略についてAIに相談する →
                </button>
              </div>
            </div>
          )}

          {rawText && !strategy && (
            <div className="border border-zinc-800 rounded-xl p-5">
              <MarkdownRenderer content={rawText} />
            </div>
          )}

          {!strategy && !rawText && !strategyLoading && (
            <div className="text-center text-zinc-500 mt-16 space-y-3">
              <div className="text-4xl opacity-20">&#128202;</div>
              <p className="text-lg font-medium">投資戦略を生成</p>
              <p className="text-sm max-w-lg mx-auto leading-relaxed">
                世界市場データ・経済指標・ニュース
                {holdings.length > 0 && `・保有${holdings.length}銘柄のシグナル`}
                を総合分析し、短期・中期・長期の具体的銘柄推薦を生成します
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===== MARGIN TRADING TAB ===== */}
      {activeTab === "margin" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-zinc-400">
              信用取引専用分析。大型株{MARGIN_CANDIDATES.length}銘柄をスキャンし、IFDOCO注文値を生成。
              {holdings.length > 0 && ` 保有${holdings.length}銘柄の信用ポジションも管理。`}
            </p>
            <button
              onClick={generateMarginStrategy}
              disabled={marginLoading}
              className="px-6 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg text-sm font-medium"
            >
              {marginLoading ? "分析中..." : "信用取引分析を生成"}
            </button>
          </div>

          {marginLoading && (
            <div className="text-center text-zinc-500 py-12">
              <div className="animate-pulse">
                {MARGIN_CANDIDATES.length}銘柄のテクニカルデータを収集し、信用取引戦略を生成中...（60秒ほどかかります）
              </div>
            </div>
          )}

          {marginStrategy && (
            <div className="space-y-4">
              {/* Market Verdict Banner */}
              <div className={clsx(
                "border-2 rounded-lg p-5 text-center",
                VERDICT_COLORS[marginStrategy.marketVerdict?.signal] || VERDICT_COLORS.CAUTION
              )}>
                <div className="text-3xl font-black mb-1">
                  {marginStrategy.marketVerdict?.signal === "GO" ? "GO" :
                   marginStrategy.marketVerdict?.signal === "CAUTION" ? "CAUTION" : "NO TRADE"}
                </div>
                <div className="text-sm opacity-80 mb-2">
                  確信度: {marginStrategy.marketVerdict?.confidence}% /
                  ボラティリティ: {marginStrategy.marketVerdict?.volatilityRegime} /
                  トレンド: {marginStrategy.marketVerdict?.trendDirection}
                </div>
                <div className="text-sm leading-relaxed">{marginStrategy.marketVerdict?.reasoning}</div>
                {marginStrategy.marketVerdict?.keyFactors?.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center mt-3">
                    {marginStrategy.marketVerdict.keyFactors.map((f, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-black/30 text-xs">{f}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Risk Dashboard */}
              {marginStrategy.riskDashboard && (
                <div className="border border-zinc-800 rounded-lg p-4">
                  <h2 className="text-sm font-semibold text-zinc-400 mb-3">リスクダッシュボード</h2>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-zinc-900 rounded p-3 text-center">
                      <div className="text-xs text-zinc-500">証拠金使用率</div>
                      <div className="text-lg font-bold text-white">{marginStrategy.riskDashboard.recommendedMarginUtilization}</div>
                    </div>
                    <div className="bg-zinc-900 rounded p-3 text-center">
                      <div className="text-xs text-zinc-500">最大同時ポジション</div>
                      <div className="text-lg font-bold text-white">{marginStrategy.riskDashboard.maxConcurrentPositions}</div>
                    </div>
                    <div className="bg-zinc-900 rounded p-3 text-center">
                      <div className="text-xs text-zinc-500">ポートフォリオ温度</div>
                      <div className={clsx("text-lg font-bold", HEAT_COLORS[marginStrategy.riskDashboard.portfolioHeatLevel] || "text-white")}>
                        {marginStrategy.riskDashboard.portfolioHeatLevel}
                      </div>
                    </div>
                    <div className="bg-zinc-900 rounded p-3 text-center">
                      <div className="text-xs text-zinc-500">日次金利コスト</div>
                      <div className="text-sm font-bold text-orange-400">{marginStrategy.riskDashboard.dailyInterestCostEstimate}</div>
                    </div>
                    <div className="bg-zinc-900 rounded p-3 text-center">
                      <div className="text-xs text-zinc-500">週次時間コスト</div>
                      <div className="text-sm font-bold text-orange-400">{marginStrategy.riskDashboard.weeklyDecayCost}</div>
                    </div>
                    <div className="bg-zinc-900 rounded p-3 text-center">
                      <div className="text-xs text-zinc-500">維持率バッファ</div>
                      <div className="text-sm font-bold text-cyan-400">{marginStrategy.riskDashboard.marginMaintenanceBuffer}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* NO_TRADE Reason */}
              {marginStrategy.noTradeReason && (
                <div className="border-2 border-red-800 bg-red-950/20 rounded-lg p-5">
                  <div className="text-center mb-3">
                    <div className="text-lg font-bold text-red-400">最良のトレードはトレードしないこと</div>
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed">{marginStrategy.noTradeReason}</p>
                </div>
              )}

              {/* Existing Position Review */}
              {marginStrategy.existingPositionReview?.length > 0 && (
                <div className="border border-orange-800/50 bg-orange-950/10 rounded-lg p-4">
                  <h2 className="text-sm font-semibold text-orange-400 mb-3">既存ポジション管理</h2>
                  <div className="space-y-2">
                    {marginStrategy.existingPositionReview.map((pos, i) => (
                      <div key={i} className={clsx(
                        "border rounded-lg p-3 flex items-start gap-3",
                        URGENCY_COLORS[pos.urgency] || URGENCY_COLORS.LOW
                      )}>
                        <div className="shrink-0">
                          <TickerLink ticker={pos.ticker} />
                          <div className={clsx(
                            "text-xs font-bold mt-1 px-1.5 py-0.5 rounded text-center",
                            pos.urgency === "HIGH" ? "bg-red-500/30" : pos.urgency === "MEDIUM" ? "bg-yellow-500/30" : "bg-zinc-700"
                          )}>
                            {pos.urgency}
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={clsx(
                              "px-2 py-0.5 rounded text-xs font-bold",
                              pos.action.includes("損切") ? "bg-red-500/20 text-red-400" :
                              pos.action.includes("利確") ? "bg-green-500/20 text-green-400" :
                              "bg-zinc-700 text-zinc-300"
                            )}>
                              {pos.action}
                            </span>
                          </div>
                          <div className="text-sm text-zinc-300">{pos.reason}</div>
                          <div className="text-xs text-zinc-500 mt-1">{pos.targetAction}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Margin Buy Candidates */}
              {marginStrategy.marginBuyCandidates?.length > 0 && (
                <div className="border border-green-800/50 rounded-lg p-4">
                  <h2 className="text-lg font-semibold text-green-400 mb-3">信用買い候補</h2>
                  <div className="space-y-4">
                    {marginStrategy.marginBuyCandidates.map((trade, i) => (
                      <MarginTradeCard key={i} trade={trade} />
                    ))}
                  </div>
                </div>
              )}

              {/* Short Sell Candidates */}
              {marginStrategy.shortSellCandidates?.length > 0 && (
                <div className="border border-red-800/50 rounded-lg p-4">
                  <h2 className="text-lg font-semibold text-red-400 mb-3">空売り候補</h2>
                  <div className="mb-2 text-xs text-yellow-500 bg-yellow-950/20 border border-yellow-800/30 rounded p-2">
                    空売りには貸株料（年1.10%）が追加でかかります。逆日歩リスクにも注意してください。
                  </div>
                  <div className="space-y-4">
                    {marginStrategy.shortSellCandidates.map((trade, i) => (
                      <MarginTradeCard key={i} trade={trade} />
                    ))}
                  </div>
                </div>
              )}

              {/* Weekly Outlook */}
              {marginStrategy.weeklyOutlook && (
                <div className="border border-zinc-800 rounded-lg p-4">
                  <h2 className="text-sm font-semibold text-zinc-400 mb-2">週間アウトルック</h2>
                  <p className="text-sm text-zinc-300 leading-relaxed">{marginStrategy.weeklyOutlook}</p>
                </div>
              )}

              {/* Disclaimer */}
              <div className="text-xs text-red-600/80 p-3 border border-red-800/30 bg-red-950/10 rounded">
                {marginStrategy.disclaimer || "信用取引は元本を超える損失が発生する可能性があります。本分析は情報提供目的であり、投資助言ではありません。"}
              </div>

              {/* Quick jump */}
              <div className="text-center flex gap-3 justify-center">
                <button onClick={() => setActiveTab("strategy")} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">
                  現物戦略を見る →
                </button>
                <button onClick={() => setActiveTab("chat")} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">
                  AIに相談する →
                </button>
              </div>
            </div>
          )}

          {marginRawText && !marginStrategy && (
            <div className="border border-zinc-800 rounded-lg p-4">
              <MarkdownRenderer content={marginRawText} />
            </div>
          )}

          {!marginStrategy && !marginRawText && !marginLoading && (
            <div className="text-center text-zinc-500 mt-12">
              <p className="text-lg">「信用取引分析を生成」で信用取引戦略を取得</p>
              <p className="text-sm mt-2">
                大型株{MARGIN_CANDIDATES.length}銘柄のテクニカルスキャン、
                <br />
                IFDOCO注文値、リスク管理ダッシュボードを生成します
              </p>
              <p className="text-xs text-red-500/60 mt-4">
                信用取引は元本を超える損失が発生する可能性があります
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===== CHAT TAB ===== */}
      {activeTab === "chat" && (
        <div className="flex flex-col h-[calc(100vh-240px)]">
          {/* Quick questions */}
          {messages.length === 0 && (
            <div className="mb-4">
              <p className="text-sm text-zinc-400 mb-3">
                投資に関する質問を何でもどうぞ。配当、株主優待、銘柄分析、投資額の相談など。
                {holdings.length > 0 && `（保有${holdings.length}銘柄の情報を含めて回答します）`}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {quickQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setChatInput(q);
                    }}
                    className="text-left text-sm p-3 border border-zinc-800 rounded-lg hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat actions */}
          {messages.length > 0 && (
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-zinc-600">{messages.length}件のメッセージ</span>
              <div className="flex gap-2">
                <button
                  onClick={exportChatAsMarkdown}
                  className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200"
                >
                  MDで出力
                </button>
                <button
                  onClick={clearChat}
                  disabled={chatLoading}
                  className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 hover:text-red-400 disabled:opacity-50"
                >
                  履歴クリア
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 mb-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={clsx(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={clsx(
                    "max-w-[80%] rounded-lg p-3 text-sm",
                    msg.role === "user"
                      ? "bg-blue-600/30 border border-blue-800/50 text-blue-100"
                      : "bg-zinc-800 border border-zinc-700 text-zinc-200"
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="text-xs text-purple-400 mb-1 font-semibold">
                      AI投資アドバイザー
                    </div>
                  )}
                  {msg.role === "assistant" ? (
                    <MarkdownRenderer content={msg.content} />
                  ) : (
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-400 animate-pulse">
                  考え中...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 border-t border-zinc-800 pt-3">
            <textarea
              suppressHydrationWarning
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  sendChat();
                }
              }}
              placeholder="投資について質問（例: トヨタの配当利回りは？NISAでおすすめの銘柄は？）&#10;Enterで送信 / Shift+Enterで改行"
              rows={2}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-purple-500 resize-none"
            />
            {chatLoading ? (
              <button
                onClick={cancelChat}
                className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium"
              >
                キャンセル
              </button>
            ) : (
              <button
                onClick={sendChat}
                disabled={!chatInput.trim()}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium"
              >
                送信
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== NEWS ANALYSIS TAB ===== */}
      {activeTab === "news" && (
        <div>
          <p className="text-sm text-zinc-400 mb-4">
            Ground News等からニューステキストを貼り付けて、投資への影響を分析します
          </p>

          <div className="mb-4">
            <textarea
              value={newsText}
              onChange={(e) => setNewsText(e.target.value)}
              placeholder="ニュース記事のテキストをここに貼り付けてください..."
              className="w-full h-40 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-purple-500 resize-y"
            />
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-zinc-600">
                {newsText.length > 0 ? `${newsText.length}文字` : ""}
              </span>
              <button
                onClick={analyzeNews}
                disabled={newsLoading || !newsText.trim()}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium"
              >
                {newsLoading ? "分析中..." : "分析する"}
              </button>
            </div>
          </div>

          {newsLoading && (
            <div className="text-center text-zinc-500 py-8">
              <div className="animate-pulse">ニュースを分析中...</div>
            </div>
          )}

          {newsAnalysis && (
            <div className="space-y-4">
              {/* Sentiment & Impact */}
              <div className="flex gap-3">
                <div
                  className={clsx(
                    "px-3 py-1 rounded-full text-sm font-bold",
                    newsAnalysis.sentiment === "positive"
                      ? "bg-green-500/20 text-green-400"
                      : newsAnalysis.sentiment === "negative"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-zinc-700 text-zinc-300"
                  )}
                >
                  {newsAnalysis.sentiment === "positive"
                    ? "ポジティブ"
                    : newsAnalysis.sentiment === "negative"
                      ? "ネガティブ"
                      : "ニュートラル"}
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xs text-zinc-500">インパクト:</span>
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        "h-full rounded-full",
                        newsAnalysis.impactScore >= 7
                          ? "bg-red-500"
                          : newsAnalysis.impactScore >= 4
                            ? "bg-yellow-500"
                            : "bg-green-500"
                      )}
                      style={{ width: `${newsAnalysis.impactScore * 10}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono font-bold">
                    {newsAnalysis.impactScore}/10
                  </span>
                </div>
              </div>

              {/* Summary */}
              <div className="border border-zinc-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-zinc-400 mb-2">投資影響要約</h3>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {newsAnalysis.summary_ja}
                </p>
              </div>

              {/* Affected sectors & tickers */}
              <div className="grid grid-cols-2 gap-3">
                {newsAnalysis.affectedSectors?.length > 0 && (
                  <div className="border border-zinc-800 rounded-lg p-3">
                    <h3 className="text-xs font-semibold text-zinc-500 mb-2">影響セクター</h3>
                    <div className="flex flex-wrap gap-1">
                      {newsAnalysis.affectedSectors.map((s, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-300"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {newsAnalysis.affectedTickers?.length > 0 && (
                  <div className="border border-zinc-800 rounded-lg p-3">
                    <h3 className="text-xs font-semibold text-zinc-500 mb-2">影響銘柄</h3>
                    <div className="flex flex-wrap gap-2">
                      {newsAnalysis.affectedTickers.map((t, i) => (
                        <TickerLink key={i} ticker={t} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Holdings impact */}
              {newsAnalysis.holdingsImpact?.length > 0 && (
                <div className="border border-yellow-800/50 bg-yellow-950/10 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-yellow-400 mb-2">
                    保有銘柄への影響
                  </h3>
                  <div className="space-y-2">
                    {newsAnalysis.holdingsImpact.map((hi, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span
                          className={clsx(
                            "px-1.5 py-0.5 rounded text-xs font-bold shrink-0",
                            hi.impact === "positive"
                              ? "bg-green-500/20 text-green-400"
                              : hi.impact === "negative"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-zinc-700 text-zinc-300"
                          )}
                        >
                          {hi.impact === "positive"
                            ? "+"
                            : hi.impact === "negative"
                              ? "-"
                              : "="}
                        </span>
                        <TickerLink ticker={hi.ticker} />
                        <span className="text-zinc-400">{hi.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Competitive Impact */}
              {newsAnalysis.competitiveImpact && (
                <div className="grid grid-cols-2 gap-3">
                  {newsAnalysis.competitiveImpact.winners?.length > 0 && (
                    <div className="border border-green-800/30 bg-green-950/10 rounded-lg p-3">
                      <h3 className="text-xs font-semibold text-green-400 mb-2">勝者</h3>
                      {newsAnalysis.competitiveImpact.winners.map((w, i) => (
                        <div key={i} className="text-sm text-green-300 mb-1">{renderWithTickerLinks(w)}</div>
                      ))}
                    </div>
                  )}
                  {newsAnalysis.competitiveImpact.losers?.length > 0 && (
                    <div className="border border-red-800/30 bg-red-950/10 rounded-lg p-3">
                      <h3 className="text-xs font-semibold text-red-400 mb-2">敗者</h3>
                      {newsAnalysis.competitiveImpact.losers.map((l, i) => (
                        <div key={i} className="text-sm text-red-300 mb-1">{renderWithTickerLinks(l)}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Supply Chain & Macro */}
              {(newsAnalysis.supplyChainImpact || newsAnalysis.macroImplication || newsAnalysis.sectorRotation) && (
                <div className="border border-zinc-800 rounded-lg p-4 space-y-2">
                  {newsAnalysis.supplyChainImpact && (
                    <div className="text-sm"><span className="text-zinc-500">サプライチェーン: </span><span className="text-zinc-300">{newsAnalysis.supplyChainImpact}</span></div>
                  )}
                  {newsAnalysis.macroImplication && (
                    <div className="text-sm"><span className="text-zinc-500">マクロ影響: </span><span className="text-zinc-300">{newsAnalysis.macroImplication}</span></div>
                  )}
                  {newsAnalysis.sectorRotation && (
                    <div className="text-sm"><span className="text-zinc-500">セクターローテーション: </span><span className="text-zinc-300">{newsAnalysis.sectorRotation}</span></div>
                  )}
                </div>
              )}

              {/* Trading implication */}
              <div className="border border-purple-800/50 bg-purple-950/10 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-purple-400 mb-2">
                  投資アクション提案
                </h3>
                {typeof newsAnalysis.tradingImplication === "object" ? (
                  <div className="space-y-2 text-sm">
                    <div><span className="text-red-400 font-semibold">即座: </span><span className="text-zinc-300">{newsAnalysis.tradingImplication.immediate}</span></div>
                    <div><span className="text-yellow-400 font-semibold">短期: </span><span className="text-zinc-300">{newsAnalysis.tradingImplication.shortTerm}</span></div>
                    <div><span className="text-blue-400 font-semibold">中期: </span><span className="text-zinc-300">{newsAnalysis.tradingImplication.mediumTerm}</span></div>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-300 leading-relaxed">
                    {newsAnalysis.tradingImplication}
                  </p>
                )}
              </div>

              {/* Bias check & Contrarian */}
              <div className="border border-zinc-800 rounded-lg p-3 space-y-2">
                <div>
                  <h3 className="text-xs font-semibold text-zinc-500 mb-1">バイアスチェック</h3>
                  <p className="text-sm text-zinc-400">{newsAnalysis.biasCheck}</p>
                </div>
                {newsAnalysis.contrarian && (
                  <div>
                    <h3 className="text-xs font-semibold text-amber-500 mb-1">逆張り視点</h3>
                    <p className="text-sm text-amber-300/80">{newsAnalysis.contrarian}</p>
                  </div>
                )}
              </div>

              {/* Time horizon */}
              <div className="text-xs text-zinc-500">
                影響の時間軸:{" "}
                <span className="text-zinc-300">
                  {newsAnalysis.timeHorizon === "short"
                    ? "短期（数日〜数週間）"
                    : newsAnalysis.timeHorizon === "medium"
                      ? "中期（数週間〜数ヶ月）"
                      : "長期（数ヶ月〜数年）"}
                </span>
              </div>
            </div>
          )}

          {newsRawText && !newsAnalysis && (
            <div className="border border-zinc-800 rounded-lg p-4">
              <MarkdownRenderer content={newsRawText} />
            </div>
          )}

          {!newsAnalysis && !newsRawText && !newsLoading && newsText.length === 0 && (
            <div className="text-center text-zinc-500 mt-8">
              <p className="text-lg">ニューステキストを貼り付けて分析</p>
              <p className="text-sm mt-2">
                Ground News、日経新聞、Bloomberg等からテキストをコピーして
                <br />
                投資への影響をAIが分析します
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
