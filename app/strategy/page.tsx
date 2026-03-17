"use client";

import { useState, useEffect } from "react";
import { clsx } from "clsx";
import TickerLink from "@/components/TickerLink";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { generateSignal } from "@/lib/indicators";

/* ── Types ── */
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

interface SavedEntry {
  date: string;
  strategy: Strategy;
  generatedAt: string;
}

/* ── Constants ── */
const STORAGE_KEY = "daily-strategy-history";
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

/* ── Helpers ── */
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function renderWithTickerLinks(text: string) {
  const tickerRegex = /\b(\d{4}\.T|[A-Z]{2,5})\b/g;
  const parts: (string | { ticker: string; key: number })[] = [];
  let lastIndex = 0;
  let match;
  let keyCounter = 0;
  while ((match = tickerRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push({ ticker: match[1], key: keyCounter++ });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.map((p) =>
    typeof p === "string" ? p : <TickerLink key={p.key} ticker={p.ticker} />
  );
}

/* ── Calendar component ── */
function MonthCalendar({
  year,
  month,
  selectedDate,
  savedDates,
  onSelect,
}: {
  year: number;
  month: number;
  selectedDate: string;
  savedDates: Set<string>;
  onSelect: (d: string) => void;
}) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = toDateStr(new Date());
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayNames.map((dn, i) => (
          <div key={dn} className={clsx("text-center text-xs py-1", i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-zinc-500")}>
            {dn}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />;
          const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = ds === today;
          const isSelected = ds === selectedDate;
          const hasSaved = savedDates.has(ds);
          const dow = new Date(year, month, day).getDay();

          return (
            <button
              key={ds}
              onClick={() => onSelect(ds)}
              className={clsx(
                "relative h-10 rounded-lg text-sm font-medium transition-all",
                isSelected
                  ? "bg-purple-600 text-white ring-2 ring-purple-400"
                  : isToday
                    ? "bg-zinc-700 text-white"
                    : "hover:bg-zinc-800 text-zinc-300",
                dow === 0 && !isSelected && "text-red-400",
                dow === 6 && !isSelected && "text-blue-400"
              )}
            >
              {day}
              {hasSaved && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Pick Card ── */
function PickCard({ pick, borderColor }: { pick: Pick; borderColor: string }) {
  return (
    <div className={clsx("border rounded-lg p-3 bg-zinc-900/50", borderColor)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TickerLink ticker={pick.ticker} className="font-mono text-blue-400 font-bold hover:underline" />
          <span className="text-sm text-zinc-300">{pick.name}</span>
          <span className={clsx(
            "px-2 py-0.5 rounded text-xs font-bold",
            pick.action.includes("買") ? "bg-green-500/20 text-green-400" :
            pick.action.includes("売") ? "bg-red-500/20 text-red-400" :
            "bg-zinc-700 text-zinc-300"
          )}>
            {pick.action}
          </span>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-500">勝率</div>
          <div className={clsx(
            "text-lg font-bold",
            pick.winProbability >= 60 ? "text-green-400" :
            pick.winProbability >= 45 ? "text-yellow-400" : "text-red-400"
          )}>
            {pick.winProbability}%
          </div>
        </div>
      </div>

      <p className="text-sm text-zinc-400 mt-2">{pick.reason}</p>

      {(pick.thesis || pick.valuation) && (
        <div className="mt-2 space-y-1">
          {pick.thesis && (
            <div className="text-xs">
              <span className="text-cyan-500">テーゼ: </span>
              <span className="text-zinc-300">{pick.thesis}</span>
            </div>
          )}
          {pick.thesisBreaker && (
            <div className="text-xs">
              <span className="text-red-500">撤退条件: </span>
              <span className="text-zinc-400">{pick.thesisBreaker}</span>
            </div>
          )}
          {pick.valuation && (
            <div className="text-xs">
              <span className="text-purple-500">バリュエーション: </span>
              <span className="text-zinc-400">{pick.valuation}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-4 mt-3 text-xs">
        <div>
          <span className="text-zinc-500">エントリー: </span>
          <span className="text-white font-mono font-bold">¥{pick.entryPrice?.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-zinc-500">利確: </span>
          <span className="text-green-400 font-mono font-bold">¥{pick.targetPrice?.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-zinc-500">損切り: </span>
          <span className="text-red-400 font-mono font-bold">¥{pick.stopLoss?.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-zinc-500">RR比: </span>
          <span className="text-cyan-400 font-mono">{pick.riskReward}</span>
        </div>
        <div>
          <span className="text-zinc-500">期間: </span>
          <span className="text-zinc-300">{pick.timeframe}</span>
        </div>
      </div>

      {pick.ifdoco && (
        <div className="mt-3 border border-zinc-700 rounded p-2 bg-zinc-950/50">
          <div className="text-xs font-semibold text-zinc-400 mb-1">IFDOCO注文設定</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-zinc-500">IF注文: </span>
              <span className="text-white font-mono">{pick.ifdoco.entryOrder.type} ¥{pick.ifdoco.entryOrder.price?.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-zinc-500">OCO利確: </span>
              <span className="text-green-400 font-mono">¥{pick.ifdoco.takeProfit.price?.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-zinc-500">OCO損切: </span>
              <span className="text-red-400 font-mono">¥{pick.ifdoco.stopLoss.price?.toLocaleString()}</span>
            </div>
          </div>
          {(pick.holdingPeriod || pick.exitDate) && (
            <div className="flex gap-4 mt-1 text-xs">
              {pick.holdingPeriod && <div><span className="text-zinc-500">保有期間: </span><span className="text-zinc-300">{pick.holdingPeriod}</span></div>}
              {pick.exitDate && <div><span className="text-zinc-500">決済予定: </span><span className="text-yellow-400">{pick.exitDate}</span></div>}
            </div>
          )}
        </div>
      )}

      {(pick.dividend || pick.shareholderBenefits) && (
        <div className="flex gap-4 mt-2 text-xs">
          {pick.dividend && <div><span className="text-zinc-500">配当: </span><span className="text-yellow-400">{pick.dividend}</span></div>}
          {pick.shareholderBenefits && <div><span className="text-zinc-500">優待: </span><span className="text-pink-400">{pick.shareholderBenefits}</span></div>}
        </div>
      )}

      <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={clsx(
            "h-full rounded-full transition-all duration-1000",
            pick.winProbability >= 60 ? "bg-green-500" : pick.winProbability >= 45 ? "bg-yellow-500" : "bg-red-500"
          )}
          style={{ width: `${pick.winProbability}%` }}
        />
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function StrategyPage() {
  const today = toDateStr(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [history, setHistory] = useState<Record<string, SavedEntry>>({});
  const [loading, setLoading] = useState(false);
  const [rawText, setRawText] = useState("");
  const [holdings, setHoldings] = useState<HoldingWithSignal[]>([]);
  const [activeFilter, setActiveFilter] = useState<"all" | "shortTerm" | "midTerm" | "longTerm">("all");

  // Load history & holdings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setHistory(JSON.parse(saved));
    } catch { /* ignore */ }
    try {
      const saved = localStorage.getItem("investment-app-assets");
      if (saved) {
        const parsed = JSON.parse(saved);
        setHoldings(parsed.filter((h: HoldingWithSignal) => h.code));
      }
    } catch { /* ignore */ }
  }, []);

  // Persist history
  useEffect(() => {
    if (Object.keys(history).length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    }
  }, [history]);

  const currentEntry = history[selectedDate] || null;
  const strategy = currentEntry?.strategy || null;
  const savedDates = new Set(Object.keys(history));

  const monthLabel = `${calYear}年${calMonth + 1}月`;
  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  };

  const generateStrategy = async () => {
    setLoading(true);
    setRawText("");

    try {
      const [indicesRes, fredRes, newsRes] = await Promise.all([
        fetch("/api/global-indices").then((r) => r.json()),
        fetch("/api/economic-calendar").then((r) => r.json()),
        fetch("/api/news?category=global").then((r) => r.json()),
      ]);

      const indicesArr = Object.values(indicesRes);

      // Enrich holdings with signals
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
                  return { ...h, currentPrice, marketValue: currentPrice * h.quantity, pnl: (currentPrice - h.avgPrice) * h.quantity, pnlPercent: ((currentPrice - h.avgPrice) / h.avgPrice) * 100, signal, score };
                }
              } catch { /* skip */ }
              return h;
            })
          );
          enrichedHoldings.push(...batchResults);
        }
      }

      // Optional tone data
      let earningsTone = null;
      let fedTone = null;
      let geopoliticalRisk = null;
      try {
        const [etRes, ftRes, geoRes] = await Promise.all([
          fetch("/api/earnings-tone").then((r) => r.json()).catch(() => null),
          fetch("/api/fed-tone").then((r) => r.json()).catch(() => null),
          fetch("/api/geopolitical-risk").then((r) => r.json()).catch(() => null),
        ]);
        earningsTone = etRes;
        fedTone = ftRes;
        geopoliticalRisk = geoRes;
      } catch { /* optional */ }

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
        }),
      });
      const data = await res.json();

      if (data.strategy) {
        const entry: SavedEntry = {
          date: selectedDate,
          strategy: data.strategy,
          generatedAt: new Date().toISOString(),
        };
        setHistory((prev) => ({ ...prev, [selectedDate]: entry }));
      } else if (data.rawText) {
        setRawText(data.rawText);
      } else if (data.error) {
        setRawText(`エラー: ${data.error}`);
      }
    } catch {
      setRawText("戦略生成に失敗しました。");
    }
    setLoading(false);
  };

  const deleteEntry = (date: string) => {
    setHistory((prev) => {
      const next = { ...prev };
      delete next[date];
      if (Object.keys(next).length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      }
      return next;
    });
  };

  const strategyKeys = activeFilter === "all"
    ? (["shortTerm", "midTerm", "longTerm"] as const)
    : [activeFilter] as const;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">日別投資戦略</h1>
      <p className="text-sm text-zinc-500 mb-6">日付を選んで、その日の短期・中期・長期の投資戦略をAIが生成。過去の戦略も振り返れます。</p>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* ── Left: Calendar ── */}
        <div className="space-y-4">
          {/* Month nav */}
          <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/50">
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevMonth} className="px-2 py-1 rounded hover:bg-zinc-800 text-zinc-400">&lt;</button>
              <span className="font-semibold text-sm">{monthLabel}</span>
              <button onClick={nextMonth} className="px-2 py-1 rounded hover:bg-zinc-800 text-zinc-400">&gt;</button>
            </div>
            <MonthCalendar
              year={calYear}
              month={calMonth}
              selectedDate={selectedDate}
              savedDates={savedDates}
              onSelect={setSelectedDate}
            />
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> 戦略保存済み
            </div>
          </div>

          {/* Saved dates list */}
          {savedDates.size > 0 && (
            <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/50">
              <h3 className="text-sm font-semibold text-zinc-400 mb-2">保存済みの戦略</h3>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {Object.entries(history)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([date, entry]) => (
                    <div
                      key={date}
                      className={clsx(
                        "flex items-center justify-between px-3 py-2 rounded text-sm cursor-pointer transition-colors",
                        date === selectedDate ? "bg-purple-600/20 text-purple-300" : "hover:bg-zinc-800 text-zinc-400"
                      )}
                      onClick={() => setSelectedDate(date)}
                    >
                      <div>
                        <span className="font-mono">{date}</span>
                        <span className={clsx(
                          "ml-2 text-xs px-1.5 py-0.5 rounded",
                          RISK_COLORS[entry.strategy.riskLevel]?.split(" ").slice(0, 1).join("") || "text-zinc-500"
                        )}>
                          {RISK_LABELS[entry.strategy.riskLevel] || entry.strategy.riskLevel}
                        </span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteEntry(date); }}
                        className="text-zinc-600 hover:text-red-400 text-xs"
                        title="削除"
                      >
                        ×
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Strategy display ── */}
        <div>
          {/* Header bar */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold">
                {selectedDate === today ? "今日" : selectedDate} の戦略
              </h2>
              {currentEntry && (
                <p className="text-xs text-zinc-500">
                  生成日時: {new Date(currentEntry.generatedAt).toLocaleString("ja-JP")}
                </p>
              )}
            </div>
            <button
              onClick={generateStrategy}
              disabled={loading}
              className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? "分析中..." : currentEntry ? "再生成" : "戦略を生成"}
            </button>
          </div>

          {loading && (
            <div className="text-center text-zinc-500 py-16">
              <div className="animate-pulse text-lg mb-2">市場データを収集し、戦略を生成中...</div>
              <div className="text-xs">30秒ほどかかります</div>
            </div>
          )}

          {/* No strategy yet */}
          {!strategy && !rawText && !loading && (
            <div className="border border-dashed border-zinc-700 rounded-lg p-12 text-center">
              <div className="text-4xl mb-3">📊</div>
              <p className="text-zinc-400 mb-4">
                {selectedDate === today
                  ? "今日の投資戦略をAIが生成します"
                  : `${selectedDate} の戦略はまだ保存されていません`}
              </p>
              <button
                onClick={generateStrategy}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium"
              >
                戦略を生成する
              </button>
            </div>
          )}

          {rawText && !strategy && (
            <div className="border border-zinc-800 rounded-lg p-4">
              <MarkdownRenderer content={rawText} />
            </div>
          )}

          {/* Strategy content */}
          {strategy && (
            <div className="space-y-5">
              {/* Market Overview */}
              <div className="border border-zinc-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-2">市場概況</h3>
                <p className="text-sm text-zinc-300 leading-relaxed">{strategy.marketOverview}</p>
              </div>

              {/* Risk + Macro */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={clsx("border rounded-lg p-4", RISK_COLORS[strategy.riskLevel] || RISK_COLORS.MEDIUM)}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">
                      {strategy.riskLevel === "LOW" ? "🟢" : strategy.riskLevel === "MEDIUM" ? "🟡" : strategy.riskLevel === "HIGH" ? "🟠" : "🔴"}
                    </span>
                    <div>
                      <div className="font-bold">リスクレベル: {RISK_LABELS[strategy.riskLevel] || strategy.riskLevel}</div>
                      <div className="text-sm mt-1 opacity-80">{strategy.riskComment}</div>
                    </div>
                  </div>
                </div>
                {strategy.macroRegime && (
                  <div className="border border-zinc-800 rounded-lg p-4 flex items-center">
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">マクロレジーム</div>
                      <div className="text-sm text-cyan-400 font-medium">{strategy.macroRegime}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Portfolio Health */}
              {strategy.portfolioHealth && (
                <div className="border border-yellow-800/30 bg-yellow-950/10 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-yellow-400 mb-2">ポートフォリオ健全性</h3>
                  <div className="space-y-1 text-sm">
                    <div><span className="text-zinc-500">セクター集中度: </span><span className="text-zinc-300">{strategy.portfolioHealth.sectorConcentration}</span></div>
                    <div><span className="text-zinc-500">最大リスク: </span><span className="text-zinc-300">{strategy.portfolioHealth.topRisk}</span></div>
                    {strategy.portfolioHealth.driftAlert && (
                      <div><span className="text-zinc-500">ドリフト警告: </span><span className="text-orange-400">{strategy.portfolioHealth.driftAlert}</span></div>
                    )}
                    {strategy.portfolioHealth.rebalanceActions?.length > 0 && (
                      <div className="mt-2">
                        <span className="text-zinc-500 text-xs">リバランス提案:</span>
                        {strategy.portfolioHealth.rebalanceActions.map((a, i) => (
                          <div key={i} className="text-zinc-300 ml-2">→ {a}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Holdings Verdict */}
              {strategy.holdingsVerdict && strategy.holdingsVerdict.length > 0 && (
                <div className="border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-400 mb-2">保有銘柄判定</h3>
                  <div className="space-y-1">
                    {strategy.holdingsVerdict.map((hv, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <TickerLink ticker={hv.ticker} />
                        <span className={clsx(
                          "px-1.5 py-0.5 rounded text-xs font-bold",
                          hv.action === "損切り" ? "bg-red-500/20 text-red-400" :
                          hv.action === "全利確" || hv.action === "部分利確" ? "bg-green-500/20 text-green-400" :
                          hv.action === "買い増し" ? "bg-blue-500/20 text-blue-400" :
                          "bg-zinc-700 text-zinc-300"
                        )}>
                          {hv.action}
                        </span>
                        <span className={clsx(
                          "text-xs px-1 rounded",
                          hv.thesisStatus === "有効" ? "text-green-500" :
                          hv.thesisStatus === "崩壊" ? "text-red-500" : "text-yellow-500"
                        )}>
                          [{hv.thesisStatus}]
                        </span>
                        <span className="text-zinc-500 text-xs flex-1">{hv.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Catalysts */}
              {strategy.catalysts && strategy.catalysts.length > 0 && (
                <div className="border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-400 mb-2">今後のカタリスト</h3>
                  {strategy.catalysts.map((c, i) => (
                    <div key={i} className="flex gap-2 text-sm mb-1">
                      <span className="text-zinc-500 font-mono shrink-0">{c.date}</span>
                      <span className="text-zinc-300">{c.event}</span>
                      <span className="text-zinc-500">{c.impact}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Strategy filter tabs */}
              <div className="flex gap-2 border-b border-zinc-800 pb-2">
                {([
                  { key: "all", label: "すべて" },
                  { key: "shortTerm", label: "短期戦略" },
                  { key: "midTerm", label: "中期戦略" },
                  { key: "longTerm", label: "長期戦略" },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveFilter(tab.key)}
                    className={clsx(
                      "px-4 py-1.5 rounded-t text-sm font-medium transition-colors",
                      activeFilter === tab.key
                        ? tab.key === "shortTerm" ? "bg-orange-900/40 text-orange-300 border-b-2 border-orange-500"
                          : tab.key === "midTerm" ? "bg-blue-900/40 text-blue-300 border-b-2 border-blue-500"
                          : tab.key === "longTerm" ? "bg-green-900/40 text-green-300 border-b-2 border-green-500"
                          : "bg-zinc-800 text-white"
                        : "text-zinc-400 hover:bg-zinc-800/50"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Strategy sections */}
              {strategyKeys.map((key) => {
                const section = strategy.strategies[key];
                if (!section) return null;
                const borderColor =
                  key === "shortTerm" ? "border-orange-800/50" :
                  key === "midTerm" ? "border-blue-800/50" : "border-green-800/50";
                const pickBorder =
                  key === "shortTerm" ? "border-zinc-800" :
                  key === "midTerm" ? "border-zinc-800" : "border-zinc-800";

                return (
                  <div key={key} className={clsx("border rounded-lg p-4", borderColor)}>
                    <h3 className="text-lg font-semibold mb-1">{section.title}</h3>
                    <p className="text-sm text-zinc-400 mb-4">{section.description}</p>
                    <div className="space-y-3">
                      {section.picks?.map((pick, i) => (
                        <PickCard key={i} pick={pick} borderColor={pickBorder} />
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Overall advice */}
              <div className="border border-purple-800/50 bg-purple-950/20 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-2">全体アドバイス</h3>
                <p className="text-sm text-zinc-300 leading-relaxed">{strategy.overallAdvice}</p>
              </div>

              {/* Watch list */}
              {strategy.watchList && strategy.watchList.length > 0 && (
                <div className="border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-400 mb-2">注目ポイント</h3>
                  <ul className="space-y-1">
                    {strategy.watchList.map((item, i) => (
                      <li key={i} className="text-sm text-zinc-300 flex gap-2">
                        <span className="text-yellow-500 shrink-0">•</span>
                        <span>{renderWithTickerLinks(item)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tax */}
              {strategy.taxOptimization && (
                <div className="border border-emerald-800/30 bg-emerald-950/10 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-emerald-400 mb-2">税金最適化</h3>
                  <p className="text-sm text-zinc-300 leading-relaxed">{strategy.taxOptimization}</p>
                </div>
              )}

              {/* Disclaimer */}
              <div className="text-xs text-zinc-600 p-3 border border-zinc-800/50 rounded">
                {strategy.disclaimer || "本分析は情報提供を目的としたものであり、投資助言ではありません。投資判断は自己責任でお願いします。"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
