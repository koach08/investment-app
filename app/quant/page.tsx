"use client";

import { useState, useEffect, useCallback } from "react";
import { clsx } from "clsx";
import TickerLink from "@/components/TickerLink";
import type { QuantAnalysis, RegimeAnalysis, StrategyProposal, PortfolioSummary } from "@/lib/quant/types";
import type { ScoringResult } from "@/lib/quant/scoring-engine";
import type { PortfolioRow } from "@/app/api/quant/portfolio/route";

interface AnalyzeResponse {
  ticker: string;
  name: string;
  currency: string;
  analysis: QuantAnalysis;
  tickerRegime: RegimeAnalysis;
  marketRegime: RegimeAnalysis;
  decision: ScoringResult;
  strategies: StrategyProposal[];
  auditId?: string;
}

interface RegimeResponse {
  ticker: string;
  name: string;
  lastClose: number;
  regime: RegimeAnalysis;
}

const REC_COLORS: Record<string, string> = {
  STRONG_BUY: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  BUY: "bg-green-500/15 text-green-300 border-green-500/30",
  HOLD: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  SELL: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  STRONG_SELL: "bg-red-500/15 text-red-300 border-red-500/30",
};

const REGIME_COLORS: Record<string, string> = {
  TRENDING_UP: "bg-green-500/15 text-green-300 border-green-500/30",
  TRENDING_DOWN: "bg-red-500/15 text-red-300 border-red-500/30",
  RANGING: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  VOLATILE: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
};

const REGIME_LABEL: Record<string, string> = {
  TRENDING_UP: "上昇トレンド",
  TRENDING_DOWN: "下降トレンド",
  RANGING: "レンジ",
  VOLATILE: "高ボラ",
};

const ACTION_LABEL: Record<string, string> = {
  BUY: "買い",
  SELL: "売り",
  HOLD: "様子見",
  MARGIN_LONG: "信用買い",
  MARGIN_SHORT: "信用売り",
  DCA: "積立",
  TRIM: "一部利確/損切",
  EXIT: "撤退",
};

const ACTION_COLORS: Record<string, string> = {
  BUY: "bg-green-500/15 text-green-300 border-green-500/30",
  SELL: "bg-red-500/15 text-red-300 border-red-500/30",
  HOLD: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  MARGIN_LONG: "bg-emerald-600/20 text-emerald-300 border-emerald-500/40",
  MARGIN_SHORT: "bg-rose-600/20 text-rose-300 border-rose-500/40",
  DCA: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  TRIM: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  EXIT: "bg-red-600/20 text-red-300 border-red-500/40",
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, (score + 100) / 2));
  return (
    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden relative">
      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-zinc-600" />
      <div
        className={clsx(
          "h-full transition-all",
          score >= 0 ? "bg-green-500" : "bg-red-500"
        )}
        style={{
          width: `${Math.abs(score) / 2}%`,
          marginLeft: score >= 0 ? "50%" : `${50 - Math.abs(score) / 2}%`,
        }}
      />
    </div>
  );
}

function RegimeBadge({ regime }: { regime: RegimeAnalysis }) {
  return (
    <div className={clsx("border rounded-xl p-4", REGIME_COLORS[regime.regime])}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold opacity-70">レジーム</span>
        <span className="text-xs opacity-70">信頼度 {regime.confidence}%</span>
      </div>
      <div className="text-lg font-bold mb-1">{REGIME_LABEL[regime.regime]}</div>
      <p className="text-xs opacity-90 leading-relaxed">{regime.reason}</p>
      <div className="grid grid-cols-3 gap-2 mt-3 text-[10px] opacity-70">
        <div>SMA20: {regime.factors.sma20.toLocaleString()}</div>
        <div>SMA50: {regime.factors.sma50.toLocaleString()}</div>
        <div>SMA200: {regime.factors.sma200.toLocaleString()}</div>
        <div>傾き: {regime.factors.slopePercent20}%</div>
        <div>ATR: {regime.factors.atrPercent}%</div>
        <div>30日値幅: {regime.factors.rangeWidthPercent}%</div>
      </div>
    </div>
  );
}

