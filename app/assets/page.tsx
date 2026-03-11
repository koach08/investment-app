"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { clsx } from "clsx";

interface Holding {
  source: string;
  code: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  pnlPercent: number;
  category: string;
  currency: string;
}

interface ManualAsset {
  name: string;
  category: string;
  amount: number;
  currency: string;
  note: string;
}

interface DividendRecord {
  date: string;
  account: string;
  product: string;
  name: string;
  ticker: string;
  quantity: number;
  amount: number;
  currency: string;
}

interface SummaryRecord {
  account: string;
  marketValue: number;
  totalSold: number;
  totalDividends: number;
  totalBought: number;
  totalReturn: number;
  totalReturnPct: number;
}

interface TimelineRecord {
  date: string;
  total: number;
  cash: number;
  stocks: number;
  margin: number;
  funds: number;
  points: number;
  other: number;
  debt?: number;
}

const ASSET_CATEGORIES: { key: keyof TimelineRecord; label: string; color: string }[] = [
  { key: "cash", label: "預金・現金", color: "#3b82f6" },
  { key: "funds", label: "投資信託", color: "#8b5cf6" },
  { key: "stocks", label: "株式（現物）", color: "#22c55e" },
  { key: "margin", label: "信用", color: "#f59e0b" },
  { key: "points", label: "ポイント", color: "#06b6d4" },
  { key: "other", label: "その他", color: "#64748b" },
  { key: "debt", label: "負債（カード等）", color: "#ef4444" },
];

const STORAGE_KEY = "investment-app-assets";
const MANUAL_STORAGE_KEY = "investment-app-manual-assets";
const DIVIDENDS_KEY = "investment-app-dividends";
const SUMMARY_KEY = "investment-app-summary";
const TIMELINE_KEY = "investment-app-timeline";

type TabKey = "overview" | "upload" | "paste" | "dividends" | "timeline" | "manual";

