"use client";

import { useState } from "react";
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import { clsx } from "clsx";

interface EarningsToneResult {
  ticker: string;
  overall_tone: number;
  confidence_score: number;
  guidance_revision: "up" | "down" | "maintained" | "none";
  bullish_signals: string[];
  bearish_signals: string[];
  uncertainty_words: string[];
  key_topics: string[];
  analyst_qa_tone: "aggressive" | "neutral" | "friendly";
  summary_ja: string;
  error?: string;
}

export default function EarningsToneCard() {
  const [ticker, setTicker] = useState("");
  const [transcriptText, setTranscriptText] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EarningsToneResult | null>(null);
  const [error, setError] = useState("");

  const analyze = async () => {
    if (!ticker) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/earnings-tone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          transcript_text: transcriptText || undefined,
          lang: /\.T$/i.test(ticker) ? "ja" : "en",
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError("分析リクエストに失敗しました");
    }
    setLoading(false);
  };

  // Convert overall_tone (-1 to 1) to 0-100 for the radial chart
  const toneValue = result ? Math.round((result.overall_tone + 1) * 50) : 50;
  const toneColor =
    toneValue >= 65 ? "#22c55e" : toneValue <= 35 ? "#ef4444" : "#a1a1aa";

  const chartData = [
    {
      name: "tone",
      value: toneValue,
      fill: toneColor,
    },
  ];

  const guidanceBadge = (rev: string) => {
    switch (rev) {
      case "up":
        return "bg-green-900/40 text-green-400";
      case "down":
        return "bg-red-900/40 text-red-400";
      case "maintained":
        return "bg-zinc-800 text-zinc-400";
      default:
        return "bg-zinc-800 text-zinc-500";
    }
  };

  const guidanceLabel = (rev: string) => {
    switch (rev) {
      case "up":
        return "ガイダンス上方修正";
      case "down":
        return "ガイダンス下方修正";
      case "maintained":
        return "ガイダンス維持";
      default:
        return "ガイダンスなし";
    }
  };

  const qaToneLabel = (tone: string) => {
    switch (tone) {
      case "aggressive":
        return "厳しい";
      case "friendly":
        return "友好的";
      default:
        return "中立";
    }
  };

  return (
    <div className="border border-zinc-800 rounded-lg p-4">
      <h3 className="text-lg font-bold mb-3">決算トーン分析</h3>

      {/* Input */}
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && analyze()}
          placeholder="銘柄コード（例: AAPL, 7203.T）"
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={analyze}
          disabled={loading || !ticker}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium whitespace-nowrap"
        >
          {loading ? "分析中..." : "分析"}
        </button>
      </div>

      <button
        onClick={() => setShowTextInput(!showTextInput)}
        className="text-xs text-zinc-500 hover:text-zinc-300 mb-2"
      >
        {showTextInput ? "テキスト入力を閉じる" : "決算テキストを直接入力"}
      </button>

      {showTextInput && (
        <textarea
          value={transcriptText}
          onChange={(e) => setTranscriptText(e.target.value)}
          placeholder="決算説明会のテキストをここにペースト..."
          rows={4}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-blue-500 resize-y"
        />
      )}

      {/* Error */}
      {error && (
        <div className="text-red-400 text-sm bg-red-950/20 border border-red-900/30 rounded-lg p-3 mt-2">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-4 space-y-4">
          {/* Top row: Gauge + Summary */}
          <div className="flex gap-4 items-start">
            {/* Radial gauge */}
            <div className="flex-shrink-0 flex flex-col items-center">
              <RadialBarChart
                width={120}
                height={120}
                cx={60}
                cy={60}
                innerRadius={35}
                outerRadius={55}
                startAngle={180}
                endAngle={0}
                barSize={10}
                data={chartData}
              >
                <PolarAngleAxis
                  type="number"
                  domain={[0, 100]}
                  angleAxisId={0}
                  tick={false}
                />
                <RadialBar
                  background={{ fill: "#27272a" }}
                  dataKey="value"
                  angleAxisId={0}
                  cornerRadius={5}
                />
              </RadialBarChart>
              <div className="text-center -mt-8">
                <div
                  className="text-lg font-bold"
                  style={{ color: toneColor }}
                >
                  {result.overall_tone > 0 ? "+" : ""}
                  {result.overall_tone.toFixed(2)}
                </div>
                <div className="text-xs text-zinc-500">
                  トーンスコア
                </div>
              </div>
            </div>

            {/* Summary + badges */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-2 mb-2">
                <span
                  className={clsx(
                    "text-xs px-2 py-0.5 rounded font-medium",
                    guidanceBadge(result.guidance_revision)
                  )}
                >
                  {guidanceLabel(result.guidance_revision)}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  Q&A: {qaToneLabel(result.analyst_qa_tone)}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  確信度: {Math.round(result.confidence_score * 100)}%
                </span>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">
                {result.summary_ja}
              </p>
              {result.key_topics.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {result.key_topics.map((t, i) => (
                    <span
                      key={i}
                      className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bullish / Bearish signals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result.bullish_signals.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-green-400 mb-1">
                  強気シグナル
                </h4>
                <ul className="space-y-1">
                  {result.bullish_signals.map((s, i) => (
                    <li
                      key={i}
                      className="text-xs text-zinc-300 bg-green-950/20 border border-green-900/20 rounded px-2 py-1"
                    >
                      &ldquo;{s}&rdquo;
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.bearish_signals.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-red-400 mb-1">
                  弱気シグナル
                </h4>
                <ul className="space-y-1">
                  {result.bearish_signals.map((s, i) => (
                    <li
                      key={i}
                      className="text-xs text-zinc-300 bg-red-950/20 border border-red-900/20 rounded px-2 py-1"
                    >
                      &ldquo;{s}&rdquo;
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Uncertainty words */}
          {result.uncertainty_words.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-amber-400 mb-1">
                不確実性ワード
              </h4>
              <div className="flex flex-wrap gap-1">
                {result.uncertainty_words.map((w, i) => (
                  <span
                    key={i}
                    className="text-xs px-1.5 py-0.5 rounded bg-amber-950/20 border border-amber-900/20 text-amber-400"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
