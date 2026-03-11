import { clsx } from "clsx";
import type { IntegratedResult, EngineResult } from "@/lib/types";
import SignalBadge from "./SignalBadge";

interface Props {
  results: EngineResult[];
  integrated: IntegratedResult;
}

export default function IntegratedSignal({ results, integrated }: Props) {
  const stars = Math.round(integrated.consensus * 5);
  const successCount = results.filter((r) => r.status === "success").length;

  // Count matching signals
  const signalCounts: Record<string, number> = {};
  results.forEach((r) => {
    if (r.status === "success" && r.signal) {
      signalCounts[r.signal] = (signalCounts[r.signal] || 0) + 1;
    }
  });
  const maxSignal = Object.entries(signalCounts).sort((a, b) => b[1] - a[1])[0];
  const matchCount = maxSignal ? maxSignal[1] : 0;

  return (
    <div
      className={clsx(
        "border rounded-lg p-4",
        integrated.score >= 60
          ? "border-green-700 bg-green-950/20"
          : integrated.score <= 40
            ? "border-red-700 bg-red-950/20"
            : "border-zinc-700 bg-zinc-900/50"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">📊</span>
          <span className="text-sm font-semibold text-zinc-400">統合シグナル</span>
          <div className="scale-125 origin-left">
            <SignalBadge signal={integrated.signal} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-6">
        {/* Score */}
        <div>
          <div className="text-xs text-zinc-500">加重平均スコア</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-bold font-mono">{integrated.score}</span>
            <span className="text-sm text-zinc-500">/ 100</span>
          </div>
          <div className="w-32 h-2 bg-zinc-800 rounded-full mt-1 overflow-hidden">
            <div
              className={clsx(
                "h-full rounded-full transition-all duration-1000",
                integrated.score >= 60
                  ? "bg-green-500"
                  : integrated.score <= 40
                    ? "bg-red-500"
                    : "bg-yellow-500"
              )}
              style={{ width: `${integrated.score}%` }}
            />
          </div>
        </div>

        {/* Consensus */}
        <div>
          <div className="text-xs text-zinc-500">一致度</div>
          <div className="flex items-center gap-1 mt-1">
            {[...Array(5)].map((_, i) => (
              <span
                key={i}
                className={clsx(
                  "text-lg",
                  i < stars ? "text-yellow-400" : "text-zinc-700"
                )}
              >
                ★
              </span>
            ))}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {matchCount}/{successCount} エンジンが一致
          </div>
        </div>

        {/* Engine count */}
        <div>
          <div className="text-xs text-zinc-500">分析エンジン</div>
          <div className="text-lg font-bold mt-1">
            {successCount}
            <span className="text-sm text-zinc-500">/5 成功</span>
          </div>
        </div>
      </div>
    </div>
  );
}