export default function AssetsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [manualAssets, setManualAssets] = useState<ManualAsset[]>([]);
  const [dividends, setDividends] = useState<DividendRecord[]>([]);
  const [summary, setSummary] = useState<SummaryRecord[]>([]);
  const [timeline, setTimeline] = useState<TimelineRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const dataLoadedRef = useRef(false);

  // CSV upload state
  const [csvSource, setCsvSource] = useState("sbi");
  const [dragOver, setDragOver] = useState(false);

  // Paste import state
  const [pasteText, setPasteText] = useState("");

  // Manual input state
  const [manualName, setManualName] = useState("");
  const [manualCategory, setManualCategory] = useState("米国株");
  const [manualAmount, setManualAmount] = useState("");
  const [manualCurrency, setManualCurrency] = useState("JPY");
  const [manualNote, setManualNote] = useState("");

  // Helper: save to server
  const saveToServer = async (key: string, data: unknown) => {
    try {
      await fetch("/api/save-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, data }),
      });
    } catch { /* ignore */ }
  };

  // Load data: server is source of truth, fallback to localStorage
  useEffect(() => {
    const loadData = async () => {
      const keys = [
        { key: "holdings", setter: setHoldings, storageKey: STORAGE_KEY },
        { key: "manual-assets", setter: setManualAssets, storageKey: MANUAL_STORAGE_KEY },
        { key: "dividends", setter: setDividends, storageKey: DIVIDENDS_KEY },
        { key: "summary", setter: setSummary, storageKey: SUMMARY_KEY },
        { key: "timeline", setter: setTimeline, storageKey: TIMELINE_KEY },
      ];

      for (const { key, setter, storageKey } of keys) {
        let loaded = false;
        // Try server first (source of truth)
        try {
          const res = await fetch(`/api/save-data?key=${key}`);
          const result = await res.json();
          if (result.data && (Array.isArray(result.data) ? result.data.length > 0 : true)) {
            setter(result.data);
            localStorage.setItem(storageKey, JSON.stringify(result.data));
            loaded = true;
          }
        } catch { /* ignore */ }

        // Fallback to localStorage if server had no data
        if (!loaded) {
          try {
            const saved = localStorage.getItem(storageKey);
            if (saved) { setter(JSON.parse(saved)); }
          } catch { /* ignore */ }
        }
      }
    };
    loadData().then(() => { dataLoadedRef.current = true; });
  }, []);

  // Save to both localStorage and server (only after initial load completes)
  useEffect(() => {
    if (!dataLoadedRef.current) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings)); } catch { /* ignore */ }
    if (holdings.length > 0) saveToServer("holdings", holdings);
  }, [holdings]);
  useEffect(() => {
    if (!dataLoadedRef.current) return;
    try { localStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(manualAssets)); } catch { /* ignore */ }
    if (manualAssets.length > 0) saveToServer("manual-assets", manualAssets);
  }, [manualAssets]);
  useEffect(() => {
    if (!dataLoadedRef.current) return;
    try { localStorage.setItem(DIVIDENDS_KEY, JSON.stringify(dividends)); } catch { /* ignore */ }
    if (dividends.length > 0) saveToServer("dividends", dividends);
  }, [dividends]);
  useEffect(() => {
    if (!dataLoadedRef.current) return;
    try { localStorage.setItem(SUMMARY_KEY, JSON.stringify(summary)); } catch { /* ignore */ }
    if (summary.length > 0) saveToServer("summary", summary);
  }, [summary]);
  useEffect(() => {
    if (!dataLoadedRef.current) return;
    try { localStorage.setItem(TIMELINE_KEY, JSON.stringify(timeline)); } catch { /* ignore */ }
    if (timeline.length > 0) saveToServer("timeline", timeline);
  }, [timeline]);

  // CSV upload handler - supports holdings, distributions, summary, timeline
  const handleCSVUpload = async (file: File) => {
    setLoading(true);
    setStatusMsg("CSVを解析中...");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("source", csvSource);

    try {
      const res = await fetch("/api/csv-upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) {
        setStatusMsg(`エラー: ${data.error}`);
      } else if (data.type === "distribution") {
        setDividends(data.dividends);
        setStatusMsg(`✅ 配当金履歴 ${data.count}件を取り込みました`);
        setActiveTab("dividends");
      } else if (data.type === "summary") {
        setSummary(data.summary);
        setStatusMsg(`✅ トータルリターンサマリー ${data.count}件を取り込みました`);
      } else if (data.type === "timeline") {
        setTimeline(data.timeline);
        setStatusMsg(`✅ 資産推移 ${data.count}件を取り込みました`);
        setActiveTab("timeline");
      } else {
        // holdings
        const sourceLabel = csvSource === "sbi" ? "sbi-csv" : csvSource === "moneyforward" ? "mf-csv" : "csv";
        const newHoldings = (data.holdings || []).map((h: Holding) => ({ ...h, source: sourceLabel }));
        const otherHoldings = holdings.filter((h) => h.source !== sourceLabel);
        setHoldings([...otherHoldings, ...newHoldings]);
        setStatusMsg(`✅ ${data.count}件を取り込みました`);
      }
    } catch {
      setStatusMsg("CSV解析に失敗しました");
    }
    setLoading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.name.endsWith(".txt"))) {
      handleCSVUpload(file);
    } else {
      setStatusMsg("CSVファイルをドロップしてください");
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCSVUpload(file);
  };

  const addManualAsset = () => {
    if (!manualName || !manualAmount) return;
    setManualAssets([
      ...manualAssets,
      { name: manualName, category: manualCategory, amount: parseFloat(manualAmount), currency: manualCurrency, note: manualNote },
    ]);
    setManualName("");
    setManualAmount("");
    setManualNote("");
  };

  const removeManualAsset = (index: number) => setManualAssets(manualAssets.filter((_, i) => i !== index));
  const removeHolding = (index: number) => setHoldings(holdings.filter((_, i) => i !== index));

  const holdingsTotal = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  const manualTotal = manualAssets.reduce((sum, a) => sum + a.amount, 0);
  const grandTotal = holdingsTotal + manualTotal;
  const totalPnl = holdings.reduce((sum, h) => sum + h.pnl, 0);

  const categoryTotals: Record<string, number> = {};
  holdings.forEach((h) => { categoryTotals[h.category] = (categoryTotals[h.category] || 0) + h.marketValue; });
  manualAssets.forEach((a) => { categoryTotals[a.category] = (categoryTotals[a.category] || 0) + a.amount; });

  // Dividend summary
  const dividendTotal = useMemo(() => dividends.reduce((s, d) => s + d.amount, 0), [dividends]);
  const dividendByYear = useMemo(() => {
    const byYear: Record<string, number> = {};
    dividends.forEach((d) => {
      const year = d.date.substring(0, 4);
      byYear[year] = (byYear[year] || 0) + d.amount;
    });
    return Object.entries(byYear).sort((a, b) => b[0].localeCompare(a[0]));
  }, [dividends]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">資産管理</h1>

      {statusMsg && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 mb-4 text-sm text-zinc-300 flex justify-between">
          <span>{statusMsg}</span>
          <button onClick={() => setStatusMsg("")} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto">
        {[
          { key: "overview", label: "資産全体" },
          { key: "upload", label: "CSV取り込み" },
          { key: "paste", label: "テキスト貼付" },
          { key: "dividends", label: `配当金${dividends.length > 0 ? ` (${dividends.length})` : ""}` },
          { key: "timeline", label: `資産推移${timeline.length > 0 ? ` (${timeline.length})` : ""}` },
          { key: "manual", label: "手動入力" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as TabKey)}
            className={clsx(
              "px-3 py-1.5 rounded text-sm whitespace-nowrap",
              activeTab === tab.key ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== OVERVIEW ===== */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="border border-zinc-800 rounded-lg p-4">
              <div className="text-xs text-zinc-500">総資産</div>
              <div className="text-xl font-bold mt-1">¥{grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
            <div className={clsx("border rounded-lg p-4", totalPnl >= 0 ? "border-green-800" : "border-red-800")}>
              <div className="text-xs text-zinc-500">含み損益（証券）</div>
              <div className={clsx("text-xl font-bold mt-1", totalPnl >= 0 ? "text-green-400" : "text-red-400")}>
                {totalPnl >= 0 ? "+" : ""}¥{totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            {summary.length > 0 && (
              <div className={clsx("border rounded-lg p-4", (summary[0]?.totalReturn || 0) >= 0 ? "border-green-800" : "border-red-800")}>
                <div className="text-xs text-zinc-500">トータルリターン</div>
                <div className={clsx("text-xl font-bold mt-1", (summary[0]?.totalReturn || 0) >= 0 ? "text-green-400" : "text-red-400")}>
                  {(summary[0]?.totalReturn || 0) >= 0 ? "+" : ""}¥{(summary[0]?.totalReturn || 0).toLocaleString()}
                  <span className="text-sm ml-1">({(summary[0]?.totalReturnPct || 0) >= 0 ? "+" : ""}{(summary[0]?.totalReturnPct || 0).toFixed(2)}%)</span>
                </div>
              </div>
            )}
            {dividends.length > 0 && (
              <div className="border border-yellow-800 rounded-lg p-4">
                <div className="text-xs text-zinc-500">累計配当金</div>
                <div className="text-xl font-bold mt-1 text-yellow-400">¥{Math.round(dividendTotal).toLocaleString()}</div>
              </div>
            )}
            <div className="border border-zinc-800 rounded-lg p-4">
              <div className="text-xs text-zinc-500">データ件数</div>
              <div className="text-lg font-bold mt-1">
                {holdings.length + manualAssets.length}<span className="text-sm text-zinc-500 ml-1">件</span>
              </div>
            </div>
          </div>

          {/* Summary by account */}
          {summary.length > 1 && (
            <div className="border border-zinc-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">口座別トータルリターン</h3>
              <div className="grid gap-2">
                {summary.filter(s => s.account !== "累計").map((s) => (
                  <div key={s.account} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300">{s.account}</span>
                    <div className="flex gap-4 font-mono">
                      <span className="text-zinc-400">評価: ¥{s.marketValue.toLocaleString()}</span>
                      <span className="text-zinc-400">買付: ¥{s.totalBought.toLocaleString()}</span>
                      <span className={s.totalReturn >= 0 ? "text-green-400" : "text-red-400"}>
                        {s.totalReturn >= 0 ? "+" : ""}¥{s.totalReturn.toLocaleString()} ({s.totalReturnPct >= 0 ? "+" : ""}{s.totalReturnPct.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(categoryTotals).length > 0 && (
            <div className="border border-zinc-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">資産配分</h3>
              <div className="space-y-2">
                {Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([cat, total]) => {
                  const pct = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <span className="text-sm w-32 text-zinc-400 truncate">{cat}</span>
                      <div className="flex-1 h-4 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-mono w-28 text-right">¥{total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      <span className="text-xs text-zinc-500 w-14 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {holdings.length > 0 && (
            <div className="overflow-x-auto">
              <h3 className="text-sm font-semibold text-zinc-400 mb-2">保有証券</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="text-left py-2 px-2">売買</th>
                    <th className="text-left py-2 px-2">ソース</th>
                    <th className="text-left py-2 px-2">コード</th>
                    <th className="text-left py-2 px-2">銘柄名</th>
                    <th className="text-right py-2 px-2">数量</th>
                    <th className="text-right py-2 px-2">取得価格</th>
                    <th className="text-right py-2 px-2">現在値</th>
                    <th className="text-right py-2 px-2">評価額</th>
                    <th className="text-right py-2 px-2">損益</th>
                    <th className="text-center py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h, i) => {
                    const isShort = h.name.includes("売建") || h.category.includes("信用");
                    const isCreditBuy = h.category.includes("信用") && !h.name.includes("売建");
                    return (
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900">
                      <td className="py-2 px-2 text-center">
                        <span className={clsx(
                          "text-xs px-1.5 py-0.5 rounded font-bold",
                          isShort ? "bg-red-900/40 text-red-400" :
                          isCreditBuy ? "bg-orange-900/40 text-orange-400" :
                          "bg-green-900/30 text-green-400"
                        )}>
                          {isShort ? "売" : "買"}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs"><span className="bg-zinc-800 px-1.5 py-0.5 rounded">{h.source}</span></td>
                      <td className="py-2 px-2 font-mono text-blue-400"><a href={`/detail?ticker=${h.code}`}>{h.code}</a></td>
                      <td className="py-2 px-2">{h.name.replace(/【売建】/, "")}</td>
                      <td className="py-2 px-2 text-right font-mono">{h.quantity}</td>
                      <td className="py-2 px-2 text-right font-mono">{h.avgPrice > 0 ? h.avgPrice.toLocaleString() : "-"}</td>
                      <td className="py-2 px-2 text-right font-mono">{h.currentPrice.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right font-mono">{h.currency === "USD" ? "$" : "¥"}{h.marketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className={clsx("py-2 px-2 text-right font-mono", h.pnl >= 0 ? "text-green-400" : "text-red-400")}>
                        {h.pnl !== 0 ? `${h.pnl >= 0 ? "+" : ""}${h.pnl.toLocaleString()}` : "-"}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button onClick={() => removeHolding(i)} className="text-zinc-600 hover:text-red-400 text-xs">✕</button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {manualAssets.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-400 mb-2">手動追加資産</h3>
              <div className="grid gap-2">
                {manualAssets.map((a, i) => (
                  <div key={i} className="flex items-center justify-between border border-zinc-800 rounded-lg p-3">
                    <div>
                      <span className="font-medium">{a.name}</span>
                      <span className="text-xs text-zinc-500 ml-2">{a.category}</span>
                      {a.note && <span className="text-xs text-zinc-600 ml-2">({a.note})</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold">{a.currency === "USD" ? "$" : "¥"}{a.amount.toLocaleString()}</span>
                      <button onClick={() => removeManualAsset(i)} className="text-zinc-600 hover:text-red-400 text-xs">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {holdings.length === 0 && manualAssets.length === 0 && (
            <div className="text-center text-zinc-500 mt-12">
              <p className="text-lg">資産データがありません</p>
              <p className="text-sm mt-2">「CSV取り込み」または「手動入力」タブからデータを追加してください</p>
            </div>
          )}
        </div>
      )}

      {/* ===== CSV UPLOAD ===== */}
      {activeTab === "upload" && (
        <div className="space-y-6">
          {/* Source selector */}
          <div className="flex gap-2 items-center">
            <span className="text-sm text-zinc-400">ソース:</span>
            {[
              { key: "sbi", label: "SBI証券" },
              { key: "moneyforward", label: "マネーフォワード" },
              { key: "other", label: "その他" },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setCsvSource(s.key)}
                className={clsx(
                  "px-3 py-1 rounded text-sm",
                  csvSource === s.key ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Step guide */}
          <div className="border border-zinc-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-zinc-400 mb-3">
              {csvSource === "sbi" ? "SBI証券 対応CSV" :
               csvSource === "moneyforward" ? "マネーフォワード 対応CSV" :
               "CSVファイルの準備"}
            </h3>
            {csvSource === "sbi" && (
              <div className="text-sm text-zinc-300 space-y-2">
                <p>以下のSBI証券CSVを自動判別して取り込みます：</p>
                <ul className="space-y-1 text-zinc-400">
                  <li>• <span className="text-white">ポートフォリオCSV</span> — 口座管理 → CSVダウンロード（保有銘柄）</li>
                  <li>• <span className="text-white">配当金・分配金CSV</span> — 口座管理 → 取引履歴 → 配当金 → CSVダウンロード</li>
                  <li>• <span className="text-white">トータルリターンCSV</span> — My資産 → サマリー → CSVダウンロード</li>
                </ul>
              </div>
            )}
            {csvSource === "moneyforward" && (
              <div className="text-sm text-zinc-300 space-y-2">
                <p>以下のマネーフォワードCSVに対応しています：</p>
                <ul className="space-y-1 text-zinc-400">
                  <li>• <span className="text-white">資産推移月次CSV</span> — 資産 → グラフ → CSVダウンロード</li>
                  <li>• <span className="text-white">家計簿CSV</span> — 家計簿 → データの出力</li>
                </ul>
              </div>
            )}
            {csvSource === "other" && (
              <div className="text-sm text-zinc-300">
                <p>銘柄コード、銘柄名、数量、価格、評価額のいずれかを含むCSVに対応</p>
              </div>
            )}
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={clsx(
              "border-2 border-dashed rounded-lg p-12 text-center transition-colors",
              dragOver ? "border-blue-500 bg-blue-950/20" : "border-zinc-700"
            )}
          >
            {loading ? (
              <p className="text-zinc-400 animate-pulse">解析中...</p>
            ) : (
              <>
                <p className="text-lg mb-2">CSVファイルをドラッグ＆ドロップ</p>
                <p className="text-sm text-zinc-500 mb-4">またはファイルを選択（複数可）</p>
                <label className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium cursor-pointer">
                  ファイルを選択
                  <input type="file" accept=".csv,.txt" onChange={handleFileInput} className="hidden" />
                </label>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== PASTE IMPORT ===== */}
      {activeTab === "paste" && (
        <div className="space-y-6">
          <div className="border border-zinc-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-zinc-400 mb-3">テキスト貼り付けで取り込み</h3>
            <p className="text-sm text-zinc-300 mb-2">
              SBI証券の画面からテキストをコピー＆ペーストして取り込めます：
            </p>
            <ul className="text-sm text-zinc-400 space-y-1">
              <li>• <span className="text-white">外国株式</span> — ポートフォリオ画面のテキストをコピペ</li>
              <li>• <span className="text-white">SBIラップ</span> — ラップサマリー画面をコピペ</li>
              <li>• <span className="text-white">金・銀・プラチナ</span> — 口座状況画面をコピペ</li>
            </ul>
          </div>

          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"SBI証券の画面からテキストを貼り付けてください...\n\n例（外国株）:\nDHSウィズダムツリー米国株高配当ファンド\n現買 現売\n10\n82.48\n85.07\n+25.90\n\n例（ラップ）:\n資産残高 2,455,165円\nAI投資\n資産残高 1,164,161円"}
            rows={12}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono resize-y"
          />

          <div className="flex gap-3">
            <button
              onClick={async () => {
                if (!pasteText.trim()) { setStatusMsg("テキストを貼り付けてください"); return; }
                setLoading(true);
                setStatusMsg("テキストを解析中...");
                try {
                  const res = await fetch("/api/paste-import", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: pasteText }),
                  });
                  const data = await res.json();
                  if (data.error) {
                    setStatusMsg(`エラー: ${data.error}`);
                  } else if (data.count === 0) {
                    setStatusMsg("取り込み可能なデータが見つかりませんでした");
                  } else {
                    const sources = [...new Set(data.holdings.map((h: Holding) => h.source))];
                    const otherHoldings = holdings.filter((h) => !sources.includes(h.source));
                    setHoldings([...otherHoldings, ...data.holdings]);
                    setStatusMsg(`✅ ${data.count}件を取り込みました`);
                    setPasteText("");
                  }
                } catch { setStatusMsg("解析に失敗しました"); }
                setLoading(false);
              }}
              disabled={loading}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium"
            >
              {loading ? "解析中..." : "取り込み"}
            </button>
            <button onClick={() => setPasteText("")} className="px-4 py-2.5 text-zinc-400 hover:text-white text-sm">
              クリア
            </button>
          </div>
        </div>
      )}

      {/* ===== DIVIDENDS ===== */}
      {activeTab === "dividends" && (
        <div className="space-y-6">
          {dividends.length === 0 ? (
            <div className="text-center text-zinc-500 mt-12">
              <p className="text-lg">配当金データがありません</p>
              <p className="text-sm mt-2">「CSV取り込み」タブからSBI証券の配当金CSVを取り込んでください</p>
            </div>
          ) : (
            <>
              {/* Dividend summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="border border-yellow-800 rounded-lg p-4">
                  <div className="text-xs text-zinc-500">累計受取額</div>
                  <div className="text-xl font-bold mt-1 text-yellow-400">¥{Math.round(dividendTotal).toLocaleString()}</div>
                </div>
                <div className="border border-zinc-800 rounded-lg p-4">
                  <div className="text-xs text-zinc-500">配当回数</div>
                  <div className="text-xl font-bold mt-1">{dividends.length}<span className="text-sm text-zinc-500 ml-1">回</span></div>
                </div>
                <div className="border border-zinc-800 rounded-lg p-4">
                  <div className="text-xs text-zinc-500">月平均</div>
                  <div className="text-lg font-bold mt-1">
                    ¥{dividendByYear.length > 0
                      ? Math.round(dividendTotal / Math.max(1, dividendByYear.length * 12 / dividendByYear.length)).toLocaleString()
                      : "0"}
                  </div>
                </div>
                <div className="border border-zinc-800 rounded-lg p-4">
                  <div className="text-xs text-zinc-500">期間</div>
                  <div className="text-sm font-bold mt-2">
                    {dividends[dividends.length - 1]?.date} ~ {dividends[0]?.date}
                  </div>
                </div>
              </div>

              {/* Yearly breakdown */}
              <div className="border border-zinc-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-zinc-400 mb-3">年別配当金</h3>
                <div className="space-y-2">
                  {dividendByYear.map(([year, total]) => {
                    const maxYear = Math.max(...dividendByYear.map(([, t]) => t));
                    const pct = maxYear > 0 ? (total / maxYear) * 100 : 0;
                    return (
                      <div key={year} className="flex items-center gap-3">
                        <span className="text-sm w-12 font-mono text-zinc-400">{year}</span>
                        <div className="flex-1 h-5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-yellow-500/50 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-sm font-mono w-24 text-right text-yellow-400">¥{Math.round(total).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dividend by ticker */}
              <div className="border border-zinc-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-zinc-400 mb-3">銘柄別累計配当金（トップ15）</h3>
                <div className="space-y-1">
                  {(() => {
                    const byTicker: Record<string, { total: number; name: string }> = {};
                    dividends.forEach((d) => {
                      const key = d.ticker || d.name;
                      if (!byTicker[key]) byTicker[key] = { total: 0, name: d.name };
                      byTicker[key].total += d.amount;
                    });
                    const sorted = Object.entries(byTicker).sort((a, b) => b[1].total - a[1].total).slice(0, 15);
                    const maxVal = sorted[0]?.[1].total || 1;
                    return sorted.map(([key, { total, name }]) => (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-xs w-40 text-zinc-400 truncate" title={name}>{name.length > 20 ? name.substring(0, 20) + "..." : name}</span>
                        <div className="flex-1 h-4 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-yellow-500/40 rounded-full" style={{ width: `${(total / maxVal) * 100}%` }} />
                        </div>
                        <span className="text-xs font-mono w-20 text-right text-yellow-400">¥{Math.round(total).toLocaleString()}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Dividend history table */}
              <div className="overflow-x-auto">
                <h3 className="text-sm font-semibold text-zinc-400 mb-2">配当金履歴（直近50件）</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="text-left py-2 px-2">受渡日</th>
                      <th className="text-left py-2 px-2">口座</th>
                      <th className="text-left py-2 px-2">商品</th>
                      <th className="text-left py-2 px-2">銘柄名</th>
                      <th className="text-right py-2 px-2">数量</th>
                      <th className="text-right py-2 px-2">受取額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dividends.slice(0, 50).map((d, i) => (
                      <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900">
                        <td className="py-1.5 px-2 font-mono text-zinc-400">{d.date}</td>
                        <td className="py-1.5 px-2 text-xs">{d.account}</td>
                        <td className="py-1.5 px-2 text-xs">{d.product}</td>
                        <td className="py-1.5 px-2 text-xs truncate max-w-[200px]">{d.name}</td>
                        <td className="py-1.5 px-2 text-right font-mono">{d.quantity.toLocaleString()}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-yellow-400">¥{d.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dividends.length > 50 && (
                  <p className="text-xs text-zinc-500 mt-2 text-center">他 {dividends.length - 50}件</p>
                )}
              </div>

              <button
                onClick={() => { setDividends([]); setStatusMsg("配当金データをクリアしました"); }}
                className="text-xs text-zinc-600 hover:text-red-400"
              >
                配当金データをクリア
              </button>
            </>
          )}
        </div>
      )}

      {/* ===== TIMELINE ===== */}
      {activeTab === "timeline" && (
        <div className="space-y-6">
          {timeline.length === 0 ? (
            <div className="text-center text-zinc-500 mt-12">
              <p className="text-lg">資産推移データがありません</p>
              <p className="text-sm mt-2">「CSV取り込み」タブからマネーフォワードの資産推移CSVを取り込んでください</p>
            </div>
          ) : (
            <>
              {/* Current vs Start */}
              {(() => {
                const latest = timeline[timeline.length - 1];
                const first = timeline[0];
                const change = latest.total - first.total;
                const changePct = first.total > 0 ? (change / first.total) * 100 : 0;
                return (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="border border-zinc-800 rounded-lg p-4">
                      <div className="text-xs text-zinc-500">現在の総資産</div>
                      <div className="text-xl font-bold mt-1">¥{latest.total.toLocaleString()}</div>
                      <div className="text-xs text-zinc-500 mt-1">{latest.date}</div>
                    </div>
                    <div className="border border-zinc-800 rounded-lg p-4">
                      <div className="text-xs text-zinc-500">開始時</div>
                      <div className="text-xl font-bold mt-1">¥{first.total.toLocaleString()}</div>
                      <div className="text-xs text-zinc-500 mt-1">{first.date}</div>
                    </div>
                    <div className={clsx("border rounded-lg p-4", change >= 0 ? "border-green-800" : "border-red-800")}>
                      <div className="text-xs text-zinc-500">増減</div>
                      <div className={clsx("text-xl font-bold mt-1", change >= 0 ? "text-green-400" : "text-red-400")}>
                        {change >= 0 ? "+" : ""}¥{change.toLocaleString()}
                      </div>
                      <div className={clsx("text-xs mt-1", change >= 0 ? "text-green-500" : "text-red-500")}>
                        {changePct >= 0 ? "+" : ""}{changePct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Category breakdown cards */}
              {(() => {
                const latest = timeline[timeline.length - 1];
                const cats = ASSET_CATEGORIES.filter((c) => {
                  const v = Number(latest[c.key] || 0);
                  return v !== 0;
                });
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {cats.map((c) => {
                      const v = Number(latest[c.key] || 0);
                      const pct = latest.total > 0 ? (v / latest.total) * 100 : 0;
                      const isDebt = c.key === "debt";
                      return (
                        <div key={c.key} className="border border-zinc-800 rounded-lg p-3 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: c.color }} />
                          <div className="ml-2">
                            <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: c.color }} />
                              {c.label}
                            </div>
                            <div className={clsx("text-lg font-bold mt-1", isDebt ? "text-red-400" : "text-white")}>
                              {isDebt ? "-" : ""}¥{Math.abs(v).toLocaleString()}
                            </div>
                            <div className="text-xs text-zinc-500">{pct.toFixed(1)}%</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Donut chart + Stacked area chart */}
              <div className="grid md:grid-cols-[280px_1fr] gap-4">
                {/* Donut */}
                <div className="border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-400 mb-3">資産内訳</h3>
                  <DonutChart data={timeline[timeline.length - 1]} />
                </div>

                {/* Stacked area chart */}
                <div className="border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-400 mb-3">資産推移グラフ</h3>
                  <StackedAreaChart data={timeline} />
                </div>
              </div>

              {/* Breakdown chart */}
              <div className="border border-zinc-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-zinc-400 mb-3">資産内訳推移</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400">
                        <th className="text-left py-2 px-2">日付</th>
                        <th className="text-right py-2 px-2">合計</th>
                        <th className="text-right py-2 px-2"><span className="inline-block w-2 h-2 rounded-full mr-1" style={{backgroundColor:"#3b82f6"}} />預金・現金</th>
                        <th className="text-right py-2 px-2"><span className="inline-block w-2 h-2 rounded-full mr-1" style={{backgroundColor:"#22c55e"}} />株式(現物)</th>
                        <th className="text-right py-2 px-2"><span className="inline-block w-2 h-2 rounded-full mr-1" style={{backgroundColor:"#8b5cf6"}} />投資信託</th>
                        <th className="text-right py-2 px-2"><span className="inline-block w-2 h-2 rounded-full mr-1" style={{backgroundColor:"#f59e0b"}} />信用</th>
                        <th className="text-right py-2 px-2"><span className="inline-block w-2 h-2 rounded-full mr-1" style={{backgroundColor:"#06b6d4"}} />ポイント</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Show monthly data (last entry per month) */}
                      {(() => {
                        const monthly: TimelineRecord[] = [];
                        let lastMonth = "";
                        // timeline is sorted ascending, show most recent first
                        const reversed = [...timeline].reverse();
                        for (const t of reversed) {
                          const month = t.date.substring(0, 7);
                          if (month !== lastMonth) {
                            monthly.push(t);
                            lastMonth = month;
                          }
                        }
                        return monthly.slice(0, 24).map((t) => (
                          <tr key={t.date} className="border-b border-zinc-800/50 hover:bg-zinc-900">
                            <td className="py-1.5 px-2 font-mono text-zinc-400">{t.date}</td>
                            <td className="py-1.5 px-2 text-right font-mono font-bold">¥{t.total.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-zinc-400">¥{t.cash.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-blue-400">¥{t.stocks.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-green-400">¥{t.funds.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-zinc-500">¥{t.margin.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-zinc-500">¥{t.points.toLocaleString()}</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              <button
                onClick={() => { setTimeline([]); setStatusMsg("資産推移データをクリアしました"); }}
                className="text-xs text-zinc-600 hover:text-red-400"
              >
                資産推移データをクリア
              </button>
            </>
          )}
        </div>
      )}

      {/* ===== MANUAL ===== */}
      {activeTab === "manual" && (
        <div className="space-y-4">
          <div className="border border-zinc-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-zinc-400 mb-3">
              CSVに含まれない資産を手動で追加
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <input
                suppressHydrationWarning
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="資産名（例: 純金積立、VOO）"
                className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
              />
              <select
                value={manualCategory}
                onChange={(e) => setManualCategory(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
              >
                <option>米国株</option>
                <option>日本株</option>
                <option>投資信託</option>
                <option>金・貴金属</option>
                <option>仮想通貨</option>
                <option>債券</option>
                <option>不動産</option>
                <option>預金・現金</option>
                <option>保険</option>
                <option>年金</option>
                <option>FX</option>
                <option>その他</option>
              </select>
              <div className="flex gap-1">
                <input
                  suppressHydrationWarning
                  type="number"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  placeholder="金額"
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
                />
                <select
                  value={manualCurrency}
                  onChange={(e) => setManualCurrency(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 rounded px-2 py-2 text-sm w-16"
                >
                  <option>JPY</option>
                  <option>USD</option>
                  <option>EUR</option>
                </select>
              </div>
              <input
                suppressHydrationWarning
                type="text"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="メモ（任意）"
                className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
              />
              <button
                onClick={addManualAsset}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-medium"
              >
                追加
              </button>
            </div>
          </div>

          {manualAssets.length > 0 && (
            <div className="space-y-2">
              {manualAssets.map((a, i) => (
                <div key={i} className="flex items-center justify-between border border-zinc-800 rounded-lg p-3">
                  <div>
                    <span className="font-medium">{a.name}</span>
                    <span className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded ml-2">{a.category}</span>
                    {a.note && <span className="text-xs text-zinc-600 ml-2">{a.note}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold">{a.currency === "USD" ? "$" : a.currency === "EUR" ? "€" : "¥"}{a.amount.toLocaleString()}</span>
                    <button onClick={() => removeManualAsset(i)} className="text-zinc-600 hover:text-red-400 text-xs">削除</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {manualAssets.length === 0 && (
            <div className="text-center text-zinc-500 mt-8">
              <p>上のフォームから資産を追加してください</p>
              <p className="text-xs mt-1">データはブラウザに保存されます</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Stacked area chart — color-coded by asset category
function StackedAreaChart({ data }: { data: TimelineRecord[] }) {
  const width = 800;
  const height = 300;
  const pad = { top: 20, right: 20, bottom: 40, left: 80 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  // Categories to stack (bottom to top), excluding debt
  const stackKeys = ASSET_CATEGORIES.filter((c) => c.key !== "debt");

  // Compute stacked values per data point
  const stacked = data.map((d) => {
    let cumulative = 0;
    const layers: { key: string; y0: number; y1: number; color: string }[] = [];
    for (const cat of stackKeys) {
      const v = Number(d[cat.key] || 0);
      if (v > 0) {
        layers.push({ key: cat.key as string, y0: cumulative, y1: cumulative + v, color: cat.color });
        cumulative += v;
      }
    }
    return { date: d.date, total: cumulative, layers };
  });

  const maxVal = Math.max(...stacked.map((s) => s.total)) * 1.05;
  const xScale = (i: number) => pad.left + (i / Math.max(data.length - 1, 1)) * chartW;
  const yScale = (v: number) => pad.top + chartH - (v / maxVal) * chartH;

  const yTicks = Array.from({ length: 5 }, (_, i) => (maxVal * (i + 1)) / 5);
  const xStep = Math.max(1, Math.floor(data.length / 6));

  // Build area paths per category (bottom-up)
  const catKeys = stackKeys.map((c) => c.key as string);
  const areaPaths: { key: string; color: string; d: string }[] = [];

  for (const cat of stackKeys) {
    const k = cat.key as string;
    const top: string[] = [];
    const bottom: string[] = [];

    for (let i = 0; i < stacked.length; i++) {
      const layer = stacked[i].layers.find((l) => l.key === k);
      if (layer) {
        top.push(`${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(layer.y1).toFixed(1)}`);
        bottom.unshift(`L ${xScale(i).toFixed(1)} ${yScale(layer.y0).toFixed(1)}`);
      } else {
        // Find cumulative up to this category
        let cum = 0;
        for (const ck of catKeys) {
          if (ck === k) break;
          cum += Number(data[i][ck as keyof TimelineRecord] || 0);
        }
        top.push(`${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(cum).toFixed(1)}`);
        bottom.unshift(`L ${xScale(i).toFixed(1)} ${yScale(cum).toFixed(1)}`);
      }
    }

    areaPaths.push({ key: k, color: cat.color, d: top.join(" ") + " " + bottom.join(" ") + " Z" });
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" style={{ maxHeight: 300 }}>
      {/* Grid */}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={pad.left} y1={yScale(v)} x2={width - pad.right} y2={yScale(v)} stroke="#333" strokeDasharray="4" />
          <text x={pad.left - 8} y={yScale(v) + 4} textAnchor="end" fill="#888" fontSize="10">
            ¥{(v / 10000).toFixed(0)}万
          </text>
        </g>
      ))}
      {/* Baseline */}
      <line x1={pad.left} y1={yScale(0)} x2={width - pad.right} y2={yScale(0)} stroke="#555" />

      {/* X labels */}
      {data.filter((_, i) => i % xStep === 0).map((d, idx) => (
        <text key={d.date} x={xScale(idx * xStep)} y={height - 8} textAnchor="middle" fill="#888" fontSize="9">
          {d.date.substring(0, 7)}
        </text>
      ))}

      {/* Stacked areas */}
      {areaPaths.map((ap) => (
        <path key={ap.key} d={ap.d} fill={ap.color} opacity={0.6} />
      ))}

      {/* Total line on top */}
      <path
        d={stacked.map((s, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(s.total).toFixed(1)}`).join(" ")}
        fill="none"
        stroke="#fff"
        strokeWidth="1.5"
        opacity={0.5}
      />
    </svg>
  );
}

// Donut chart for current asset breakdown
function DonutChart({ data }: { data: TimelineRecord }) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 90;
  const innerR = 55;

  const slices = ASSET_CATEGORIES
    .map((c) => ({ ...c, value: Math.abs(Number(data[c.key] || 0)) }))
    .filter((s) => s.value > 0);

  const total = slices.reduce((s, v) => s + v.value, 0);
  let cumAngle = -Math.PI / 2;

  const arcs = slices.map((s) => {
    const angle = (s.value / total) * Math.PI * 2;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;

    const x1o = cx + outerR * Math.cos(startAngle);
    const y1o = cy + outerR * Math.sin(startAngle);
    const x2o = cx + outerR * Math.cos(endAngle);
    const y2o = cy + outerR * Math.sin(endAngle);
    const x1i = cx + innerR * Math.cos(endAngle);
    const y1i = cy + innerR * Math.sin(endAngle);
    const x2i = cx + innerR * Math.cos(startAngle);
    const y2i = cy + innerR * Math.sin(startAngle);

    const largeArc = angle > Math.PI ? 1 : 0;
    const d = [
      `M ${x1o} ${y1o}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o}`,
      `L ${x1i} ${y1i}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2i} ${y2i}`,
      "Z",
    ].join(" ");

    return { ...s, d, pct: ((s.value / total) * 100).toFixed(1) };
  });

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full" style={{ maxWidth: 200 }}>
        {arcs.map((a) => (
          <path key={a.key as string} d={a.d} fill={a.color} stroke="#09090b" strokeWidth="1.5" />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#fff" fontSize="14" fontWeight="bold">
          ¥{(data.total / 10000).toFixed(0)}万
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#888" fontSize="9">
          総資産
        </text>
      </svg>
      <div className="space-y-1 w-full text-xs">
        {arcs.map((a) => (
          <div key={a.key as string} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
              <span className="text-zinc-400 truncate">{a.label}</span>
            </div>
            <span className="text-zinc-500 font-mono">{a.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
