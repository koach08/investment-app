"use client";

import { useState } from "react";
import SignalBadge from "@/components/SignalBadge";
import TickerLink from "@/components/TickerLink";
import { generateSignal, type ScanSignal } from "@/lib/indicators";

const DEFAULT_TICKERS = [
  { ticker: "7203.T", name: "トヨタ自動車" },
  { ticker: "6758.T", name: "ソニーG" },
  { ticker: "9984.T", name: "ソフトバンクG" },
  { ticker: "6861.T", name: "キーエンス" },
  { ticker: "8306.T", name: "三菱UFJ" },
  { ticker: "6902.T", name: "デンソー" },
  { ticker: "9432.T", name: "NTT" },
  { ticker: "6501.T", name: "日立製作所" },
  { ticker: "AAPL", name: "Apple" },
  { ticker: "MSFT", name: "Microsoft" },
  { ticker: "GOOGL", name: "Alphabet" },
  { ticker: "AMZN", name: "Amazon" },
  { ticker: "NVDA", name: "NVIDIA" },
  { ticker: "TSLA", name: "Tesla" },
  { ticker: "META", name: "Meta" },
  { ticker: "TSM", name: "TSMC" },
];

interface ScanResult extends ScanSignal {
  newsCount: number;
  latestNews?: string;
}

