"use client";

import { useState, useEffect, useCallback } from "react";
import { clsx } from "clsx";
import { Scale, RefreshCw, Info, AlertTriangle } from "lucide-react";
import {
  compareTo,
  inferStartMonth,
  type Comparison,
  type TimelinePointLike,
} from "@/lib/benchmark";

interface PeriodReturn {
  from: string;
  to: string;
  months: number;
  returnPct: number;
  invested: number;
  finalValue: number;
  annualPct: number | null;
}

interface BenchmarkResult {
  ticker: string;
  label: string;
  lumpSum: PeriodReturn | null;
  dca: PeriodReturn | null;
  gapCount: number;
  error?: string;
}

interface ApiResponse {
  from: string;
  to: string | null;
  months: number;
  tooShort: boolean;
  results: BenchmarkResult[];
  fetchedAt: string;
}

export interface SummaryLike {
  account: string;
  marketValue: number;
  totalSold: number;
  totalDividends: number;
  totalBought: number;
  totalReturn: number;
  totalReturnPct: number;
}

const STORAGE_KEY = "benchmark-start-month";

const pct = (v: number, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d)}%`;
const pt = (v: number, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d)}pt`;

const VERDICT_STYLE = {
  win: "text-emerald-400",
  lose: "text-red-400",
  tie: "text-zinc-400",
} as const;

const VERDICT_LABEL = { win: "勝ち", lose: "負け", tie: "引き分け" } as const;

