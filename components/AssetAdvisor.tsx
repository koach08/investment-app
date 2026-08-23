"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { clsx } from "clsx";
import { ShieldCheck, ShieldAlert, ShieldX, HelpCircle, Send, RotateCcw } from "lucide-react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { analyzeIncome, incomeToBriefing, type DividendLike } from "@/lib/income";
import {
  analyzeAssetHealth,
  healthToBriefing,
  type HealthInput,
  type HoldingLike,
  type ManualAssetLike,
  type TimelinePointLike,
  type Status,
  type Horizon,
} from "@/lib/asset-health";

interface Props {
  holdings: HoldingLike[];
  manualAssets: ManualAssetLike[];
  timeline: TimelinePointLike[];
  dividends: DividendLike[];
  mfData: {
    totalAssets: number;
    totalLiabilities: number;
    breakdown: { name: string; amount: number; pct: number }[];
  } | null;
  /** MF が無いときのフォールバック総資産 */
  fallbackTotal: number;
  /** 1 USD = 何円か。外貨建ての評価額を円に直すのに使う */
  usdJpy?: number | null;
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const SETTINGS_KEY = "investment-app-asset-settings";

const HORIZON_TABS: { key: Horizon | "all"; label: string; note: string }[] = [
  { key: "all", label: "全体", note: "短期・中期・長期をまとめて" },
  { key: "short", label: "短期 〜1年", note: "取り崩さずに済む状態を作る" },
  { key: "mid", label: "中期 1〜5年", note: "配分の歪みを直す" },
  { key: "long", label: "長期 5年〜", note: "崩れない形を積み上げる" },
];

const TEMPLATES: Record<Horizon | "all", string[]> = {
  all: [
    "短期・中期・長期それぞれで、いま最初にやることを1つずつ挙げてください。",
    "この資産状況で、今やってはいけないことは何ですか。",
    "守りの穴を塞ぐ順番を、金額つきで並べてください。",
  ],
  short: [
    "いま一番危ないのはどこですか。危ない順に並べてください。",
    "1年以内に使う予定のお金が、値動きするものに入っていないか確認してください。",
    "含み損の銘柄を年内に整理すべきか、税額込みで判断材料をください。",
  ],
  mid: [
    "この配分のまま5年持つと、どこで一番痛みますか。",
    "集中している銘柄をどう薄めるか、税と手数料を差し引いた上で提案してください。",
    "円高と株安が同時に来たとき、生活に影響が出るのはいくら下げたときですか。",
  ],
  long: [
    "NISA と iDeCo の枠を使い切る順番を、いまの現金余力から逆算してください。",
    "放っておいても崩れない形にするには、何をいくつ持てばよいですか。",
    "インフレで現金が目減りする分を、どこで受けるのが現実的ですか。",
  ],
};

const STATUS_STYLE: Record<Status, { border: string; text: string; chip: string; label: string }> = {
  good: { border: "border-emerald-800/60", text: "text-emerald-400", chip: "bg-emerald-900/40 text-emerald-300", label: "OK" },
  warn: { border: "border-amber-800/60", text: "text-amber-400", chip: "bg-amber-900/40 text-amber-300", label: "注意" },
  bad: { border: "border-red-800/60", text: "text-red-400", chip: "bg-red-900/40 text-red-300", label: "要対処" },
  unknown: { border: "border-zinc-800", text: "text-zinc-500", chip: "bg-zinc-800 text-zinc-400", label: "判定不可" },
};

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

export default function AssetAdvisor({ holdings, manualAssets, timeline, dividends, mfData, fallbackTotal, usdJpy }: Props) {
  const [fetchedUsdJpy, setFetchedUsdJpy] = useState<number | null>(null);
  const rate = usdJpy ?? fetchedUsdJpy;
  const [monthlyExpense, setMonthlyExpense] = useState(0);
  const [targetMonths, setTargetMonths] = useState(6);
  const [expenseInput, setExpenseInput] = useState("");
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [horizon, setHorizon] = useState<Horizon | "all">("all");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [showBriefing, setShowBriefing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 為替レートは親から来なければ自分で取りに行く
  useEffect(() => {
    if (usdJpy) return;
    fetch("/api/metals-price")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.usdjpy) setFetchedUsdJpy(d.usdjpy); })
      .catch(() => { /* ignore */ });
  }, [usdJpy]);

  // 設定の読み込み（サーバー優先、無ければ localStorage）
  useEffect(() => {
    const load = async () => {
      let s: { monthlyExpense?: number; targetMonths?: number } | null = null;
      try {
        const res = await fetch("/api/save-data?key=asset-settings");
        const json = await res.json();
        if (json?.data && typeof json.data === "object") s = json.data;
      } catch { /* ignore */ }
      if (!s) {
        try {
          const saved = localStorage.getItem(SETTINGS_KEY);
          if (saved) s = JSON.parse(saved);
        } catch { /* ignore */ }
      }
      if (s) {
        if (typeof s.monthlyExpense === "number") {
          setMonthlyExpense(s.monthlyExpense);
          setExpenseInput(s.monthlyExpense > 0 ? String(s.monthlyExpense) : "");
        }
        if (typeof s.targetMonths === "number") setTargetMonths(s.targetMonths);
      }
      setSettingsLoaded(true);
    };
    load();
  }, []);

  const persistSettings = async (expense: number, months: number) => {
    const payload = { monthlyExpense: expense, targetMonths: months };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
    try {
      await fetch("/api/save-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "asset-settings", data: payload }),
      });
    } catch { /* ignore */ }
  };

  const health = useMemo(() => {
    const payload: HealthInput = {
      totalAssets: mfData?.totalAssets ?? fallbackTotal,
      totalLiabilities: mfData?.totalLiabilities ?? 0,
      breakdown: mfData?.breakdown ?? [],
      holdings,
      manualAssets,
      timeline,
      monthlyExpense,
      targetCashMonths: targetMonths,
      fxRates: rate ? { USD: rate } : {},
    };
    return analyzeAssetHealth(payload);
  }, [holdings, manualAssets, timeline, mfData, fallbackTotal, monthlyExpense, targetMonths, rate]);

  const income = useMemo(
    () => analyzeIncome(dividends, { totalAssets: health.totalAssets, riskAssets: health.riskAssets }),
    [dividends, health.totalAssets, health.riskAssets]
  );

  const briefing = useMemo(
    () => healthToBriefing(health, monthlyExpense) + incomeToBriefing(income),
    [health, monthlyExpense, income]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, asking]);

  const ask = async (question: string) => {
    if (!question.trim() || asking) return;
    setError("");
    const next: ChatMsg[] = [...messages, { role: "user", content: question.trim() }];
    setMessages(next);
    setInput("");
    setAsking(true);
    try {
      const res = await fetch("/api/asset-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, briefing, horizon }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setMessages(next);
      } else {
        setMessages([...next, { role: "assistant", content: data.reply }]);
      }
    } catch {
      setError("相談窓口との通信に失敗しました");
    }
    setAsking(false);
  };

  const VerdictIcon = health.verdict.status === "good" ? ShieldCheck : health.verdict.status === "bad" ? ShieldX : health.verdict.status === "warn" ? ShieldAlert : HelpCircle;
  const vs = STATUS_STYLE[health.verdict.status];

  const visibleMetrics = health.metrics.filter(
    (m) => horizon === "all" || m.horizons.includes(horizon as Horizon)
  );

  return (
    <div className="space-y-6">
      {/* ===== 前提の設定 ===== */}
      <div className="border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-zinc-400 mb-3">診断の前提</h3>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">月の生活費（円）</label>
            <input
              type="number"
              value={expenseInput}
              onChange={(e) => setExpenseInput(e.target.value)}
              onBlur={() => {
                const v = parseFloat(expenseInput);
                const next = Number.isFinite(v) && v > 0 ? v : 0;
                setMonthlyExpense(next);
                persistSettings(next, targetMonths);
              }}
              placeholder="例: 250000"
              className="w-40 bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">生活防衛資金の目標</label>
            <select
              value={targetMonths}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setTargetMonths(v);
                persistSettings(monthlyExpense, v);
              }}
              className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm"
            >
              {[3, 6, 12, 24].map((m) => (
                <option key={m} value={m}>{m}ヶ月分</option>
              ))}
            </select>
          </div>
          {monthlyExpense > 0 && (
            <div className="text-xs text-zinc-500 pb-2">
              目標額 {yen(monthlyExpense * targetMonths)} / 現金 {yen(health.buckets.cash)}
            </div>
          )}
          <div className="text-xs text-zinc-500 pb-2">
            {rate ? `為替 1 USD = ${rate.toFixed(2)}円で換算` : "為替レート取得中（外貨建ては一時的に除外）"}
          </div>
          {!settingsLoaded && <div className="text-xs text-zinc-600 pb-2">設定を読み込み中...</div>}
        </div>
      </div>

      {/* ===== 総合判定 ===== */}
      <div className={clsx("border rounded-lg p-5", vs.border)}>
        <div className="flex items-start gap-3">
          <VerdictIcon className={clsx("w-6 h-6 shrink-0 mt-0.5", vs.text)} />
          <div className="min-w-0">
            <div className={clsx("text-lg font-bold", vs.text)}>{health.verdict.headline}</div>
            <p className="text-sm text-zinc-400 mt-1 leading-relaxed">{health.verdict.summary}</p>
            <div className="text-xs text-zinc-500 mt-3">
              総資産 {yen(health.totalAssets)}
              {health.totalLiabilities > 0 && <> / 負債 {yen(health.totalLiabilities)} / 純資産 {yen(health.netAssets)}</>}
              {" / "}値動きする資産 {yen(health.riskAssets)}（{health.riskAssetPct.toFixed(1)}%）
            </div>
          </div>
        </div>
      </div>

      {/* ===== 時間軸タブ ===== */}
      <div>
        <div className="flex gap-1 overflow-x-auto">
          {HORIZON_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setHorizon(t.key)}
              className={clsx(
                "px-3 py-1.5 rounded text-sm whitespace-nowrap transition-colors",
                horizon === t.key ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-zinc-600 mt-2">
          {HORIZON_TABS.find((t) => t.key === horizon)?.note}
        </div>
      </div>

      {/* ===== 判断材料（メトリクス） ===== */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-400 mb-3">判断材料</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleMetrics.map((m) => {
            const s = STATUS_STYLE[m.status];
            return (
              <div key={m.id} className={clsx("border rounded-lg p-4", s.border)}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-zinc-400">{m.label}</span>
                  <span className={clsx("text-[10px] px-1.5 py-0.5 rounded", s.chip)}>{s.label}</span>
                </div>
                <div className={clsx("text-2xl font-bold mt-1", s.text)}>{m.value}</div>
                {m.detail && <div className="text-xs text-zinc-500 mt-1">{m.detail}</div>}
                <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{m.meaning}</p>
                <div className="text-[11px] text-zinc-600 mt-1.5">基準: {m.criterion}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== ストレスシナリオ ===== */}
      <div className="border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-zinc-400 mb-1">下げが来たときいくら減るか</h3>
        <p className="text-xs text-zinc-600 mb-3">値動きする資産 {yen(health.riskAssets)} に対する機械的な計算です。予想ではありません。</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-xs text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-2 font-normal">シナリオ</th>
                <th className="text-right py-2 font-normal">減る額</th>
                <th className="text-right py-2 font-normal">総資産比</th>
                <th className="text-right py-2 font-normal">残る総資産</th>
              </tr>
            </thead>
            <tbody>
              {health.stress.map((s) => (
                <tr key={s.id} className="border-b border-zinc-900 last:border-0">
                  <td className="py-2 pr-3">
                    <div className="text-zinc-300">{s.label}</div>
                    <div className="text-[11px] text-zinc-600 mt-0.5">{s.assumption}</div>
                  </td>
                  <td className="py-2 text-right font-mono text-red-400 whitespace-nowrap">-{yen(s.loss)}</td>
                  <td className="py-2 text-right font-mono text-zinc-500 whitespace-nowrap">{s.lossPct.toFixed(1)}%</td>
                  <td className="py-2 text-right font-mono text-zinc-300 whitespace-nowrap">{yen(s.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {monthlyExpense > 0 && (
          <div className="text-xs text-zinc-500 mt-3">
            どのシナリオでも現金 {yen(health.buckets.cash)} は減りません。生活費 {yen(monthlyExpense)}/月なら
            {(health.buckets.cash / monthlyExpense).toFixed(1)}ヶ月は投資分を売らずに持ちこたえられます。
          </div>
        )}
      </div>

      {/* ===== インカム（実測） ===== */}
      {income.recordCount > 0 && (
        <div className="border border-zinc-800 rounded-lg p-4">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
            <h3 className="text-sm font-semibold text-zinc-300">実際に入ってきたお金（配当・分配金）</h3>
            <span className="text-xs text-zinc-600">円建て・税引後 / 基準 {income.anchorDate}</span>
          </div>
          <p className="text-xs text-zinc-600 mb-4">記録された受取額の実測です。これから増える見込みではありません。</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500">直近12ヶ月</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{yen(income.last12m)}</div>
              <div className="text-xs text-zinc-500 mt-1">月あたり {yen(income.monthlyAvg)}</div>
            </div>
            <div className="border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500">前の12ヶ月との差</div>
              <div className={clsx("text-2xl font-bold mt-1", income.last12m >= income.prev12m ? "text-emerald-400" : "text-red-400")}>
                {income.last12m >= income.prev12m ? "+" : "−"}{yen(Math.abs(income.last12m - income.prev12m))}
              </div>
              <div className="text-xs text-zinc-500 mt-1">前期 {yen(income.prev12m)}</div>
            </div>
            <div className="border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500">総資産に対する利回り</div>
              <div className="text-2xl font-bold text-zinc-200 mt-1">
                {income.yieldOnTotal === null ? "—" : `${income.yieldOnTotal.toFixed(2)}%`}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                値動き資産だけなら {income.yieldOnRisk === null ? "—" : `${income.yieldOnRisk.toFixed(2)}%`}
              </div>
            </div>
            <div className="border border-zinc-800 rounded-lg p-3">
              <div className="text-xs text-zinc-500">記録全期間の累計</div>
              <div className="text-2xl font-bold text-zinc-200 mt-1">{yen(income.allTime)}</div>
              <div className="text-xs text-zinc-500 mt-1">{income.recordCount}件</div>
            </div>
          </div>

          {/* 年別 */}
          {income.byYear.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-zinc-500 mb-2">年別の受取額</div>
              <div className="space-y-1.5">
                {income.byYear.map((y) => {
                  const max = Math.max(...income.byYear.map((v) => v.amount));
                  const w = max > 0 ? (y.amount / max) * 100 : 0;
                  return (
                    <div key={y.year} className="flex items-center gap-2 text-sm">
                      <span className="w-12 text-zinc-500 text-xs">{y.year}</span>
                      <div className="flex-1 h-4 bg-zinc-900 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-600/50 rounded-full" style={{ width: `${w}%` }} />
                      </div>
                      <span className="font-mono text-zinc-300 w-24 text-right whitespace-nowrap">{yen(y.amount)}</span>
                      <span className="text-xs text-zinc-600 w-12 text-right">{y.count}件</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* 出どころ */}
            {income.topContributors.length > 0 && (
              <div>
                <div className="text-xs text-zinc-500 mb-2">直近12ヶ月の出どころ</div>
                <div className="space-y-1.5">
                  {income.topContributors.map((t) => (
                    <div key={t.name} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate text-zinc-300">{t.name}</span>
                      <span className="font-mono text-zinc-400 whitespace-nowrap">{yen(t.amount)}</span>
                      <span className="font-mono text-zinc-600 w-12 text-right">{t.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* 口座別 */}
            {income.byAccount.length > 0 && (
              <div>
                <div className="text-xs text-zinc-500 mb-2">口座別（直近12ヶ月）</div>
                <div className="space-y-1.5">
                  {income.byAccount.map((a) => (
                    <div key={a.account} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate text-zinc-300">
                        {a.account}
                        {a.taxFree && <span className="text-[10px] text-emerald-500 ml-1.5">非課税</span>}
                      </span>
                      <span className="font-mono text-zinc-400 whitespace-nowrap">{yen(a.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 目標インカムの逆算 */}
          {income.yieldOnTotal !== null && income.yieldOnTotal > 0 && (
            <div>
              <div className="text-xs text-zinc-500 mb-1">月いくら受け取るのに、いくら必要か</div>
              <p className="text-[11px] text-zinc-600 mb-2">
                いまと同じ構成・同じ利回り（{income.yieldOnTotal.toFixed(2)}%）が続いた場合の割り算です。将来の利回りを見込んだ数字ではありません。
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[420px]">
                  <thead>
                    <tr className="text-xs text-zinc-500 border-b border-zinc-800">
                      <th className="text-left py-1.5 font-normal">月の受取</th>
                      <th className="text-right py-1.5 font-normal">必要な総資産</th>
                      <th className="text-right py-1.5 font-normal">いまとの差</th>
                    </tr>
                  </thead>
                  <tbody>
                    {income.targets.map((t) => (
                      <tr key={t.monthlyTarget} className="border-b border-zinc-900 last:border-0">
                        <td className="py-1.5 text-zinc-300">{yen(t.monthlyTarget)}</td>
                        <td className="py-1.5 text-right font-mono text-zinc-400 whitespace-nowrap">
                          {t.requiredPrincipal === null ? "—" : yen(t.requiredPrincipal)}
                        </td>
                        <td className="py-1.5 text-right font-mono whitespace-nowrap">
                          {t.additionalNeeded === null ? (
                            "—"
                          ) : t.additionalNeeded === 0 ? (
                            <span className="text-emerald-400">達成済み</span>
                          ) : (
                            <span className="text-zinc-500">+{yen(t.additionalNeeded)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {income.notes.length > 0 && (
            <ul className="mt-3 space-y-1">
              {income.notes.map((n, i) => (
                <li key={i} className="text-[11px] text-zinc-600 leading-relaxed">・{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ===== 上位保有・含み損 ===== */}
      {(health.topPositions.length > 0 || health.lossMakers.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {health.topPositions.length > 0 && (
            <div className="border border-zinc-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-zinc-400 mb-1">集中しているポジション</h3>
              <p className="text-xs text-zinc-600 mb-3">口座単位ではなく、中身の商品単位で並べています</p>
              <div className="space-y-2">
                {health.topPositions.map((t) => (
                  <div key={t.name} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate text-zinc-300">
                      {t.name}
                      {t.estimated && <span className="text-[10px] text-zinc-600 ml-1">推定</span>}
                    </span>
                    <span className="font-mono text-zinc-400 whitespace-nowrap">{yen(t.value)}</span>
                    <span className={clsx("font-mono w-14 text-right whitespace-nowrap", t.pctOfTotal > 20 ? "text-red-400" : t.pctOfTotal > 10 ? "text-amber-400" : "text-zinc-500")}>
                      {t.pctOfTotal.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {health.lossMakers.length > 0 && (
            <div className="border border-zinc-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-zinc-400 mb-1">含み損（損益通算の候補）</h3>
              <p className="text-xs text-zinc-600 mb-3">含み益 {yen(health.unrealizedGainTotal)} と相殺できる余地</p>
              <div className="space-y-2">
                {health.lossMakers.slice(0, 6).map((l) => (
                  <div key={l.code} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate text-zinc-300">{l.name}</span>
                    <span className="font-mono text-red-400 whitespace-nowrap">{yen(l.pnl)}</span>
                    <span className="font-mono text-red-600 w-14 text-right whitespace-nowrap">{l.pnlPercent.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== データの欠け ===== */}
      {health.gaps.length > 0 && (
        <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/40">
          <h3 className="text-sm font-semibold text-zinc-400 mb-2">この診断で見えていないもの</h3>
          <ul className="space-y-1.5">
            {health.gaps.map((g, i) => (
              <li key={i} className="text-xs text-zinc-500 leading-relaxed">・{g}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ===== AI 相談窓口 ===== */}
      <div className="border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-zinc-300">AI 相談窓口</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setShowBriefing((v) => !v)}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              {showBriefing ? "渡すデータを隠す" : "渡すデータを見る"}
            </button>
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); setError(""); }}
                className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />履歴を消す
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-zinc-600 mb-3">
          上の判断材料をそのまま渡した上で相談します。守りが立っていない項目があるうちは、増やす提案より先にそこを潰す答えが返ります。
        </p>

        {showBriefing && (
          <pre className="text-[11px] text-zinc-500 bg-zinc-900 border border-zinc-800 rounded p-3 mb-3 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
            {briefing}
          </pre>
        )}

        {/* テンプレ質問 */}
        <div className="flex flex-wrap gap-2 mb-3">
          {TEMPLATES[horizon].map((q) => (
            <button
              key={q}
              onClick={() => ask(q)}
              disabled={asking}
              className="text-xs px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 rounded text-zinc-300 text-left"
            >
              {q}
            </button>
          ))}
        </div>

        {/* 会話 */}
        {messages.length > 0 && (
          <div className="space-y-3 mb-3 max-h-[520px] overflow-y-auto pr-1">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="text-sm bg-zinc-800/60 rounded-lg px-3 py-2 text-zinc-200">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="border border-zinc-800 rounded-lg px-3 py-2">
                  <MarkdownRenderer content={m.content} />
                </div>
              )
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {asking && (
          <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3">
            <span className="animate-spin inline-block w-3 h-3 border-2 border-zinc-600 border-t-zinc-300 rounded-full" />
            資産データを読んで考えています...
          </div>
        )}
        {error && <div className="text-xs text-red-400 mb-3">{error}</div>}

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) ask(input); }}
            placeholder="気になっていることを書いてください"
            disabled={asking}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm disabled:opacity-50"
          />
          <button
            onClick={() => ask(input)}
            disabled={asking || !input.trim()}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 rounded text-sm flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />相談
          </button>
        </div>
        <div className="text-[11px] text-zinc-600 mt-2">
          投資助言ではなく判断材料の提供です。最終的な売買の判断は本人が行ってください。
        </div>
      </div>
    </div>
  );
}
