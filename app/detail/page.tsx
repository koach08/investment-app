"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SignalBadge from "@/components/SignalBadge";
import NewsCard from "@/components/NewsCard";
import EngineResultCard from "@/components/EngineResultCard";
import IntegratedSignal from "@/components/IntegratedSignal";
import { generateSignal, rsi, macd, bollingerBands, atr } from "@/lib/indicators";
import type { EngineResult, IntegratedResult, EngineId } from "@/lib/types";
import { ENGINE_CONFIG } from "@/lib/types";

interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function DetailContent() {
  const searchParams = useSearchParams();
  const initialTicker = searchParams.get("ticker") || "";

  const [ticker, setTicker] = useState(initialTicker);
  const [inputTicker, setInputTicker] = useState(initialTicker);
  const [period, setPeriod] = useState("6mo");
  const [strategy, setStrategy] = useState("中期");
  const [data, setData] = useState<{
    name: string;
    prices: PriceData[];
    currency: string;
  } | null>(null);
  const [news, setNews] = useState<
    { title: string; source: string; url: string; publishedAt: string }[]
  >([]);
  const [loading, setLoading] = useState(false);

  // AI analysis state
  const [engineResults, setEngineResults] = useState<EngineResult[]>([]);
  const [integrated, setIntegrated] = useState<IntegratedResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [analysisDuration, setAnalysisDuration] = useState(0);

  const fetchData = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    try {
      const [marketRes, newsRes] = await Promise.all([
        fetch(`/api/market?ticker=${encodeURIComponent(ticker)}&period=${period}`),
        fetch(`/api/news?ticker=${encodeURIComponent(ticker)}`),
      ]);
      const marketData = await marketRes.json();
      const newsData = await newsRes.json();

      if (marketData.prices) {
        setData({
          name: marketData.name,
          prices: marketData.prices,
          currency: marketData.currency,
        });
      }
      setNews(newsData.news || []);
    } catch {
      setData(null);
    }
    setLoading(false);
  }, [ticker, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const closes = data?.prices.map((p) => p.close) || [];
  const highs = data?.prices.map((p) => p.high) || [];
  const lows = data?.prices.map((p) => p.low) || [];

  const techSignal = closes.length >= 30 ? generateSignal(closes, highs, lows) : null;
  const rsiVals = closes.length >= 15 ? rsi(closes) : [];
  const macdResult = closes.length >= 30 ? macd(closes) : null;
  const bbResult = closes.length >= 20 ? bollingerBands(closes) : null;
  const atrVals = closes.length >= 15 ? atr(highs, lows, closes) : [];

  const lastClose = closes[closes.length - 1];
  const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null;
  const changePercent = prevClose ? ((lastClose - prevClose) / prevClose) * 100 : 0;

  const runMultiAnalysis = async () => {
    if (!data || !techSignal) return;
    setAiLoading(true);
    setEngineResults([]);
    setIntegrated(null);

    // Set loading state for all engines
    const loadingResults: EngineResult[] = (
      ["claude", "gpt4o", "gemini", "grok", "perplexity"] as EngineId[]
    ).map((engine) => ({
      engine,
      status: "loading" as const,
    }));
    setEngineResults(loadingResults);

    try {
      const res = await fetch("/api/multi-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          signal: {
            rsi: rsiVals[rsiVals.length - 1],
            macdHistogram: macdResult?.histogram[macdResult.histogram.length - 1],
            bbPosition: techSignal.bbPos,
            atr: atrVals[atrVals.length - 1],
            close: lastClose,
            changePercent,
            signal: techSignal.signal,
            score: techSignal.score,
          },
          strategy,
          news: news.slice(0, 5),
        }),
      });
      const result = await res.json();

      if (result.engines) {
        setEngineResults(result.engines);
        setIntegrated(result.integrated);
        setAnalysisDuration(result.duration);
      }
    } catch {
      setEngineResults(
        loadingResults.map((r) => ({
          ...r,
          status: "error" as const,
          error: "通信エラー",
        }))
      );
    }
    setAiLoading(false);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">銘柄詳細分析</h1>

      {/* Search bar */}
      <div className="flex gap-2 mb-6">
        <input suppressHydrationWarning
          type="text"
          value={inputTicker}
          onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && setTicker(inputTicker)}
          placeholder="ティッカー（例: 7203.T, AAPL）"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
        >
          <option value="1mo">1ヶ月</option>
          <option value="3mo">3ヶ月</option>
          <option value="6mo">6ヶ月</option>
          <option value="1y">1年</option>
          <option value="5y">5年</option>
        </select>
        <button
          onClick={() => setTicker(inputTicker)}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium"
        >
          検索
        </button>
      </div>

      {loading && (
        <div className="text-center text-zinc-500 py-12">データ取得中...</div>
      )}

      {data && !loading && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold">{data.name}</h2>
                <span className="text-zinc-500 font-mono">{ticker}</span>
                {techSignal && <SignalBadge signal={techSignal.signal} />}
              </div>
              <div className="flex items-baseline gap-3 mt-2">
                <span className="text-3xl font-bold">
                  {lastClose?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span className="text-sm text-zinc-500">{data.currency}</span>
                <span
                  className={`text-lg font-semibold ${
                    changePercent >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {changePercent >= 0 ? "+" : ""}
                  {changePercent.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Strategy selector + Analyze button */}
          <div className="flex items-center gap-2 mb-4">
            {["短期", "中期", "長期"].map((s) => (
              <button
                key={s}
                onClick={() => setStrategy(s)}
                className={`px-3 py-1.5 rounded text-sm ${
                  strategy === s
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                {s}
              </button>
            ))}
            <button
              onClick={runMultiAnalysis}
              disabled={aiLoading}
              className="ml-auto px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium"
            >
              {aiLoading ? "分析中..." : "🤖 5エンジン分析実行"}
            </button>
          </div>

          {/* Price chart */}
          <div className="border border-zinc-800 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-zinc-400 mb-3">価格推移</h3>
            <div className="h-40 flex items-end gap-px">
              {closes.slice(-60).map((c, i) => {
                const min = Math.min(...closes.slice(-60));
                const max = Math.max(...closes.slice(-60));
                const range = max - min || 1;
                const height = ((c - min) / range) * 100;
                const prev = i > 0 ? closes.slice(-60)[i - 1] : c;
                return (
                  <div
                    key={i}
                    className={`flex-1 min-w-[2px] rounded-t ${
                      c >= prev ? "bg-green-500/70" : "bg-red-500/70"
                    }`}
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${c.toLocaleString()}`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-zinc-600 mt-1">
              <span>{data.prices[Math.max(0, data.prices.length - 60)]?.date}</span>
              <span>{data.prices[data.prices.length - 1]?.date}</span>
            </div>
          </div>

          {/* Technical indicators */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500">RSI (14)</div>
              <div className="text-xl font-bold mt-1">
                {rsiVals[rsiVals.length - 1]?.toFixed(1) ?? "N/A"}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {rsiVals[rsiVals.length - 1] != null
                  ? rsiVals[rsiVals.length - 1]! < 30
                    ? "売られすぎ"
                    : rsiVals[rsiVals.length - 1]! > 70
                      ? "買われすぎ"
                      : "中立"
                  : ""}
              </div>
            </div>
            <div className="border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500">MACDヒストグラム</div>
              <div className="text-xl font-bold mt-1">
                {macdResult?.histogram[macdResult.histogram.length - 1]?.toFixed(2) ?? "N/A"}
              </div>
            </div>
            <div className="border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500">ボリンジャーバンド</div>
              <div className="text-xl font-bold mt-1">{techSignal?.bbPos ?? "N/A"}</div>
              <div className="text-xs text-zinc-500 mt-1">
                {bbResult
                  ? `U:${bbResult.upper[bbResult.upper.length - 1]?.toFixed(0)} / L:${bbResult.lower[bbResult.lower.length - 1]?.toFixed(0)}`
                  : ""}
              </div>
            </div>
            <div className="border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500">ATR (14)</div>
              <div className="text-xl font-bold mt-1">
                {atrVals[atrVals.length - 1]?.toFixed(2) ?? "N/A"}
              </div>
            </div>
            <div className="border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500">テクニカルスコア</div>
              <div className="text-xl font-bold mt-1">{techSignal?.score ?? "N/A"}</div>
            </div>
          </div>

          {/* 5-Engine AI Analysis */}
          {engineResults.length > 0 && (
            <div className="border border-zinc-800 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-zinc-400 flex items-center gap-2">
                  🤖 AI 5エンジン並列分析
                  {analysisDuration > 0 && (
                    <span className="text-xs text-zinc-600">
                      ({(analysisDuration / 1000).toFixed(1)}秒)
                    </span>
                  )}
                </h3>
              </div>

              {/* Engine result cards */}
              <div className="space-y-2 mb-4">
                {engineResults.map((result) => (
                  <EngineResultCard
                    key={result.engine}
                    result={result}
                    loading={result.status === "loading"}
                  />
                ))}
              </div>

              {/* Integrated signal */}
              {integrated && (
                <IntegratedSignal results={engineResults} integrated={integrated} />
              )}
            </div>
          )}

          {/* Related News */}
          {news.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">
                関連ニュース ({news.length}件)
              </h3>
              <div className="grid gap-2">
                {news.slice(0, 5).map((n, i) => (
                  <NewsCard key={i} {...n} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!ticker && !loading && (
        <div className="text-center text-zinc-500 mt-12">
          <p className="text-lg">ティッカーを入力して分析を開始</p>
          <p className="text-sm mt-2">
            日本株: 7203.T / 米国株: AAPL / 欧州株: VOW3.DE
          </p>
        </div>
      )}
    </div>
  );
}

export default function DetailPage() {
  return (
    <Suspense fallback={<div className="text-center text-zinc-500 py-12">読み込み中...</div>}>
      <DetailContent />
    </Suspense>
  );
}