export default function BenchmarkCard({
  summary,
  timeline = [],
}: {
  summary: SummaryLike[];
  /** 資産推移。開始月の初期値をここから推定する */
  timeline?: TimelinePointLike[];
}) {
  const [startMonth, setStartMonth] = useState("");
  const [inferred, setInferred] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 開始月はこの画面だけの設定。asset-settings とは別キーにして、
  // 診断タブ側の保存と踏み合わないようにする
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/save-data?key=${STORAGE_KEY}`);
        if (res.ok) {
          const j = await res.json();
          if (typeof j?.data === "string" && j.data) {
            setStartMonth(j.data);
            return;
          }
        }
      } catch {
        /* 未保存なら下の推定に落ちる */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // 保存が無ければ、資産推移でリスク資産が最初に立った月を初期値にする。
  // 手で入れさせるより、持っているデータから決めた方が正確で早い。
  useEffect(() => {
    if (!loaded || startMonth || timeline.length === 0) return;
    const guess = inferStartMonth(timeline);
    if (guess) {
      setInferred(guess);
      setStartMonth(guess);
    }
  }, [loaded, startMonth, timeline]);

  const persist = useCallback(async (v: string) => {
    setStartMonth(v);
    try {
      await fetch("/api/save-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: STORAGE_KEY, data: v }),
      });
    } catch {
      /* 保存に失敗しても画面は動かす */
    }
  }, []);

  const load = useCallback(async (from: string) => {
    if (!/^\d{4}-\d{2}$/.test(from)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/benchmark?from=${from}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `API ${res.status}`);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loaded && /^\d{4}-\d{2}$/.test(startMonth)) load(startMonth);
  }, [loaded, startMonth, load]);

  const total = summary.find((s) => s.account === "累計") ?? summary[0];
  const accounts = summary.filter((s) => s.account !== "累計");

  return (
    <div className="border border-zinc-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-medium flex items-center gap-2">
            <Scale size={16} className="text-zinc-500" />
            インデックスに入れていた場合と比べる
          </h3>
          <p className="text-sm text-zinc-500 mt-0.5">
            累積リターンは期間が付かないと良し悪しが判断できません。同じ期間・同じ入れ方で
            インデックスを買った場合を横に並べます。
          </p>
        </div>
        {data && (
          <button
            onClick={() => load(startMonth)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={14} className={clsx(loading && "animate-spin")} />
            更新
          </button>
        )}
      </div>

      {/* 開始月 */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        <label className="text-zinc-400">投資を始めた月</label>
        <input
          type="month"
          value={startMonth}
          onChange={(e) => persist(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm"
        />
        {data && (
          <span className="text-zinc-500">
            {data.from}〜{data.to}（{data.months}ヶ月）
          </span>
        )}
        {inferred && startMonth === inferred && (
          <span className="text-xs text-zinc-500">
            資産推移で株式・投信が最初に立った月から推定。違っていれば直してください
          </span>
        )}
      </div>

      {!startMonth && loaded && (
        <div className="flex items-start gap-2 text-sm text-zinc-400 bg-zinc-900/60 border border-zinc-800 rounded p-3">
          <Info size={15} className="shrink-0 mt-0.5 text-zinc-500" />
          <span>
            開始月を入れると比較できます。入れるまで判定は出しません。期間の分からない
            リターンは、良かったのか悪かったのか決められないためです。
          </span>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400 border border-red-900/60 rounded p-3">{error}</div>
      )}

      {loading && !data && <div className="text-sm text-zinc-500">指数を取得しています…</div>}

      {data && total && (
        <>
          {data.tooShort && (
            <div className="flex items-start gap-2 text-sm bg-amber-950/40 border border-amber-900/60 rounded p-2.5 mb-3">
              <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
              <span className="text-amber-300">
                期間が {data.months} ヶ月しかありません。相場の一局面しか見ていないので、
                勝ち負けを結論にしないでください。
              </span>
            </div>
          )}

          {/* 比較表 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-xs text-zinc-500 border-b border-zinc-800">
                  <th className="text-left font-normal pb-1.5">口座</th>
                  <th className="text-right font-normal pb-1.5 px-2">投じた額</th>
                  <th className="text-right font-normal pb-1.5 px-2">実績</th>
                  {data.results
                    .filter((r) => r.dca)
                    .map((r) => (
                      <th key={r.ticker} className="text-right font-normal pb-1.5 px-2">
                        vs {r.label}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {[total, ...accounts].map((s) => (
                  <tr key={s.account} className="border-b border-zinc-900 last:border-0">
                    <td
                      className={clsx(
                        "py-2 pr-2 whitespace-nowrap",
                        s.account === "累計" ? "font-medium" : "text-zinc-400"
                      )}
                    >
                      {s.account}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-zinc-500">
                      ¥{s.totalBought.toLocaleString()}
                    </td>
                    <td
                      className={clsx(
                        "py-2 px-2 text-right font-mono",
                        s.totalReturnPct >= 0 ? "text-emerald-400" : "text-red-400"
                      )}
                    >
                      {pct(s.totalReturnPct, 2)}
                    </td>
                    {data.results
                      .filter((r) => r.dca)
                      .map((r) => {
                        const c: Comparison = compareTo(
                          s.totalReturnPct,
                          r.dca!.returnPct,
                          r.label
                        );
                        return (
                          <td
                            key={r.ticker}
                            className={clsx(
                              "py-2 px-2 text-right font-mono",
                              VERDICT_STYLE[c.verdict]
                            )}
                          >
                            {pt(c.diffPt)}
                            <span className="text-xs ml-1">{VERDICT_LABEL[c.verdict]}</span>
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* インデックス側の内訳 */}
          <div className="mt-3 text-xs text-zinc-500">
            比較対象（{data.from}〜{data.to}）:
            {data.results
              .filter((r) => r.dca && r.lumpSum)
              .map((r) => (
                <span key={r.ticker} className="ml-2">
                  {r.label} 積立 <span className="text-zinc-400">{pct(r.dca!.returnPct)}</span> /
                  一括 <span className="text-zinc-400">{pct(r.lumpSum!.returnPct)}</span>
                </span>
              ))}
          </div>

          <div className="mt-3 flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/60 border border-zinc-800 rounded p-2.5">
            <Info size={14} className="shrink-0 mt-0.5" />
            <div>
              実績は「投じた金額に対するリターン」なので、インデックス側も同じ定義（毎月同額を
              積み立てた場合）で出しています。年率には直していません。積立は資金の滞在期間が
              期間の半分ほどで、年率換算すると実態とずれるためです。指数は配当込みです。
            </div>
          </div>
        </>
      )}
    </div>
  );
}
