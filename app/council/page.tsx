"use client";

import { useEffect, useState } from "react";
import {
  loadPositions,
  openPositions,
  addPosition,
  closePosition,
  positionsBriefing,
  type Position,
  type PositionDirection,
} from "@/lib/positions";
import {
  loadDecisions,
  addDecision,
  recordDecisionOutcome,
  getPerformanceSummary,
  lessonsBriefing,
  type DecisionRecord,
} from "@/lib/decision-log";
import type { CouncilResult, CouncilStance, CouncilVerdict } from "@/lib/council";

interface Holding {
  code?: string;
  ticker?: string;
  name?: string;
  quantity?: number;
  shares?: number;
  avgPrice?: number;
  currentPrice?: number;
  pnlPercent?: number;
}

const SUGGESTIONS = [
  "今のポートフォリオで、明日取るべき最適な戦略は？",
  "保有中のオープン建玉は今このまま継続すべきか、手仕舞いか？",
  "今の地合いで新規にエントリーするなら、ロング/ショートどちらが期待値が高い？",
];

export default function CouncilPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [question, setQuestion] = useState("");
  const [marketNote, setMarketNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CouncilResult | null>(null);
  const [lastDecisionId, setLastDecisionId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const a = localStorage.getItem("investment-app-assets");
      if (a) setHoldings((JSON.parse(a) as Holding[]).filter((h) => h.code || h.ticker));
    } catch {
      /* ignore */
    }
    setPositions(loadPositions());
    setDecisions(loadDecisions());
  }, []);

  const perf = getPerformanceSummary(decisions);
  const open = positions.filter((p) => p.status === "open");

  async function convene() {
    if (!question.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setLastDecisionId(null);
    try {
      const res = await fetch("/api/council", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          holdings,
          positionsBriefing: positionsBriefing(positions),
          lessonsBriefing: lessonsBriefing(decisions),
          marketNote: marketNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `委員会の招集に失敗 (${res.status})`);
      const r = data as CouncilResult;
      setResult(r);
      // 決定を自動でログ（自己改善ループの記録）
      const v = r.verdict;
      const rec = addDecision({
        question: question.trim(),
        ticker: v.ticker,
        name: v.name,
        direction: v.direction,
        decisionLabel: v.decisionLabel,
        entry: v.entry ?? undefined,
        stop: v.stop ?? undefined,
        target: v.target ?? undefined,
        confidence: v.confidence,
        thesis: v.thesis,
        dissent: v.dissent,
      });
      setLastDecisionId(rec.id);
      setDecisions(loadDecisions());
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }

  function recordAsPosition(v: CouncilVerdict) {
    const dirMap: Record<string, PositionDirection> = {
      "現物買い": "現物",
      "信用買い": "信用買い",
      "積み増し": "現物",
      "信用売り(空売り)": "信用売り",
    };
    const direction: PositionDirection =
      v.direction === "short" ? "信用売り" : dirMap[v.decisionLabel] || "現物";
    const sizeNum = (() => {
      const m = (v.size || "").match(/(\d+)\s*株/);
      return m ? Number(m[1]) : 100;
    })();
    addPosition({
      ticker: v.ticker || question.slice(0, 12),
      name: v.name,
      direction,
      openedAt: new Date().toISOString(),
      entryPrice: v.entry ?? 0,
      size: sizeNum,
      thesis: v.thesis || v.rationale || question,
      thesisBreaker: v.thesisBreaker,
      stop: v.stop ?? undefined,
      target: v.target ?? undefined,
      source: "ai",
      decisionId: lastDecisionId ?? undefined,
    });
    setPositions(loadPositions());
  }

  function handleClose(p: Position) {
    const ex = prompt(`${p.ticker} を手仕舞い。決済価格を入力:`, String(p.target ?? p.entryPrice));
    if (!ex) return;
    const exit = Number(ex);
    if (!Number.isFinite(exit)) return;
    const closed = closePosition(p.id, exit);
    setPositions(loadPositions());
    // 紐づく決定があれば結果も記録（ループ）
    if (closed?.decisionId && closed.pnlPercent != null) {
      const result: "win" | "loss" | "flat" =
        closed.pnlPercent > 0.5 ? "win" : closed.pnlPercent < -0.5 ? "loss" : "flat";
      recordDecisionOutcome(closed.decisionId, result, closed.pnlPercent);
      setDecisions(loadDecisions());
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">🏛️ 投資委員会</h1>
          <p className="text-sm text-zinc-400">
            5つのAI人格が強気・弱気・リスク・数値・事実をぶつけ合い、議長が1つの結論に統合する
          </p>
        </div>
        {perf.evaluated > 0 && (
          <div className="text-right text-xs text-zinc-400">
            <div>
              勝率{" "}
              <span className="text-zinc-100 font-semibold">
                {Math.round(perf.winRate * 100)}%
              </span>{" "}
              ({perf.wins}/{perf.evaluated})
            </div>
            <div>
              平均損益{" "}
              <span className={perf.avgPnlPercent >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {perf.avgPnlPercent.toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </header>

      {/* 招集フォーム */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="委員会にかける議題を入力（例: ANAの信用売りは継続すべきか、損切りすべきか？）"
          rows={3}
          className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm resize-y focus:outline-none focus:border-zinc-600"
        />
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setQuestion(s)}
              className="text-xs px-2 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500"
            >
              {s}
            </button>
          ))}
        </div>
        <input
          value={marketNote}
          onChange={(e) => setMarketNote(e.target.value)}
          placeholder="(任意) 今の市況メモ・気になっている材料"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={convene}
            disabled={loading || !question.trim()}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold"
          >
            {loading ? "委員会を招集中… (15-40秒)" : "🏛️ 委員会を招集"}
          </button>
          <span className="text-xs text-zinc-500">
            保有 {holdings.length}件 / オープン建玉 {open.length}件 を共有
          </span>
        </div>
        {error && <p className="text-sm text-rose-400">⚠️ {error}</p>}
      </section>

      {/* 最終判定 */}
      {result && (
        <section className="rounded-xl border border-indigo-700/60 bg-indigo-950/20 p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-bold text-indigo-300">⚖️ 議長の最終判定</h2>
            <DirectionBadge verdict={result.verdict} />
          </div>
          <VerdictBody verdict={result.verdict} />
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => recordAsPosition(result.verdict)}
              className="text-xs px-3 py-1.5 rounded-md bg-zinc-100 text-zinc-900 font-semibold hover:bg-white"
            >
              ＋ この決定を建玉として台帳に記録
            </button>
            <span className="text-xs text-zinc-500 self-center">
              記録済の決定: 結果が出たら下の建玉を手仕舞いすると勝率に反映されます
            </span>
          </div>
        </section>
      )}

      {/* 各委員の意見 */}
      {result && (
        <section className="space-y-3">
          <h2 className="font-bold text-sm text-zinc-300">🗣️ 各委員の意見</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {result.stances.map((s, i) => (
              <StanceCard key={i} stance={s} />
            ))}
          </div>
        </section>
      )}

      {/* オープン建玉 */}
      <section className="space-y-2">
        <h2 className="font-bold text-sm text-zinc-300">
          📒 オープン建玉（方向と建玉理由をAIが常に参照します）
        </h2>
        {open.length === 0 ? (
          <p className="text-sm text-zinc-500">オープン中の建玉はありません。</p>
        ) : (
          <div className="space-y-2">
            {open.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm flex items-start justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="font-semibold">
                    {p.ticker} {p.name}{" "}
                    <span
                      className={`ml-1 text-xs px-1.5 py-0.5 rounded ${
                        p.direction === "信用売り"
                          ? "bg-rose-900/50 text-rose-300"
                          : "bg-emerald-900/50 text-emerald-300"
                      }`}
                    >
                      {p.direction}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    {p.size}株 建値{p.entryPrice}
                    {p.stop ? ` / 損切り${p.stop}` : ""}
                    {p.target ? ` / 利確${p.target}` : ""}
                  </div>
                  <div className="text-xs text-zinc-500">理由: {p.thesis}</div>
                </div>
                <button
                  onClick={() => handleClose(p)}
                  className="text-xs px-2 py-1 rounded-md border border-zinc-700 hover:border-zinc-500 whitespace-nowrap"
                >
                  手仕舞い
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DirectionBadge({ verdict }: { verdict: CouncilVerdict }) {
  const color =
    verdict.direction === "long"
      ? "bg-emerald-600"
      : verdict.direction === "short"
      ? "bg-rose-600"
      : "bg-zinc-600";
  return (
    <span className={`text-xs px-2 py-1 rounded-md font-semibold text-white ${color}`}>
      {verdict.decisionLabel}
      {verdict.confidence != null ? ` ・確信度${verdict.confidence}%` : ""}
    </span>
  );
}

function VerdictBody({ verdict: v }: { verdict: CouncilVerdict }) {
  return (
    <div className="space-y-2 text-sm">
      {v.rationale && <p className="text-zinc-200">{v.rationale}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {v.entry != null && <Field label="エントリー" value={String(v.entry)} />}
        {v.stop != null && <Field label="損切り" value={String(v.stop)} />}
        {v.target != null && <Field label="利確" value={String(v.target)} />}
        {v.riskReward && <Field label="R/R" value={v.riskReward} />}
        {v.size && <Field label="サイズ" value={v.size} />}
        {v.timeframe && <Field label="期間" value={v.timeframe} />}
        {v.exitDate && <Field label="決済予定" value={v.exitDate} />}
      </div>
      {v.thesis && (
        <p className="text-xs text-zinc-400">
          <span className="text-zinc-500">テーゼ:</span> {v.thesis}
        </p>
      )}
      {v.thesisBreaker && (
        <p className="text-xs text-zinc-400">
          <span className="text-zinc-500">撤退条件:</span> {v.thesisBreaker}
        </p>
      )}
      {v.consistencyNote && (
        <p className="text-xs text-amber-300/80">
          <span className="text-zinc-500">整合性:</span> {v.consistencyNote}
        </p>
      )}
      {v.dissent && v.dissent.length > 0 && (
        <div className="text-xs text-zinc-400 border-l-2 border-zinc-700 pl-2">
          <span className="text-zinc-500">反対意見:</span>
          <ul className="list-disc ml-4">
            {v.dissent.map((d, i) => (
              <li key={i}>
                <span className="text-zinc-300">{d.engine}</span>: {d.point}
              </li>
            ))}
          </ul>
        </div>
      )}
      {v.disclaimer && <p className="text-[11px] text-zinc-600">{v.disclaimer}</p>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-zinc-900/70 border border-zinc-800 px-2 py-1">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="text-zinc-100">{value}</div>
    </div>
  );
}

function StanceCard({ stance: s }: { stance: CouncilStance }) {
  const stanceColor =
    s.stance === "強気"
      ? "text-emerald-400"
      : s.stance === "弱気"
      ? "text-rose-400"
      : "text-zinc-400";
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">{s.persona}</span>
        {s.status === "success" ? (
          <span className={`text-xs ${stanceColor}`}>
            {s.stance ?? "—"}
            {s.confidence != null ? ` ${s.confidence}%` : ""}
          </span>
        ) : (
          <span className="text-xs text-zinc-600">不参加</span>
        )}
      </div>
      {s.status === "error" ? (
        <p className="text-xs text-zinc-600">{s.error}</p>
      ) : (
        <>
          {s.keyArgument && <p className="text-xs text-zinc-300">{s.keyArgument}</p>}
          {s.suggestedAction && (
            <p className="text-xs text-zinc-400">
              <span className="text-zinc-500">提案:</span> {s.suggestedAction}
            </p>
          )}
          {s.risks && s.risks.length > 0 && (
            <p className="text-xs text-zinc-500">⚠ {s.risks.join(" / ")}</p>
          )}
        </>
      )}
    </div>
  );
}