function StrategyCard({ s }: { s: StrategyProposal }) {
  const horizonColor =
    s.horizon === "SHORT"
      ? "border-orange-800/40 bg-orange-950/10"
      : s.horizon === "MID"
      ? "border-blue-800/40 bg-blue-950/10"
      : "border-green-800/40 bg-green-950/10";

  return (
    <div className={clsx("border rounded-xl p-4", horizonColor)}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-bold text-zinc-100">{s.label}</span>
        <span className={clsx("px-2 py-0.5 rounded-md text-xs font-bold border", ACTION_COLORS[s.action])}>
          {ACTION_LABEL[s.action] ?? s.action}
        </span>
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed mb-3">{s.rationale}</p>
      {(s.entryHint || s.exitHint) && (
        <div className="grid grid-cols-3 gap-2 text-xs mb-2">
          {s.entryHint && (
            <div className="bg-zinc-900/60 rounded p-2 text-center">
              <div className="text-zinc-500 text-[10px]">Entry</div>
              <div className="font-mono text-white">
                {s.entryHint.price ? s.entryHint.price.toLocaleString() : s.entryHint.type}
              </div>
            </div>
          )}
          {s.exitHint?.takeProfit !== undefined && (
            <div className="bg-zinc-900/60 rounded p-2 text-center">
              <div className="text-zinc-500 text-[10px]">利確</div>
              <div className="font-mono text-green-400">{s.exitHint.takeProfit.toLocaleString()}</div>
            </div>
          )}
          {s.exitHint?.stopLoss !== undefined && (
            <div className="bg-zinc-900/60 rounded p-2 text-center">
              <div className="text-zinc-500 text-[10px]">損切</div>
              <div className="font-mono text-red-400">{s.exitHint.stopLoss.toLocaleString()}</div>
            </div>
          )}
        </div>
      )}
      {s.sizing && (
        <div className="text-xs text-zinc-400">
          <span className="text-zinc-500">サイズ: </span>
          {s.sizing}
        </div>
      )}
      {s.notes && s.notes.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {s.notes.map((n, i) => (
            <li key={i} className="text-[11px] text-zinc-500 flex gap-1">
              <span>·</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
      {s.costEstimate && (s.action === "MARGIN_LONG" || s.action === "MARGIN_SHORT" || s.action === "BUY" || s.action === "TRIM" || s.action === "EXIT") && (
        <div className="mt-2 pt-2 border-t border-zinc-800/50 text-[10px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-600">想定コスト</span>
            <span className="text-zinc-400 font-mono">{s.costEstimate.roundtripCostPercent.toFixed(2)}%</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-600">グロス期待</span>
            <span className={clsx(
              "font-mono",
              s.costEstimate.grossReturnPercent > 0 ? "text-green-400/80" :
              s.costEstimate.grossReturnPercent < 0 ? "text-red-400/80" : "text-zinc-400"
            )}>
              {s.costEstimate.grossReturnPercent > 0 ? "+" : ""}{s.costEstimate.grossReturnPercent.toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-500">ネット期待</span>
            <span className={clsx(
              "font-mono font-semibold",
              s.costEstimate.netReturnPercent > 0 ? "text-green-400" :
              s.costEstimate.netReturnPercent < 0 ? "text-red-400" : "text-zinc-400"
            )}>
              {s.costEstimate.netReturnPercent > 0 ? "+" : ""}{s.costEstimate.netReturnPercent.toFixed(2)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function PortfolioOverview({ rows, summary }: { rows: PortfolioRow[]; summary: PortfolioSummary | null }) {
  if (!summary || summary.analyzed === 0) return null;

  const REGIME_LABEL: Record<string, string> = {
    TRENDING_UP: "上昇",
    TRENDING_DOWN: "下降",
    RANGING: "レンジ",
    VOLATILE: "高ボラ",
  };
  const REGIME_BG: Record<string, string> = {
    TRENDING_UP: "bg-green-500/60",
    TRENDING_DOWN: "bg-red-500/60",
    RANGING: "bg-zinc-500/60",
    VOLATILE: "bg-yellow-500/60",
  };
  const ACTION_BG: Record<string, string> = {
    BUY: "bg-green-500",
    HOLD: "bg-zinc-500",
    SELL: "bg-red-500",
  };

  // composite score 分布（-100〜+100を10バケット）
  const buckets = [
    { label: "強売 (≤-50)", min: -100, max: -50, count: 0, color: "bg-red-600" },
    { label: "売 (-50〜-20)", min: -50, max: -20, count: 0, color: "bg-red-400" },
    { label: "中立 (-20〜+20)", min: -20, max: 20, count: 0, color: "bg-zinc-500" },
    { label: "買 (+20〜+50)", min: 20, max: 50, count: 0, color: "bg-green-400" },
    { label: "強買 (≥+50)", min: 50, max: 100, count: 0, color: "bg-green-600" },
  ];
  for (const r of rows) {
    const score = r.analysis?.compositeScore;
    if (score === undefined) continue;
    for (const b of buckets) {
      if (score >= b.min && score < b.max) { b.count++; break; }
      if (score === b.max && b === buckets[buckets.length - 1]) { b.count++; break; }
    }
  }
  const maxBucket = Math.max(...buckets.map(b => b.count), 1);

  return (
    <div className="space-y-4">
      {/* Stat boxes */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-3">
          <div className="text-[10px] text-zinc-500 uppercase">分析済み</div>
          <div className="text-xl font-bold font-mono">{summary.analyzed}</div>
        </div>
        {(["TRENDING_UP", "TRENDING_DOWN", "RANGING", "VOLATILE"] as const).map((reg) => (
          <div key={reg} className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-3">
            <div className="text-[10px] text-zinc-500 uppercase">{REGIME_LABEL[reg]}</div>
            <div className="text-xl font-bold font-mono">
              {summary.byRegime[reg] ?? 0}
              <span className="text-xs text-zinc-500 ml-1 font-sans">件</span>
            </div>
          </div>
        ))}
      </div>

      {/* Score distribution */}
      <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4">
        <div className="text-sm font-semibold text-zinc-300 mb-3">クオンツスコア分布</div>
        <div className="space-y-1.5">
          {buckets.map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <div className="w-24 text-[11px] text-zinc-400 shrink-0">{b.label}</div>
              <div className="flex-1 bg-zinc-800/50 rounded-full h-3 overflow-hidden">
                <div
                  className={clsx("h-full rounded-full transition-all", b.color)}
                  style={{ width: `${(b.count / maxBucket) * 100}%` }}
                />
              </div>
              <div className="w-10 text-right text-[11px] font-mono text-zinc-300">{b.count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Action distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4">
          <div className="text-sm font-semibold text-zinc-300 mb-3">アクション内訳</div>
          <div className="flex h-3 rounded-full overflow-hidden bg-zinc-800/50">
            {(["BUY", "HOLD", "SELL"] as const).map((a) => {
              const c = summary.byAction[a] ?? 0;
              const pct = (c / summary.analyzed) * 100;
              if (pct === 0) return null;
              return <div key={a} className={ACTION_BG[a]} style={{ width: `${pct}%` }} title={`${a}: ${c}`} />;
            })}
          </div>
          <div className="flex gap-3 mt-2 text-[11px]">
            {(["BUY", "HOLD", "SELL"] as const).map((a) => (
              <div key={a} className="flex items-center gap-1">
                <span className={clsx("w-2 h-2 rounded-full", ACTION_BG[a])} />
                <span className="text-zinc-500">{a}</span>
                <span className="text-zinc-300 font-mono">{summary.byAction[a] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4">
          <div className="text-sm font-semibold text-zinc-300 mb-3">レジーム内訳</div>
          <div className="flex h-3 rounded-full overflow-hidden bg-zinc-800/50">
            {(["TRENDING_UP", "TRENDING_DOWN", "RANGING", "VOLATILE"] as const).map((r) => {
              const c = summary.byRegime[r] ?? 0;
              const pct = (c / summary.analyzed) * 100;
              if (pct === 0) return null;
              return <div key={r} className={REGIME_BG[r]} style={{ width: `${pct}%` }} title={`${REGIME_LABEL[r]}: ${c}`} />;
            })}
          </div>
          <div className="flex gap-3 mt-2 text-[11px] flex-wrap">
            {(["TRENDING_UP", "TRENDING_DOWN", "RANGING", "VOLATILE"] as const).map((r) => (
              <div key={r} className="flex items-center gap-1">
                <span className={clsx("w-2 h-2 rounded-full", REGIME_BG[r])} />
                <span className="text-zinc-500">{REGIME_LABEL[r]}</span>
                <span className="text-zinc-300 font-mono">{summary.byRegime[r] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Warnings */}
      {summary.warnings.length > 0 && (
        <div className="border border-yellow-800/40 bg-yellow-950/10 rounded-xl p-4">
          <div className="text-sm font-semibold text-yellow-400 mb-2">注意</div>
          <ul className="space-y-1">
            {summary.warnings.map((w, i) => (
              <li key={i} className="text-xs text-yellow-200/80 flex gap-2">
                <span className="text-yellow-500 shrink-0">!</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 短中長期アグリゲート */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border border-orange-800/40 bg-orange-950/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-orange-400" />
            <h3 className="text-sm font-bold text-orange-300">短期方針 (1〜10営業日)</h3>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed mb-3">{summary.shortTermSummary}</p>
          {summary.shortTermPicks.length > 0 && (
            <div className="space-y-1">
              {summary.shortTermPicks.slice(0, 5).map((p, i) => (
                <div key={i} className="text-[11px] flex items-start gap-2">
                  <span className="font-mono text-orange-400 shrink-0">{p.code}</span>
                  <span className="text-zinc-400 truncate">{p.action} - {p.rationale.slice(0, 60)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-blue-800/40 bg-blue-950/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <h3 className="text-sm font-bold text-blue-300">中期方針 (2週〜2ヶ月)</h3>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed mb-3">{summary.midTermSummary}</p>
          {summary.midTermPicks.length > 0 && (
            <div className="space-y-1">
              {summary.midTermPicks.slice(0, 5).map((p, i) => (
                <div key={i} className="text-[11px] flex items-start gap-2">
                  <span className="font-mono text-blue-400 shrink-0">{p.code}</span>
                  <span className="text-zinc-400 truncate">{p.action} - {p.rationale.slice(0, 60)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-green-800/40 bg-green-950/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <h3 className="text-sm font-bold text-green-300">長期方針 (6ヶ月以上)</h3>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed mb-3">{summary.longTermSummary}</p>
          {summary.longTermPicks.length > 0 && (
            <div className="space-y-1">
              {summary.longTermPicks.slice(0, 5).map((p, i) => (
                <div key={i} className="text-[11px] flex items-start gap-2">
                  <span className="font-mono text-green-400 shrink-0">{p.code}</span>
                  <span className="text-zinc-400 truncate">{p.action} - {p.rationale.slice(0, 60)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignalRow({ sig }: { sig: QuantAnalysis["signals"][number] }) {
  return (
    <div className="border border-zinc-800/50 rounded-lg p-3 bg-zinc-900/30">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-zinc-200">{sig.name}</span>
        <span
          className={clsx(
            "text-sm font-mono font-bold",
            sig.score > 20 ? "text-green-400" : sig.score < -20 ? "text-red-400" : "text-zinc-400"
          )}
        >
          {sig.score > 0 ? "+" : ""}
          {sig.score}
        </span>
      </div>
      <div className="mb-2">
        <ScoreBar score={sig.score} />
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">{sig.reason}</p>
      <div className="text-[10px] text-zinc-600 mt-1">信頼度 {sig.confidence}%</div>
    </div>
  );
}

export default function QuantPage() {
  const [tab, setTab] = useState<"single" | "portfolio" | "market">("single");
  const [ticker, setTicker] = useState("7011.T");
  const [tickerInput, setTickerInput] = useState("7011.T");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stabilityNote, setStabilityNote] = useState<{ stability: number; count24h: number; warning?: string; lastRec?: string } | null>(null);

  // market regime
  const [marketRegimes, setMarketRegimes] = useState<Record<string, RegimeResponse | null>>({});
  const [marketLoading, setMarketLoading] = useState(false);

  // portfolio
  const [portfolioRows, setPortfolioRows] = useState<PortfolioRow[] | null>(null);
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  const runAnalyze = useCallback(async (t: string) => {
    setAnalyzing(true);
    setError(null);
    setStabilityNote(null);
    try {
      const res = await fetch("/api/quant/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: t }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "失敗");
        setResult(null);
      } else {
        setResult(data);
        // 判断安定性 + 過剰分析チェック (localStorage)
        try {
          const HISTORY_KEY = "quant-analysis-history";
          const raw = localStorage.getItem(HISTORY_KEY);
          const history: Array<{ ticker: string; rec: string; ts: number }> =
            raw ? JSON.parse(raw) : [];
          const now = Date.now();
          const oneDay = 24 * 60 * 60 * 1000;
          const sameTicker = history.filter((h) => h.ticker === t && now - h.ts < oneDay);
          const newRec = data.analysis?.recommendation as string;
          const last = sameTicker[sameTicker.length - 1];
          let stability = 100;
          let warning: string | undefined;
          if (sameTicker.length >= 1 && last) {
            const consistent = sameTicker.filter((h) => h.rec === newRec).length;
            stability = Math.round((consistent / (sameTicker.length + 1)) * 100);
            if (last.rec !== newRec) {
              warning = `前回 (${Math.round((now - last.ts) / 60000)}分前): ${last.rec} → 今回: ${newRec}。短時間で判断が変わるのは不安定シグナル。`;
            }
          }
          if (sameTicker.length >= 3) {
            warning = (warning ? warning + " " : "") + `24時間で${sameTicker.length + 1}回目の分析。Alpha Arena研究の最大損失要因は過剰取引。本当に取引する必要があるか再考を。`;
          }
          history.push({ ticker: t, rec: newRec, ts: now });
          localStorage.setItem(
            HISTORY_KEY,
            JSON.stringify(history.filter((h) => now - h.ts < oneDay * 7).slice(-200))
          );
          setStabilityNote({
            stability,
            count24h: sameTicker.length + 1,
            warning,
            lastRec: last?.rec,
          });
        } catch { /* localStorage may be unavailable */ }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信エラー");
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const loadMarketRegimes = useCallback(async () => {
    setMarketLoading(true);
    const targets = [
      { key: "nikkei", label: "日経225" },
      { key: "topix", label: "TOPIX" },
      { key: "sp500", label: "S&P 500" },
      { key: "nasdaq", label: "NASDAQ" },
    ];
    const results = await Promise.all(
      targets.map(async (t) => {
        try {
          const res = await fetch(`/api/quant/regime?ticker=${t.key}`);
          if (!res.ok) return [t.key, null] as const;
          return [t.key, (await res.json()) as RegimeResponse] as const;
        } catch {
          return [t.key, null] as const;
        }
      })
    );
    setMarketRegimes(Object.fromEntries(results));
    setMarketLoading(false);
  }, []);

  const loadPortfolio = useCallback(async () => {
    setPortfolioLoading(true);
    try {
      // Try localStorage holdings first
      let body: Record<string, unknown> | undefined;
      try {
        const raw = localStorage.getItem("investment-app-assets");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) body = { holdings: parsed };
        }
      } catch {
        /* ignore */
      }
      const res = await fetch("/api/quant/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      setPortfolioRows(data.rows ?? []);
      setPortfolioSummary(data.summary ?? null);
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "market" && Object.keys(marketRegimes).length === 0) {
      loadMarketRegimes();
    }
  }, [tab, marketRegimes, loadMarketRegimes]);

  return (
    <div className="pb-20">
      <h1 className="text-2xl font-bold mb-1">クオンツ分析</h1>
      <p className="text-sm text-zinc-500 mb-6">
        統計的シグナル（RSI / BB / モメンタム / 出来高 / ボラ）+ レジーム検出 +
        短期・中期・長期の戦略提案。判断支援ツール、自動売買はしない。
      </p>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-800 mb-6">
        {[
          { key: "single", label: "個別銘柄" },
          { key: "portfolio", label: "保有銘柄" },
          { key: "market", label: "市場レジーム" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={clsx(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === t.key
                ? "border-purple-500 text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Single ticker ─── */}
      {tab === "single" && (
        <div className="space-y-6">
          <div className="flex gap-2 items-center">
            <input
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.trim())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setTicker(tickerInput);
                  runAnalyze(tickerInput);
                }
              }}
              placeholder="例: 7011.T, AAPL, ^N225"
              className="flex-1 max-w-sm px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm font-mono"
            />
            <button
              onClick={() => {
                setTicker(tickerInput);
                runAnalyze(tickerInput);
              }}
              disabled={analyzing || !tickerInput}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium"
            >
              {analyzing ? "分析中..." : "分析"}
            </button>
            <div className="flex gap-1 ml-2">
              {["7011.T", "8058.T", "7974.T", "9432.T", "TSM"].map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTickerInput(t);
                    setTicker(t);
                    runAnalyze(t);
                  }}
                  className="px-2 py-1 text-xs bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded font-mono"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="border border-red-800/40 bg-red-950/20 rounded-lg p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {!result && !analyzing && !error && (
            <div className="border border-dashed border-zinc-700 rounded-xl p-12 text-center">
              <div className="text-4xl mb-3">🧮</div>
              <p className="text-zinc-400">ティッカーを入力して分析を開始</p>
              <p className="text-xs text-zinc-600 mt-2">日本株は「.T」付き、米国株はそのまま</p>
            </div>
          )}

          {analyzing && (
            <div className="flex flex-col items-center py-16">
              <div className="w-10 h-10 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-3" />
              <div className="text-sm text-zinc-400">{ticker} を分析中...</div>
            </div>
          )}

          {result && (
            <div className="space-y-5">
              {/* Header */}
              <div className="border border-zinc-800/60 rounded-xl p-5 bg-zinc-900/40">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <TickerLink
                        ticker={result.ticker}
                        className="text-lg font-mono font-bold text-blue-400 hover:underline"
                      />
                      <span className="text-zinc-300">{result.name}</span>
                    </div>
                    <div className="text-2xl font-bold font-mono">
                      {result.currency === "JPY" ? "¥" : result.currency === "USD" ? "$" : ""}
                      {result.analysis.price.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div
                      className={clsx(
                        "px-4 py-2 border rounded-xl text-sm font-bold",
                        REC_COLORS[result.analysis.recommendation]
                      )}
                    >
                      {result.analysis.recommendation}
                    </div>
                    <div className="text-xs text-zinc-500">
                      合成スコア{" "}
                      <span
                        className={clsx(
                          "font-mono font-bold",
                          result.analysis.compositeScore > 0
                            ? "text-green-400"
                            : result.analysis.compositeScore < 0
                            ? "text-red-400"
                            : "text-zinc-400"
                        )}
                      >
                        {result.analysis.compositeScore > 0 ? "+" : ""}
                        {result.analysis.compositeScore}
                      </span>
                      ・信頼度 {result.analysis.compositeConfidence}%
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <ScoreBar score={result.analysis.compositeScore} />
                </div>
              </div>

              {/* Decision */}
              <div className="border border-purple-800/40 bg-purple-950/10 rounded-xl p-5">
                <h3 className="text-sm font-bold text-purple-300 mb-2">合議制最終判断</h3>
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={clsx(
                      "px-3 py-1 border rounded-md text-sm font-bold",
                      ACTION_COLORS[result.decision.action]
                    )}
                  >
                    {ACTION_LABEL[result.decision.action]}
                  </span>
                  <span className="text-xs text-zinc-500">信頼度 {result.decision.confidence}%</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                  {result.decision.reason}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {result.decision.votes.map((v) => (
                    <div key={v.source} className="bg-zinc-900/60 border border-zinc-800/40 rounded p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-zinc-300">{v.source}</span>
                        <span
                          className={clsx(
                            "text-xs font-mono font-bold",
                            v.score > 20 ? "text-green-400" : v.score < -20 ? "text-red-400" : "text-zinc-400"
                          )}
                        >
                          {v.score > 0 ? "+" : ""}
                          {v.score.toFixed(0)}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        重み {(v.weight * 100).toFixed(0)}% / 信頼度 {v.confidence.toFixed(0)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Regimes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RegimeBadge regime={result.tickerRegime} />
                <div>
                  <div className="text-xs text-zinc-500 mb-1">市場全体（日経225）</div>
                  <RegimeBadge regime={result.marketRegime} />
                </div>
              </div>

              {/* Strategies */}
              <div>
                <h2 className="text-base font-bold text-zinc-100 mb-3">戦略提案</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {result.strategies.map((s) => (
                    <StrategyCard key={s.horizon} s={s} />
                  ))}
                </div>
              </div>

              {/* Signal breakdown */}
              <div>
                <h2 className="text-base font-bold text-zinc-100 mb-3">シグナル内訳</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {result.analysis.signals.map((s) => (
                    <SignalRow key={s.name} sig={s} />
                  ))}
                </div>
              </div>

              {stabilityNote && (
                <div className={clsx(
                  "border rounded-xl p-4",
                  stabilityNote.warning
                    ? "border-yellow-800/40 bg-yellow-950/15"
                    : "border-zinc-800/40 bg-zinc-900/30"
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-zinc-400">判断の安定性</span>
                    <span className={clsx(
                      "text-xs font-mono font-bold",
                      stabilityNote.stability >= 80 ? "text-green-400" :
                      stabilityNote.stability >= 50 ? "text-yellow-400" : "text-red-400"
                    )}>
                      {stabilityNote.stability}% (24h内 {stabilityNote.count24h}回分析)
                    </span>
                  </div>
                  {stabilityNote.warning ? (
                    <p className="text-xs text-yellow-200/80 leading-relaxed">{stabilityNote.warning}</p>
                  ) : (
                    <p className="text-[11px] text-zinc-500">同銘柄を直近で複数回分析しても判断は一貫している。</p>
                  )}
                </div>
              )}

              <div className="text-xs text-zinc-600 p-3 border border-zinc-800/40 rounded-lg bg-zinc-950/40">
                クオンツシグナルは統計的傾向であり、将来を保証するものではありません。
                実取引は自己責任で。{result.auditId && (
                  <span className="ml-2 font-mono text-zinc-700">audit: {result.auditId}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Portfolio ─── */}
      {tab === "portfolio" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">
              保有銘柄を一括クオンツ分析（localStorage の資産データを使用、なければ data/holdings.json）
            </p>
            <button
              onClick={loadPortfolio}
              disabled={portfolioLoading}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium"
            >
              {portfolioLoading ? "分析中..." : portfolioRows ? "再分析" : "分析開始"}
            </button>
          </div>

          {portfolioLoading && (
            <div className="flex flex-col items-center py-16">
              <div className="w-10 h-10 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-3" />
              <div className="text-sm text-zinc-400">保有銘柄を順次分析中... (3〜30秒)</div>
            </div>
          )}

          {portfolioRows && portfolioRows.length === 0 && (
            <div className="text-center text-zinc-500 py-12">分析対象の保有銘柄がありません</div>
          )}

          {portfolioRows && portfolioRows.length > 0 && (
            <div className="space-y-5">
              <PortfolioOverview rows={portfolioRows} summary={portfolioSummary} />

              <div>
                <h2 className="text-sm font-semibold text-zinc-400 mb-2">銘柄別詳細（スコア絶対値順）</h2>
                <div className="space-y-3">
                  {portfolioRows.map((r, idx) => (
                <div key={`${r.code}-${r.category}-${idx}`} className="border border-zinc-800/60 rounded-xl p-4 bg-zinc-900/30">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <div className="flex items-center gap-3">
                      <TickerLink
                        ticker={r.code}
                        className="font-mono font-bold text-blue-400 hover:underline"
                      />
                      <span className="text-sm text-zinc-300">{r.name}</span>
                      <span className="text-[10px] text-zinc-600 px-1.5 py-0.5 bg-zinc-800/50 rounded">
                        {r.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={clsx(
                          "text-sm font-mono",
                          r.pnlPercent > 0 ? "text-green-400" : r.pnlPercent < 0 ? "text-red-400" : ""
                        )}
                      >
                        {r.pnlPercent > 0 ? "+" : ""}
                        {r.pnlPercent.toFixed(1)}%
                      </span>
                      {r.decision && (
                        <span
                          className={clsx(
                            "px-2.5 py-1 border rounded-md text-xs font-bold",
                            ACTION_COLORS[r.decision.action]
                          )}
                        >
                          {ACTION_LABEL[r.decision.action]}
                        </span>
                      )}
                      {r.regime && (
                        <span
                          className={clsx(
                            "px-2 py-0.5 border rounded text-[10px]",
                            REGIME_COLORS[r.regime.regime]
                          )}
                        >
                          {REGIME_LABEL[r.regime.regime]}
                        </span>
                      )}
                    </div>
                  </div>

                  {r.error ? (
                    <div className="text-xs text-zinc-600">— {r.error}</div>
                  ) : (
                    <>
                      <div className="mb-2">
                        <ScoreBar score={r.analysis?.compositeScore ?? 0} />
                      </div>
                      <p className="text-xs text-zinc-400 mb-3">{r.decision?.reason}</p>
                      {r.strategies && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          {r.strategies.map((s) => (
                            <div
                              key={s.horizon}
                              className="border border-zinc-800/40 rounded-lg p-2 bg-zinc-950/40"
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-[10px] text-zinc-500">{s.label}</span>
                                <span
                                  className={clsx(
                                    "px-1.5 py-0.5 border rounded text-[10px] font-bold",
                                    ACTION_COLORS[s.action]
                                  )}
                                >
                                  {ACTION_LABEL[s.action] ?? s.action}
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-400 leading-snug">{s.rationale}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Market regime ─── */}
      {tab === "market" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">主要指数のレジーム検出（日次データ1年）</p>
            <button
              onClick={loadMarketRegimes}
              disabled={marketLoading}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium"
            >
              {marketLoading ? "更新中..." : "更新"}
            </button>
          </div>

          {marketLoading && Object.keys(marketRegimes).length === 0 && (
            <div className="flex flex-col items-center py-16">
              <div className="w-10 h-10 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-3" />
              <div className="text-sm text-zinc-400">主要指数を取得中...</div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(marketRegimes).map(([key, data]) => {
              if (!data) {
                return (
                  <div key={key} className="border border-zinc-800/40 rounded-xl p-4 text-zinc-500 text-sm">
                    {key}: 取得失敗
                  </div>
                );
              }
              return (
                <div key={key} className="border border-zinc-800/60 rounded-xl p-4 bg-zinc-900/30">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm text-zinc-500">{data.name}</div>
                      <div className="text-xl font-bold font-mono">
                        {data.lastClose?.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <RegimeBadge regime={data.regime} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
