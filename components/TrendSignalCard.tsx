"use client";

import { useState, useEffect, useCallback } from "react";
import { clsx } from "clsx";
import { TrendingUp, Wallet, RefreshCw, AlertTriangle, Info } from "lucide-react";

/* ------------------------------------------------------------------ */
/* API のレスポンス型                                                  */
/* ------------------------------------------------------------------ */

interface Stats {
  cagr: number;
  maxDrawdown: number;
  volatility: number;
  sharpe: number;
  totalReturn: number;
  months: number;
}

interface Backtest {
  strategy: Stats;
  buyHold: Stats;
  switches: number;
  cashMonthsPct: number;
  from: string;
  to: string;
  switchCostPct: number;
  cashAnnualPct: number;
}

interface Signal {
  state: "invested" | "cash";
  asOf: string;
  close: number;
  sma: number | null;
  gapPct: number | null;
  changedAt: string | null;
  monthsInState: number;
  changedThisMonth: boolean;
  provisional: {
    month: string;
    close: number;
    sma: number | null;
    state: "invested" | "cash";
    diverges: boolean;
  } | null;
}

interface Period {
  label: string;
  from: string;
  to: string;
  result: Backtest | null;
}

interface TargetResult {
  ticker: string;
  label: string;
  note: string;
  name: string;
  currency: string;
  usd: { signal: Signal; backtest: Backtest | null } | null;
  jpy: { signal: Signal; backtest: Backtest | null } | null;
  periods: Period[];
  gapCount: number;
  firstGap: string | null;
  error?: string;
}

interface ApiResponse {
  period: number;
  switchCostPct: number;
  cashAnnualPct: number;
  usdJpy: number | null;
  asOf: string | null;
  actionNeeded: { ticker: string; state: string; asOf: string }[];
  results: TargetResult[];
  fetchedAt: string;
}

/* ------------------------------------------------------------------ */

const pct = (v: number | null, digits = 1) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;

const STATE_STYLE = {
  invested: {
    chip: "bg-emerald-900/40 text-emerald-300 border-emerald-800/60",
    text: "text-emerald-400",
    label: "保有",
    Icon: TrendingUp,
  },
  cash: {
    chip: "bg-amber-900/40 text-amber-300 border-amber-800/60",
    text: "text-amber-400",
    label: "現金",
    Icon: Wallet,
  },
} as const;

function StatsRow({ label, s, dim }: { label: string; s: Stats; dim?: boolean }) {
  return (
    <tr className={clsx("border-b border-zinc-900 last:border-0", dim && "text-zinc-500")}>
      <td className="py-1.5 pr-3 whitespace-nowrap">{label}</td>
      <td className="py-1.5 px-2 text-right font-mono">{pct(s.cagr, 2)}</td>
      <td className="py-1.5 px-2 text-right font-mono">{pct(s.maxDrawdown, 1)}</td>
      <td className="py-1.5 px-2 text-right font-mono">{s.volatility.toFixed(1)}%</td>
      <td className="py-1.5 pl-2 text-right font-mono">{s.sharpe.toFixed(2)}</td>
    </tr>
  );
}

