"use client";

import { useState, useEffect } from "react";
import IndexCard from "@/components/IndexCard";
import MarkdownRenderer from "@/components/MarkdownRenderer";

interface IndexData {
  label: string;
  symbol: string;
  close: number;
  prevClose: number;
  chgPct: number;
  region: string;
}

const REGIONS = ["アジア", "欧州", "米国", "ボラ・金利", "商品", "FX", "仮想通貨"];

export default function GlobalPage() {
  const [indices, setIndices] = useState<Record<string, IndexData>>({});
  const [loading, setLoading] = useState(true);
  const [activeRegion, setActiveRegion] = useState("all");
  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    fetchIndices();
  }, []);

  const fetchIndices = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/global-indices");
      const data = await res.json();
      setIndices(data);
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const filtered = Object.values(indices).filter(
    (d) => activeRegion === "all" || d.region === activeRegion
  );

  const generateSummary = async () => {
    setAiLoading(true);
    setAiSummary("");
    try {
      const res = await fetch("/api/market-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          indices: Object.values(indices).map((d) => ({
            label: d.label,
            close: d.close,
            chgPct: d.chgPct,
            region: d.region,
          })),
        }),
      });
      const data = await res.json();
      setAiSummary(data.summary || data.error || "生成失敗");
    } catch {
      setAiSummary("サマリー生成に失敗しました。");
    }
    setAiLoading(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">世界市場</h1>
        <button
          onClick={generateSummary}
          disabled={aiLoading || Object.keys(indices).length === 0}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium"
        >
          {aiLoading ? "生成中..." : "🔵 Gemini市場サマリー"}
        </button>
      </div>

      {aiSummary && (
        <div className="border border-blue-800/50 bg-blue-950/20 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-blue-400 mb-2">
            🔵 Gemini 市場サマリー
          </h3>
          <MarkdownRenderer content={aiSummary} />
        </div>
      )}

      <div className="flex gap-1 mb-6 overflow-x-auto">
        <button
          onClick={() => setActiveRegion("all")}
          className={`px-3 py-1.5 rounded text-sm whitespace-nowrap ${
            activeRegion === "all"
              ? "bg-zinc-700 text-white"
              : "text-zinc-400 hover:bg-zinc-800"
          }`}
        >
          すべて
        </button>
        {REGIONS.map((r) => (
          <button
            key={r}
            onClick={() => setActiveRegion(r)}
            className={`px-3 py-1.5 rounded text-sm whitespace-nowrap ${
              activeRegion === r
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-zinc-500 py-12">市場データ取得中...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {filtered.map((d) => (
              <IndexCard key={d.symbol} label={d.label} value={d.close} chgPct={d.chgPct} />
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center text-zinc-500 py-12">データがありません</div>
          )}

          {Object.keys(indices).length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">ヒートマップ（前日比）</h3>
              <div className="flex flex-wrap gap-1">
                {Object.values(indices)
                  .sort((a, b) => b.chgPct - a.chgPct)
                  .map((d) => {
                    const intensity = Math.min(Math.abs(d.chgPct) / 3, 1);
                    const bg =
                      d.chgPct >= 0
                        ? `rgba(34, 197, 94, ${0.1 + intensity * 0.7})`
                        : `rgba(239, 68, 68, ${0.1 + intensity * 0.7})`;
                    return (
                      <div
                        key={d.symbol}
                        className="px-2 py-1 rounded text-xs font-mono"
                        style={{ backgroundColor: bg }}
                        title={`${d.label}: ${d.chgPct >= 0 ? "+" : ""}${d.chgPct.toFixed(2)}%`}
                      >
                        {d.label.replace(/^[^\s]+\s/, "").slice(0, 8)}{" "}
                        {d.chgPct >= 0 ? "+" : ""}
                        {d.chgPct.toFixed(1)}%
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
