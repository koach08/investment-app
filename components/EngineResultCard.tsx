"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { ENGINE_CONFIG, type EngineResult } from "@/lib/types";
import SignalBadge from "./SignalBadge";

interface Props {
  result: EngineResult;
  loading?: boolean;
}

export default function EngineResultCard({ result, loading }: Props) {
  const [expanded, setExpanded] = useState(false);
  const config = ENGINE_CONFIG[result.engine];

  if (loading) {
    return (
      <div className="border border-zinc-800 rounded-lg p-3 animate-pulse">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <span className="text-sm font-medium text-zinc-400">{config.name}</span>
          <span className="ml-auto text-xs text-zinc-600">分析中...</span>
        </div>
        <div className="mt-2 h-3 bg-zinc-800 rounded-full" />
      </div>
    );
  }

  if (result.status === "error") {
    return (
      <div className="border border-zinc-800 rounded-lg p-3 opacity-50">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <span className="text-sm font-medium text-zinc-400">{config.name}</span>
          <span className="ml-auto text-xs text-red-400">{result.error || "エラー"}</span>
        </div>
      </div>
    );
  }

  const score = result.score ?? 50;
  const confidence = result.confidence ?? 0;

  return (
    <div className="border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition-colors">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <span className="text-lg">{config.icon}</span>
        <span className="text-sm font-medium text-white">{config.name}</span>
        {result.engine === "perplexity" && (
          <span className="text-[10px] bg-cyan-900/50 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-800/50">
            🔍 Web検索済み
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <SignalBadge signal={result.signal || "NEUTRAL"} />
          <span className="text-sm font-bold font-mono" style={{ color: config.color }}>
            {score}点
          </span>
          <span className="text-xs text-zinc-500">確信{confidence}%</span>
        </div>
      </div>

      {/* Score bar */}
      <div className="mt-2 h-2.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${score}%`,
            backgroundColor: config.color,
          }}
        />
      </div>

      {/* Expand button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {expanded ? "▲ 閉じる" : "▼ 詳細を表示"}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-zinc-800 text-sm space-y-2">
          {result.summary && (
            <p className="text-zinc-300 leading-relaxed">{result.summary}</p>
          )}

          {result.points && result.points.length > 0 && (
            <div>
              <div className="text-xs text-zinc-500 mb-1">注目ポイント</div>
              <ul className="space-y-0.5">
                {result.points.map((p, i) => (
                  <li key={i} className="text-xs text-zinc-400 flex gap-1">
                    <span className="text-green-500">•</span> {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.risks && result.risks.length > 0 && (
            <div>
              <div className="text-xs text-zinc-500 mb-1">リスク</div>
              <ul className="space-y-0.5">
                {result.risks.map((r, i) => (
                  <li key={i} className="text-xs text-zinc-400 flex gap-1">
                    <span className="text-red-500">•</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.priceRange && (
            <div className="flex gap-4 text-xs">
              <span className="text-zinc-500">
                入: <span className="text-white font-mono">{result.priceRange.entry?.toLocaleString()}</span>
              </span>
              <span className="text-zinc-500">
                利: <span className="text-green-400 font-mono">{result.priceRange.target?.toLocaleString()}</span>
              </span>
              <span className="text-zinc-500">
                損: <span className="text-red-400 font-mono">{result.priceRange.stop?.toLocaleString()}</span>
              </span>
            </div>
          )}

          {result.duration && (
            <div className="text-[10px] text-zinc-600">
              応答時間: {(result.duration / 1000).toFixed(1)}秒
            </div>
          )}
        </div>
      )}
    </div>
  );
}