function TargetCard({ r, period }: { r: TargetResult; period: number }) {
  const [view, setView] = useState<"usd" | "jpy">("usd");

  if (r.error) {
    return (
      <div className="border border-red-900/60 rounded-lg p-4 text-sm">
        <div className="font-medium mb-1">{r.ticker}</div>
        <div className="text-red-400">取得に失敗しました: {r.error}</div>
      </div>
    );
  }

  const side = view === "jpy" && r.jpy ? r.jpy : r.usd;
  if (!side) {
    return (
      <div className="border border-zinc-800 rounded-lg p-4 text-sm text-zinc-500">
        {r.ticker}: 判定に必要な月数（{period}ヶ月）に足りません
      </div>
    );
  }

  const s = side.signal;
  const bt = side.backtest;
  const st = STATE_STYLE[s.state];

  return (
    <div className="border border-zinc-800 rounded-lg p-4">
      {/* ヘッダ */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="font-medium">
            {r.ticker}
            <span className="text-zinc-500 text-sm ml-2">{r.note || r.name}</span>
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">
            確定 {s.asOf} 月末の終値で判定
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {(["usd", "jpy"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              disabled={v === "jpy" && !r.jpy}
              className={clsx(
                "px-2 py-1 rounded text-xs",
                view === v ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800",
                v === "jpy" && !r.jpy && "opacity-30 cursor-not-allowed"
              )}
            >
              {v === "usd" ? "ドル建て" : "円建て"}
            </button>
          ))}
        </div>
      </div>

      {r.gapCount > 0 && (
        <div className="flex items-start gap-2 text-sm bg-red-950/40 border border-red-900/60 rounded p-2.5 mb-3">
          <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
          <span>
            <span className="text-red-300 font-medium">
              月が {r.gapCount} 個飛んでいます（最初の欠け {r.firstGap}）。
            </span>{" "}
            データの粒度が想定と違う可能性があるので、下の数字を信用しないでください。
          </span>
        </div>
      )}

      {/* シグナル本体 */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span
          className={clsx(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-sm font-medium",
            st.chip
          )}
        >
          <st.Icon size={14} />
          {st.label}
        </span>
        <span className="text-sm text-zinc-400 font-mono">
          終値 {s.close.toLocaleString(undefined, { maximumFractionDigits: 2 })} / SMA{period}{" "}
          {s.sma?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}
        </span>
        <span className={clsx("text-sm font-mono", st.text)}>{pct(s.gapPct)}</span>
        <span className="text-xs text-zinc-500">
          {s.monthsInState}ヶ月継続{s.changedAt ? `（${s.changedAt}から）` : ""}
        </span>
      </div>

      {s.changedThisMonth && (
        <div className="flex items-start gap-2 text-sm bg-amber-950/40 border border-amber-900/60 rounded p-2.5 mb-3">
          <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
          <span>
            <span className="text-amber-300 font-medium">{s.asOf} でシグナルが変わりました。</span>{" "}
            {st.label}に切り替える発注が要ります。
          </span>
        </div>
      )}

      {s.provisional && (
        <div
          className={clsx(
            "text-xs rounded p-2 mb-3 border",
            s.provisional.diverges
              ? "bg-zinc-900 border-zinc-700 text-zinc-300"
              : "bg-zinc-900/50 border-zinc-800 text-zinc-500"
          )}
        >
          <span className="font-medium">参考</span>: 進行中の {s.provisional.month} の値で仮判定すると{" "}
          <span className={STATE_STYLE[s.provisional.state].text}>
            {STATE_STYLE[s.provisional.state].label}
          </span>
          。
          {s.provisional.diverges
            ? " 確定シグナルと食い違っていますが、従うのは確定月末の方です。月末まで動かしません。"
            : " 確定シグナルと同じです。"}
        </div>
      )}

      {/* バックテスト */}
      {bt && (
        <div className="mt-3">
          <div className="text-xs text-zinc-500 mb-1.5">
            {bt.from}〜{bt.to}（乗り換え {bt.switches}回 / 現金でいた月{" "}
            {bt.cashMonthsPct.toFixed(0)}% / 乗り換えコスト {bt.switchCostPct}% / 現金は年
            {bt.cashAnnualPct}%で運用する前提 / 配当込み）
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left font-normal pb-1">　</th>
                <th className="text-right font-normal pb-1 px-2">年率</th>
                <th className="text-right font-normal pb-1 px-2">最大下落</th>
                <th className="text-right font-normal pb-1 px-2">変動</th>
                <th className="text-right font-normal pb-1 pl-2">Sharpe</th>
              </tr>
            </thead>
            <tbody>
              <StatsRow label="シグナルに従う" s={bt.strategy} />
              <StatsRow label="ずっと保有" s={bt.buyHold} dim />
            </tbody>
          </table>
        </div>
      )}

      {/* 期間別 */}
      {r.periods.length > 0 && view === "usd" && (
        <div className="mt-3">
          <div className="text-xs text-zinc-500 mb-1.5">
            期間別（1つの期間で勝っただけの結果を信用しないため）
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left font-normal pb-1">期間</th>
                <th className="text-right font-normal pb-1 px-2">従う</th>
                <th className="text-right font-normal pb-1 px-2">ずっと保有</th>
                <th className="text-right font-normal pb-1 px-2">下落の差</th>
              </tr>
            </thead>
            <tbody>
              {r.periods.map((p) => {
                if (!p.result) return null;
                const a = p.result.strategy;
                const b = p.result.buyHold;
                const win = a.cagr > b.cagr;
                const ddSaved = a.maxDrawdown - b.maxDrawdown;
                return (
                  <tr key={p.label} className="border-b border-zinc-900 last:border-0">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-zinc-400">{p.label}</td>
                    <td
                      className={clsx(
                        "py-1.5 px-2 text-right font-mono",
                        win ? "text-emerald-400" : "text-zinc-400"
                      )}
                    >
                      {pct(a.cagr)}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-zinc-500">
                      {pct(b.cagr)}
                    </td>
                    <td
                      className={clsx(
                        "py-1.5 px-2 text-right font-mono",
                        ddSaved > 1 ? "text-emerald-400" : "text-zinc-600"
                      )}
                    >
                      {ddSaved > 0 ? `+${ddSaved.toFixed(0)}pt浅い` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TrendSignalCard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trend-signal");
      if (!res.ok) throw new Error(`API ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      {/* 見出し */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">月次トレンドシグナル</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            月末終値が{data?.period ?? 10}ヶ月移動平均の上か下かだけを見る。判定は月1回。
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={clsx(loading && "animate-spin")} />
          更新
        </button>
      </div>

      {/* 何のための道具か */}
      <div className="flex items-start gap-2 text-sm text-zinc-400 bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
        <Info size={15} className="shrink-0 mt-0.5 text-zinc-500" />
        <div>
          <span className="text-zinc-300">リターンを増やす道具ではありません。</span>
          8銘柄 × SMA6〜14ヶ月の72通りで検証したところ、
          <span className="text-zinc-300">最大下落が浅くなったのは72通り中72通り（100%）</span>、
          <span className="text-zinc-300">リターンでずっと保有に勝ったのは25通り（35%）</span>でした。
          勝つのは暴落を含む期間だけです（日経225の1990年代・2000年代、S&amp;P500の2000年代）。
          積立を続けられるようにするための保険で、保険料はリターンです。
          検証は <code className="text-zinc-400">npx tsx --tsconfig tsconfig.json scripts/trend-robustness.harness.ts</code>。
        </div>
      </div>

      {error && (
        <div className="border border-red-900/60 rounded-lg p-3 text-sm text-red-400">
          読み込みに失敗しました: {error}
        </div>
      )}

      {loading && !data && (
        <div className="text-sm text-zinc-500">20年ぶんの月足を取得しています…</div>
      )}

      {data && (
        <>
          {/* 発注が要るか */}
          <div
            className={clsx(
              "rounded-lg p-3 text-sm border",
              data.actionNeeded.length > 0
                ? "bg-amber-950/40 border-amber-900/60"
                : "bg-zinc-900/60 border-zinc-800"
            )}
          >
            {data.actionNeeded.length > 0 ? (
              <span>
                <span className="text-amber-300 font-medium">
                  今月やることがあります（{data.actionNeeded.length}件）:
                </span>{" "}
                {data.actionNeeded
                  .map((a) => `${a.ticker} → ${STATE_STYLE[a.state as "invested" | "cash"].label}`)
                  .join(" / ")}
              </span>
            ) : (
              <span className="text-zinc-400">
                <span className="text-zinc-300">今月やることはありません。</span>{" "}
                {data.asOf} 時点でシグナルの変化なし。次の確認は翌月末で足ります。
              </span>
            )}
          </div>

          <div className="space-y-3">
            {data.results.map((r) => (
              <TargetCard key={r.ticker} r={r} period={data.period} />
            ))}
          </div>

          <div className="text-xs text-zinc-600">
            USD/JPY {data.usdJpy?.toFixed(2) ?? "—"} ／ 取得 {new Date(data.fetchedAt).toLocaleString("ja-JP")}
            ／ 出典 Meb Faber (2006) &quot;A Quantitative Approach to Tactical Asset Allocation&quot;
            ／ 発注は手動。NISA 口座でも実行できます
          </div>
        </>
      )}
    </div>
  );
}