export default function ScannerPage() {
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [customTicker, setCustomTicker] = useState("");
  const [tickers, setTickers] = useState(DEFAULT_TICKERS);
  const [holdingTickers, setHoldingTickers] = useState<Set<string>>(new Set());

  const addHoldingsToScan = () => {
    try {
      const saved = localStorage.getItem("investment-app-assets");
      if (!saved) return;
      const holdings = JSON.parse(saved) as { code?: string; name?: string }[];
      const validHoldings = holdings.filter((h) => h.code && h.code.trim());
      const existingSet = new Set(tickers.map((t) => t.ticker));
      const newTickers = validHoldings
        .filter((h) => !existingSet.has(h.code!))
        .map((h) => ({ ticker: h.code!, name: h.name || h.code! }));
      if (newTickers.length > 0) {
        setTickers((prev) => [...prev, ...newTickers]);
        setHoldingTickers(new Set(newTickers.map((t) => t.ticker)));
      }
    } catch {
      // ignore parse errors
    }
  };

  const addTicker = () => {
    if (!customTicker.trim()) return;
    const parts = customTicker.trim().split(/[,\s]+/);
    const newOnes = parts
      .filter((t) => !tickers.some((x) => x.ticker === t.toUpperCase()))
      .map((t) => ({ ticker: t.toUpperCase(), name: t.toUpperCase() }));
    setTickers([...tickers, ...newOnes]);
    setCustomTicker("");
  };

  const runScan = async () => {
    setLoading(true);
    setResults([]);

    const scanResults: ScanResult[] = [];

    // Process in batches of 4
    for (let i = 0; i < tickers.length; i += 4) {
      const batch = tickers.slice(i, i + 4);
      const promises = batch.map(async ({ ticker, name }) => {
        try {
          const [marketRes, newsRes] = await Promise.all([
            fetch(`/api/market?ticker=${encodeURIComponent(ticker)}&period=6mo`),
            fetch(`/api/news?ticker=${encodeURIComponent(ticker)}`),
          ]);

          const marketData = await marketRes.json();
          const newsData = await newsRes.json();

          if (!marketData.prices || marketData.prices.length < 30) {
            return null;
          }

          const closes = marketData.prices.map((p: { close: number }) => p.close);
          const highs = marketData.prices.map((p: { high: number }) => p.high);
          const lows = marketData.prices.map((p: { low: number }) => p.low);

          const { signal, score, rsiVal, macdHist, bbPos } = generateSignal(closes, highs, lows);

          return {
            ticker,
            name: marketData.name || name,
            close: closes[closes.length - 1],
            rsi: rsiVal,
            macdHistogram: macdHist,
            bbPosition: bbPos,
            signal,
            score,
            newsCount: newsData.news?.length || 0,
            latestNews: newsData.news?.[0]?.title,
          } as ScanResult;
        } catch {
          return null;
        }
      });

      const batchResults = await Promise.all(promises);
      for (const r of batchResults) {
        if (r) scanResults.push(r);
      }
      setResults([...scanResults]);
    }

    // Sort by score descending
    scanResults.sort((a, b) => b.score - a.score);
    setResults(scanResults);
    setLoading(false);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">銘柄スキャナー</h1>

      {/* Custom ticker input */}
      <div className="flex gap-2 mb-4">
        <input
          suppressHydrationWarning
          type="text"
          value={customTicker}
          onChange={(e) => setCustomTicker(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTicker()}
          placeholder="ティッカー追加（例: 7201.T, AAPL）"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={addTicker}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm"
        >
          追加
        </button>
        <button
          onClick={addHoldingsToScan}
          className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 rounded-lg text-sm font-medium"
        >
          保有銘柄を追加
        </button>
        <button
          onClick={runScan}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium"
        >
          {loading ? "スキャン中..." : "スキャン実行"}
        </button>
      </div>

      {/* Ticker chips */}
      <div className="flex flex-wrap gap-1 mb-6">
        {tickers.map(({ ticker }) => (
          <span
            key={ticker}
            className={`px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-400 cursor-pointer hover:bg-zinc-700 border ${holdingTickers.has(ticker) ? "border-yellow-600" : "border-transparent"}`}
            onClick={() => setTickers(tickers.filter((t) => t.ticker !== ticker))}
            title="クリックで削除"
          >
            {ticker} ×
          </span>
        ))}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <>
          {/* Strong signal cards */}
          {results.filter((r) => r.signal === "STRONG_BUY" || r.signal === "STRONG_SELL").length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">強シグナル銘柄</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {results
                  .filter((r) => r.signal === "STRONG_BUY" || r.signal === "STRONG_SELL")
                  .map((r) => (
                    <div
                      key={r.ticker}
                      className={`border rounded-lg p-4 ${
                        r.signal === "STRONG_BUY"
                          ? "border-green-700 bg-green-950/30"
                          : "border-red-700 bg-red-950/30"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-bold text-lg">{r.ticker}</span>
                          <span className="ml-2 text-sm text-zinc-400">{r.name}</span>
                        </div>
                        <SignalBadge signal={r.signal} />
                      </div>
                      <div className="mt-2 text-2xl font-bold">
                        ¥{r.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-zinc-400">
                        <div>RSI: {r.rsi?.toFixed(1) ?? "N/A"}</div>
                        <div>MACD: {r.macdHistogram?.toFixed(2) ?? "N/A"}</div>
                        <div>BB: {r.bbPosition ?? "N/A"}</div>
                      </div>
                      {r.latestNews && (
                        <div className="mt-2 text-xs text-zinc-500 line-clamp-1">
                          📰 {r.latestNews}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Results table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="text-left py-2 px-2">ティッカー</th>
                  <th className="text-left py-2 px-2">銘柄名</th>
                  <th className="text-right py-2 px-2">終値</th>
                  <th className="text-right py-2 px-2">RSI</th>
                  <th className="text-right py-2 px-2">MACD</th>
                  <th className="text-center py-2 px-2">BB</th>
                  <th className="text-center py-2 px-2">ニュース</th>
                  <th className="text-center py-2 px-2">シグナル</th>
                  <th className="text-right py-2 px-2">スコア</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.ticker}
                    className="border-b border-zinc-800/50 hover:bg-zinc-900"
                  >
                    <td className="py-2 px-2">
                      <TickerLink ticker={r.ticker} />
                    </td>
                    <td className="py-2 px-2">{r.name}</td>
                    <td className="py-2 px-2 text-right font-mono">
                      {r.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      {r.rsi?.toFixed(1) ?? "-"}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      {r.macdHistogram?.toFixed(2) ?? "-"}
                    </td>
                    <td className="py-2 px-2 text-center text-xs">
                      {r.bbPosition ?? "-"}
                    </td>
                    <td className="py-2 px-2 text-center text-xs">
                      {r.newsCount > 0 ? `${r.newsCount}件` : "-"}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <SignalBadge signal={r.signal} />
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-bold">
                      {r.score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && results.length === 0 && (
        <div className="text-center text-zinc-500 mt-12">
          <p className="text-lg">「スキャン実行」ボタンでテクニカル分析を開始</p>
          <p className="text-sm mt-2">
            RSI・MACD・ボリンジャーバンドを使った総合スコアで銘柄を評価します
          </p>
        </div>
      )}
    </div>
  );
}
