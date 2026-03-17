"use client";

import { useState, useEffect } from "react";
import { clsx } from "clsx";
import MarkdownRenderer from "@/components/MarkdownRenderer";

interface IndexData {
  label: string;
  close: number;
  chgPct: number;
  region: string;
}

interface FredItem {
  name: string;
  latestValue: string;
  previousValue: string;
  change: number;
}

export default function MacroPage() {
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [fredData, setFredData] = useState<FredItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [indicesRes, fredRes] = await Promise.all([
        fetch("/api/global-indices"),
        fetch("/api/economic-calendar"),
      ]);
      const indicesData = await indicesRes.json();
      const fredResult = await fredRes.json();

      setIndices(Object.values(indicesData));
      setFredData(fredResult.data || []);
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const runMacroAnalysis = async () => {
    setAiLoading(true);
    setAiAnalysis("");
    try {
      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "macro",
          indices: indices.map((d) => ({
            label: d.label,
            close: d.close,
            chgPct: d.chgPct,
            region: d.region,
          })),
          fredData: fredData,
        }),
      });
      const data = await res.json();
      setAiAnalysis(data.summary || data.error || "分析失敗");
    } catch {
      setAiAnalysis("マクロ分析の取得に失敗しました。");
    }
    setAiLoading(false);
  };

  // Quick dashboard metrics
  const vix = indices.find((d) => d.label.includes("VIX"));
  const usdJpy = indices.find((d) => d.label.includes("USD/JPY"));
  const sp500 = indices.find((d) => d.label.includes("S&P500"));
  const nikkei = indices.find((d) => d.label.includes("日経225"));
  const gold = indices.find((d) => d.label.includes("金"));
  const btc = indices.find((d) => d.label.includes("BTC"));
  const yieldSpread = fredData.find((d) => d.name.includes("長短金利差"));

  const dashboardItems = [
    { label: "VIX（恐怖指数）", data: vix, warn: vix && vix.close > 25 },
    { label: "S&P 500", data: sp500 },
    { label: "日経225", data: nikkei },
    { label: "USD/JPY", data: usdJpy },
    { label: "Gold", data: gold },
    { label: "BTC", data: btc },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">マクロ環境分析</h1>
        <button
          onClick={runMacroAnalysis}
          disabled={aiLoading || loading}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium"
        >
          {aiLoading ? "分析中..." : "AIマクロ分析"}
        </button>
      </div>

      {loading ? (
        <div className="text-center text-zinc-500 py-12">データ取得中...</div>
      ) : (
        <>
          {/* Quick dashboard */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {dashboardItems.map(({ label, data, warn }) => (
              <div
                key={label}
                className={clsx(
                  "border rounded-lg p-3",
                  warn
                    ? "border-red-700 bg-red-950/20"
                    : "border-zinc-800"
                )}
              >
                <div className="text-xs text-zinc-500 truncate">{label}</div>
                {data ? (
                  <>
                    <div className="text-lg font-bold mt-1">
                      {data.close.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div
                      className={clsx(
                        "text-xs font-semibold mt-1",
                        data.chgPct >= 0 ? "text-green-400" : "text-red-400"
                      )}
                    >
                      {data.chgPct >= 0 ? "+" : ""}
                      {data.chgPct.toFixed(2)}%
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-zinc-600 mt-1">N/A</div>
                )}
              </div>
            ))}
          </div>

          {/* Yield curve status */}
          {yieldSpread && (
            <div
              className={clsx(
                "border rounded-lg p-4 mb-6",
                parseFloat(yieldSpread.latestValue) < 0
                  ? "border-red-700 bg-red-950/20"
                  : "border-green-800 bg-green-950/20"
              )}
            >
              <h3 className="text-sm font-semibold mb-1">長短金利差（10Y-2Y）</h3>
              <div className="text-2xl font-bold">
                {yieldSpread.latestValue}
              </div>
              <div className="text-sm mt-1">
                {parseFloat(yieldSpread.latestValue) < 0 ? (
                  <span className="text-red-400">
                    ⚠️ 逆イールド — 景気後退リスクのシグナル
                  </span>
                ) : (
                  <span className="text-green-400">
                    ✅ 正常なイールドカーブ
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Market sentiment gauge */}
          <div className="border border-zinc-800 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-zinc-400 mb-3">
              マーケットセンチメント
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-zinc-500">リスクオン指標</div>
                <div className="mt-2 space-y-1">
                  {indices
                    .filter(
                      (d) =>
                        d.region === "米国" ||
                        d.label.includes("日経") ||
                        d.label.includes("仮想通貨") ||
                        d.label.includes("BTC")
                    )
                    .slice(0, 5)
                    .map((d) => (
                      <div
                        key={d.label}
                        className="flex justify-between text-xs"
                      >
                        <span className="text-zinc-400 truncate mr-2">
                          {d.label}
                        </span>
                        <span
                          className={
                            d.chgPct >= 0 ? "text-green-400" : "text-red-400"
                          }
                        >
                          {d.chgPct >= 0 ? "+" : ""}
                          {d.chgPct.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">安全資産</div>
                <div className="mt-2 space-y-1">
                  {indices
                    .filter(
                      (d) =>
                        d.label.includes("金") ||
                        d.label.includes("銀") ||
                        d.label.includes("金利") ||
                        d.label.includes("CHF")
                    )
                    .slice(0, 5)
                    .map((d) => (
                      <div
                        key={d.label}
                        className="flex justify-between text-xs"
                      >
                        <span className="text-zinc-400 truncate mr-2">
                          {d.label}
                        </span>
                        <span
                          className={
                            d.chgPct >= 0 ? "text-green-400" : "text-red-400"
                          }
                        >
                          {d.chgPct >= 0 ? "+" : ""}
                          {d.chgPct.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">コモディティ</div>
                <div className="mt-2 space-y-1">
                  {indices
                    .filter((d) => d.region === "商品")
                    .slice(0, 5)
                    .map((d) => (
                      <div
                        key={d.label}
                        className="flex justify-between text-xs"
                      >
                        <span className="text-zinc-400 truncate mr-2">
                          {d.label}
                        </span>
                        <span
                          className={
                            d.chgPct >= 0 ? "text-green-400" : "text-red-400"
                          }
                        >
                          {d.chgPct >= 0 ? "+" : ""}
                          {d.chgPct.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>

          {/* FRED data table */}
          <div className="border border-zinc-800 rounded-lg overflow-hidden mb-6">
            <h3 className="text-sm font-semibold text-zinc-400 p-4 border-b border-zinc-800">
              主要経済指標
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="text-left py-2 px-4">指標</th>
                  <th className="text-right py-2 px-4">最新値</th>
                  <th className="text-right py-2 px-4">前回値</th>
                  <th className="text-right py-2 px-4">変化</th>
                </tr>
              </thead>
              <tbody>
                {fredData.map((item) => (
                  <tr
                    key={item.name}
                    className="border-b border-zinc-800/50 hover:bg-zinc-900"
                  >
                    <td className="py-2 px-4">{item.name}</td>
                    <td className="py-2 px-4 text-right font-mono font-bold">
                      {item.latestValue}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-zinc-500">
                      {item.previousValue}
                    </td>
                    <td
                      className={clsx(
                        "py-2 px-4 text-right font-mono",
                        item.change > 0
                          ? "text-green-400"
                          : item.change < 0
                            ? "text-red-400"
                            : "text-zinc-500"
                      )}
                    >
                      {item.change > 0 ? "+" : ""}
                      {item.change.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* AI Analysis */}
          {aiAnalysis && (
            <div className="border border-purple-800/50 bg-purple-950/20 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-purple-400 mb-2">
                AIマクロ分析
              </h3>
              <MarkdownRenderer content={aiAnalysis} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
