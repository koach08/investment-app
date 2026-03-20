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

interface MFSyncData {
  totalAssets: number;
  totalLiabilities: number;
  netAssets: number;
  breakdown: { name: string; amount: number; pct: number }[];
  performance: {
    dayChange: number;
    dayChangePct: number;
    weekChange: number;
    weekChangePct: number;
    monthChange: number;
    monthChangePct: number;
    yearChange: number;
    yearChangePct: number;
  };
  fetchedAt: string;
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

type TabKey = "overview" | "sync" | "upload" | "paste" | "dividends" | "timeline" | "manual";

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

  // Sync state
  const [syncingSBI, setSyncingSBI] = useState(false);
  const [syncingMF, setSyncingMF] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Price refresh state
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [lastPriceRefresh, setLastPriceRefresh] = useState<string | null>(null);

  // Metals price state
  const [metalsData, setMetalsData] = useState<{
    metals: { key: string; nameJa: string; priceJpyPerGram: number | null; priceUsd: number | null }[];
    usdjpy: number;
    fetchedAt: string;
  } | null>(null);

  // MoneyForward data (performance + breakdown)
  const [mfData, setMfData] = useState<MFSyncData | null>(null);

  // Quick snapshot state
  const [snapTotal, setSnapTotal] = useState("");
  const [snapCash, setSnapCash] = useState("");
  const [snapStocks, setSnapStocks] = useState("");
  const [snapFunds, setSnapFunds] = useState("");
  const [snapMargin, setSnapMargin] = useState("");
  const [snapPoints, setSnapPoints] = useState("");
  const [snapDebt, setSnapDebt] = useState("");

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
    loadData().then(() => {
      dataLoadedRef.current = true;
      // Auto-sync from MoneyForward if last sync > 1 hour ago or never synced
      if (!autoSyncTriggeredRef.current) {
        autoSyncTriggeredRef.current = true;
        const lastSync = localStorage.getItem("investment-app-last-sync");
        const oneHourMs = 60 * 60 * 1000;
        if (!lastSync || Date.now() - new Date(lastSync).getTime() > oneHourMs) {
          syncFromMF();
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Load last sync time, MF data, and metals data
  useEffect(() => {
    try {
      const saved = localStorage.getItem("investment-app-last-sync");
      if (saved) setLastSyncTime(saved);
    } catch { /* ignore */ }
    try {
      const savedMf = localStorage.getItem("investment-app-mf-data");
      if (savedMf) setMfData(JSON.parse(savedMf));
    } catch { /* ignore */ }
    try {
      const savedMetals = localStorage.getItem("investment-app-metals-data");
      if (savedMetals) setMetalsData(JSON.parse(savedMetals));
    } catch { /* ignore */ }
    // Fetch fresh metals prices on mount
    fetchMetalsPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync from SBI
  const syncFromSBI = async () => {
    setSyncingSBI(true);
    setStatusMsg("SBI証券から保有銘柄を取得中...");
    try {
      const res = await fetch("/api/sbi-portfolio", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setStatusMsg(`SBI証券エラー: ${data.error}`);
      } else if (data.holdings && data.holdings.length > 0) {
        const mapped: Holding[] = data.holdings.map((h: { category: string; code: string; name: string; quantity: number; avgPrice: number; currentPrice: number; marketValue: number; pnl: number; pnlPercent: number; currency?: string }) => ({
          source: "sbi-auto",
          code: h.code,
          name: h.name,
          quantity: h.quantity,
          avgPrice: h.avgPrice,
          currentPrice: h.currentPrice,
          marketValue: h.marketValue,
          pnl: h.pnl,
          pnlPercent: h.pnlPercent,
          category: h.category === "domestic" ? "国内株式" : h.category === "us" ? "米国株式" : "投資信託",
          currency: h.currency || "JPY",
        }));
        // Merge: replace SBI holdings, keep non-SBI holdings
        setHoldings((prev) => {
          const nonSBI = prev.filter((h) => h.source !== "sbi-auto" && h.source !== "sbi-csv");
          return [...nonSBI, ...mapped];
        });
        const now = new Date().toISOString();
        setLastSyncTime(now);
        localStorage.setItem("investment-app-last-sync", now);
        setStatusMsg(`SBI証券: ${mapped.length}銘柄を取得しました（${data.totalAssets?.toLocaleString() || ""}円）`);
      } else {
        setStatusMsg("SBI証券: 保有銘柄が見つかりませんでした");
      }
    } catch {
      setStatusMsg("SBI証券との通信に失敗しました");
    }
    setSyncingSBI(false);
  };

  // Sync from MoneyForward
  const syncFromMF = async () => {
    setSyncingMF(true);
    setStatusMsg("マネーフォワードから資産情報を取得中...");
    try {
      const res = await fetch("/api/moneyforward", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setStatusMsg(`マネーフォワードエラー: ${data.error}`);
      } else if (data.assets && data.assets.length > 0) {
        const mapped: Holding[] = data.assets
          .filter((a: { amount: number }) => a.amount > 0)
          .map((a: { category: string; name: string; amount: number; currency: string }) => ({
            source: "mf-auto",
            code: "",
            name: a.name,
            quantity: 1,
            avgPrice: 0,
            currentPrice: a.amount,
            marketValue: a.amount,
            pnl: 0,
            pnlPercent: 0,
            category: a.category,
            currency: a.currency || "JPY",
          }));
        // Merge: replace MF holdings, keep non-MF holdings
        setHoldings((prev) => {
          const nonMF = prev.filter((h) => h.source !== "mf-auto" && h.source !== "mf-csv");
          return [...nonMF, ...mapped];
        });

        // Add today's entry to timeline using MF's own breakdown (from pie chart data)
        if (data.totalAssets) {
          const today = new Date().toISOString().substring(0, 10);
          let cash = 0, stocks = 0, margin = 0, funds = 0, points = 0, other = 0;
          const debt = data.totalLiabilities || 0;

          // Use MF's breakdown (pie chart) - most accurate
          if (data.breakdown && data.breakdown.length > 0) {
            for (const b of data.breakdown) {
              const n = (b.name || "").toLowerCase();
              if (n.includes("預金") || n.includes("現金") || n.includes("暗号")) {
                cash += b.amount;
              } else if (n.includes("信用")) {
                margin += b.amount;
              } else if (n.includes("投資信託") || n.includes("投信")) {
                funds += b.amount;
              } else if (n.includes("ポイント")) {
                points += b.amount;
              } else if (n.includes("株式") && !n.includes("信用")) {
                stocks += b.amount;
              } else {
                other += b.amount;
              }
            }
          }

          const total = data.totalAssets;
          const todayRecord: TimelineRecord = { date: today, total, cash, stocks, margin, funds, points, other, debt };

          setTimeline((prev) => {
            const filtered = prev.filter((t) => t.date !== today);
            return [...filtered, todayRecord].sort((a, b) => a.date.localeCompare(b.date));
          });
        }

        // Save MF performance & breakdown data
        const mfSyncData: MFSyncData = {
          totalAssets: data.totalAssets,
          totalLiabilities: data.totalLiabilities || 0,
          netAssets: data.netAssets || data.totalAssets,
          breakdown: data.breakdown || [],
          performance: data.performance || {
            dayChange: 0, dayChangePct: 0,
            weekChange: 0, weekChangePct: 0,
            monthChange: 0, monthChangePct: 0,
            yearChange: 0, yearChangePct: 0,
          },
          fetchedAt: data.fetchedAt || new Date().toISOString(),
        };
        setMfData(mfSyncData);
        try { localStorage.setItem("investment-app-mf-data", JSON.stringify(mfSyncData)); } catch { /* ignore */ }

        const now = new Date().toISOString();
        setLastSyncTime(now);
        localStorage.setItem("investment-app-last-sync", now);
        setStatusMsg(`マネーフォワード: 総資産 ¥${data.totalAssets?.toLocaleString() || "?"} を取得しました`);
      } else {
        setStatusMsg("マネーフォワード: 資産情報が見つかりませんでした");
      }
    } catch {
      setStatusMsg("マネーフォワードとの通信に失敗しました");
    }
    setSyncingMF(false);
  };

  // Sync both
  const syncAll = async () => {
    setStatusMsg("SBI証券 + マネーフォワードから同時取得中...");
    await Promise.all([syncFromSBI(), syncFromMF()]);
    setStatusMsg("同期完了");
  };

  // Refresh current prices for all holdings with ticker codes
  // Fetch metals spot prices
  const fetchMetalsPrices = async () => {
    try {
      const res = await fetch("/api/metals-price");
      const data = await res.json();
      if (!data.error) {
        setMetalsData(data);
        localStorage.setItem("investment-app-metals-data", JSON.stringify(data));
      }
      return data;
    } catch { return null; }
  };

  const refreshPrices = async () => {
    const tickerHoldings = holdings.filter((h) => h.code && h.code.length > 0);
    const hasMetals = holdings.some((h) => h.source === "sbi-metals" || h.category === "金・貴金属");

    if (tickerHoldings.length === 0 && !hasMetals) {
      setStatusMsg("価格更新対象の銘柄がありません");
      return;
    }

    setRefreshingPrices(true);
    setStatusMsg(`価格を更新中...`);

    let updatedCount = 0;
    const updatedHoldings = [...holdings];

    // Fetch metals prices in parallel with stock prices
    const metalsPromise = hasMetals ? fetchMetalsPrices() : Promise.resolve(null);

    // Batch fetch stock prices in groups of 4
    for (let i = 0; i < tickerHoldings.length; i += 4) {
      const batch = tickerHoldings.slice(i, i + 4);
      const results = await Promise.all(
        batch.map(async (h) => {
          try {
            const res = await fetch(`/api/market?ticker=${encodeURIComponent(h.code)}&period=1mo`);
            const data = await res.json();
            if (data.prices && data.prices.length > 0) {
              const latestPrice = data.prices[data.prices.length - 1].close;
              return { code: h.code, price: latestPrice };
            }
          } catch { /* skip */ }
          return null;
        })
      );

      for (const result of results) {
        if (result) {
          const idx = updatedHoldings.findIndex((h) => h.code === result.code);
          if (idx !== -1) {
            const h = updatedHoldings[idx];
            const newMarketValue = result.price * h.quantity;
            const newPnl = (result.price - h.avgPrice) * h.quantity;
            const newPnlPercent = h.avgPrice > 0 ? ((result.price - h.avgPrice) / h.avgPrice) * 100 : 0;
            updatedHoldings[idx] = {
              ...h,
              currentPrice: result.price,
              marketValue: newMarketValue,
              pnl: newPnl,
              pnlPercent: newPnlPercent,
            };
            updatedCount++;
          }
        }
      }
    }

    // Also fetch metals spot prices (even if no metals holdings, for display)
    await metalsPromise;

    setHoldings(updatedHoldings);
    const now = new Date().toISOString();
    setLastPriceRefresh(now);
    localStorage.setItem("investment-app-last-price-refresh", now);
    const parts = [];
    if (tickerHoldings.length > 0) parts.push(`${updatedCount}/${tickerHoldings.length}銘柄`);
    if (hasMetals) parts.push("貴金属スポット価格");
    setStatusMsg(`${parts.join(" + ")} を更新しました`);
    setRefreshingPrices(false);
  };

  // Auto-refresh prices on mount (if holdings exist and last refresh was > 1 hour ago)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("investment-app-last-price-refresh");
      if (saved) setLastPriceRefresh(saved);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!dataLoadedRef.current || holdings.length === 0) return;
    const tickerHoldings = holdings.filter((h) => h.code && h.code.length > 0);
    if (tickerHoldings.length === 0) return;

    const lastRefresh = localStorage.getItem("investment-app-last-price-refresh");
    const oneHourMs = 60 * 60 * 1000;
    if (!lastRefresh || Date.now() - new Date(lastRefresh).getTime() > oneHourMs) {
      refreshPrices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.length]);

  // Auto-sync from MoneyForward on page load (if last sync > 1 hour ago or never synced)
  const autoSyncTriggeredRef = useRef(false);

  // Build today's snapshot from current holdings and inject into timeline
  // Timeline is shown as-is.
  const timelineWithToday = timeline;

  // Add a snapshot to timeline
  const addSnapshot = () => {
    const totalVal = parseFloat(snapTotal.replace(/[,、]/g, ""));
    if (!totalVal || isNaN(totalVal)) {
      setStatusMsg("総資産額を入力してください");
      return;
    }
    const today = new Date().toISOString().substring(0, 10);
    const parseSnap = (s: string) => parseFloat(s.replace(/[,、]/g, "")) || 0;

    const cashVal = parseSnap(snapCash);
    const stocksVal = parseSnap(snapStocks);
    const fundsVal = parseSnap(snapFunds);
    const marginVal = parseSnap(snapMargin);
    const pointsVal = parseSnap(snapPoints);
    const debtVal = parseSnap(snapDebt);
    const otherVal = totalVal - cashVal - stocksVal - fundsVal - marginVal - pointsVal + debtVal;

    const record: TimelineRecord = {
      date: today,
      total: totalVal,
      cash: cashVal,
      stocks: stocksVal,
      funds: fundsVal,
      margin: marginVal,
      points: pointsVal,
      other: otherVal > 0 ? otherVal : 0,
      debt: debtVal,
    };

    setTimeline((prev) => {
      const filtered = prev.filter((t) => t.date !== today);
      return [...filtered, record].sort((a, b) => a.date.localeCompare(b.date));
    });

    setStatusMsg(`${today} のデータを追加しました（総資産: ¥${totalVal.toLocaleString()}）`);
    setSnapTotal("");
    setSnapCash("");
    setSnapStocks("");
    setSnapFunds("");
    setSnapMargin("");
    setSnapPoints("");
    setSnapDebt("");
  };

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
  const securitiesTotal = holdingsTotal + manualTotal;
  const totalPnl = holdings.reduce((sum, h) => sum + h.pnl, 0);

  // Use MF data as primary source, then timeline, then securities-only
  const latestTimeline = timelineWithToday.length > 0 ? timelineWithToday[timelineWithToday.length - 1] : null;
  const grandTotal = mfData ? mfData.totalAssets : latestTimeline ? latestTimeline.total : securitiesTotal;

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
          { key: "sync", label: "自動連携" },
          { key: "upload", label: "CSV取り込み" },
          { key: "paste", label: "テキスト貼付" },
          { key: "dividends", label: `配当金${dividends.length > 0 ? ` (${dividends.length})` : ""}` },
          { key: "timeline", label: `資産推移${timelineWithToday.length > 0 ? ` (${timelineWithToday.length})` : ""}` },
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
          {/* Sync status bar */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-zinc-500">
              {syncingMF ? (
                <span className="text-yellow-400 flex items-center gap-1.5">
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-yellow-500/30 border-t-yellow-400 rounded-full" />
                  マネーフォワードから取得中...
                </span>
              ) : lastSyncTime ? (
                `最終同期: ${new Date(lastSyncTime).toLocaleString("ja-JP")}`
              ) : "未同期"}
              {!syncingMF && lastPriceRefresh && (
                <span className="ml-3">| 価格更新: {new Date(lastPriceRefresh).toLocaleString("ja-JP")}</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={syncFromMF}
                disabled={syncingMF}
                className="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                {syncingMF ? "取得中..." : "MF同期"}
              </button>
              <button
                onClick={refreshPrices}
              disabled={refreshingPrices}
              className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              {refreshingPrices ? (
                <>
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-zinc-500 border-t-white rounded-full" />
                  更新中...
                </>
              ) : "価格を更新"}
              </button>
            </div>
          </div>

          {/* Total assets + day change */}
          <div className="border border-zinc-800 rounded-lg p-5">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <div>
                <div className="text-xs text-zinc-500 mb-1">総資産{mfData && <span className="text-emerald-500 ml-1">(MF連携)</span>}</div>
                <div className="text-3xl font-bold">¥{grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
              {mfData && mfData.performance.dayChange !== 0 && (
                <div className="text-right">
                  <div className="text-xs text-zinc-500 mb-1">前日比</div>
                  <div className={clsx("text-xl font-bold", mfData.performance.dayChange >= 0 ? "text-green-400" : "text-red-400")}>
                    {mfData.performance.dayChange >= 0 ? "+" : ""}¥{mfData.performance.dayChange.toLocaleString()}
                  </div>
                  <div className={clsx("text-sm", mfData.performance.dayChangePct >= 0 ? "text-green-500" : "text-red-500")}>
                    {mfData.performance.dayChangePct >= 0 ? "+" : ""}{mfData.performance.dayChangePct.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Performance period cards (from MF) */}
          {mfData && (mfData.performance.weekChange !== 0 || mfData.performance.monthChange !== 0 || mfData.performance.yearChange !== 0) && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "今週", amt: mfData.performance.weekChange, pct: mfData.performance.weekChangePct },
                { label: "今月", amt: mfData.performance.monthChange, pct: mfData.performance.monthChangePct },
                { label: "今年", amt: mfData.performance.yearChange, pct: mfData.performance.yearChangePct },
              ].map((p) => (
                <div key={p.label} className={clsx("border rounded-lg p-3", p.amt >= 0 ? "border-green-800/50" : "border-red-800/50")}>
                  <div className="text-xs text-zinc-500">{p.label}</div>
                  <div className={clsx("text-lg font-bold mt-1", p.amt >= 0 ? "text-green-400" : "text-red-400")}>
                    {p.pct >= 0 ? "+" : ""}{p.pct.toFixed(1)}%
                  </div>
                  <div className={clsx("text-xs", p.amt >= 0 ? "text-green-600" : "text-red-600")}>
                    {p.amt >= 0 ? "+" : ""}¥{p.amt.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* MF breakdown (pie chart categories) */}
          {mfData && mfData.breakdown.length > 0 && (
            <div className="border border-zinc-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">資産内訳（マネーフォワード）</h3>
              <div className="space-y-2">
                {mfData.breakdown.map((b) => {
                  const pct = mfData.totalAssets > 0 ? (b.amount / mfData.totalAssets) * 100 : 0;
                  return (
                    <div key={b.name} className="flex items-center gap-3">
                      <span className="text-sm w-44 text-zinc-400 truncate">{b.name}</span>
                      <div className="flex-1 h-4 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-mono w-28 text-right">¥{b.amount.toLocaleString()}</span>
                      <span className="text-xs text-zinc-500 w-14 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
              {mfData.totalLiabilities > 0 && (
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-zinc-800">
                  <span className="text-sm w-44 text-red-400">負債（カード等）</span>
                  <div className="flex-1" />
                  <span className="text-sm font-mono w-28 text-right text-red-400">-¥{mfData.totalLiabilities.toLocaleString()}</span>
                  <span className="text-xs text-zinc-500 w-14" />
                </div>
              )}
              <div className="text-xs text-zinc-600 mt-2">
                取得: {new Date(mfData.fetchedAt).toLocaleString("ja-JP")}
              </div>
            </div>
          )}

          {/* Precious metals spot prices */}
          {metalsData && metalsData.metals.length > 0 && (
            <div className="border border-yellow-800/40 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-yellow-400">貴金属スポット価格</h3>
                <span className="text-xs text-zinc-500">
                  {metalsData.fetchedAt ? new Date(metalsData.fetchedAt).toLocaleString("ja-JP") : ""}
                  {metalsData.usdjpy && <span className="ml-2">USD/JPY: {metalsData.usdjpy}</span>}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {metalsData.metals.map((m) => (
                  <div key={m.key} className="bg-zinc-900 rounded-lg p-3 text-center">
                    <div className="text-xs text-zinc-500 mb-1">{m.nameJa}</div>
                    {m.priceJpyPerGram !== null ? (
                      <>
                        <div className="text-lg font-bold text-yellow-300">¥{m.priceJpyPerGram.toLocaleString()}<span className="text-xs text-zinc-500">/g</span></div>
                        <div className="text-xs text-zinc-500 mt-0.5">${m.priceUsd?.toLocaleString()}/oz</div>
                      </>
                    ) : (
                      <div className="text-sm text-zinc-600">取得失敗</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Securities stats (from CSV data) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {holdings.length > 0 && (
              <div className={clsx("border rounded-lg p-4", totalPnl >= 0 ? "border-green-800" : "border-red-800")}>
                <div className="text-xs text-zinc-500">含み損益（証券）</div>
                <div className={clsx("text-xl font-bold mt-1", totalPnl >= 0 ? "text-green-400" : "text-red-400")}>
                  {totalPnl >= 0 ? "+" : ""}¥{totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            )}
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

      {/* ===== AUTO SYNC ===== */}
      {activeTab === "sync" && (
        <div className="space-y-6">
          <div className="border border-zinc-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-zinc-400 mb-2">自動連携について</h3>
            <p className="text-sm text-zinc-300 leading-relaxed">
              SBI証券・マネーフォワードのログイン情報が <code className="text-cyan-400">.env.local</code> に設定されていれば、
              ボタン1つで最新の保有銘柄・資産情報を自動取得します。
            </p>
            {lastSyncTime && (
              <p className="text-xs text-zinc-500 mt-2">
                最終同期: {new Date(lastSyncTime).toLocaleString("ja-JP")}
              </p>
            )}
          </div>

          {/* Sync all button */}
          <button
            onClick={syncAll}
            disabled={syncingSBI || syncingMF}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 rounded-lg text-sm font-bold transition-all"
          >
            {syncingSBI || syncingMF ? "同期中..." : "SBI + マネーフォワード 一括同期"}
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* SBI Card */}
            <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center text-xl">S</div>
                <div>
                  <h4 className="font-semibold">SBI証券</h4>
                  <p className="text-xs text-zinc-500">保有銘柄・残高を取得</p>
                </div>
              </div>
              <p className="text-xs text-zinc-400 mb-4">
                必要な環境変数: <code className="text-cyan-400">SBI_USER_ID</code>, <code className="text-cyan-400">SBI_PASSWORD</code>
              </p>
              <button
                onClick={syncFromSBI}
                disabled={syncingSBI}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {syncingSBI ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                    取得中...
                  </span>
                ) : "SBI証券から取得"}
              </button>
            </div>

            {/* MoneyForward Card */}
            <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center text-xl">M</div>
                <div>
                  <h4 className="font-semibold">マネーフォワード</h4>
                  <p className="text-xs text-zinc-500">資産全体を取得</p>
                </div>
              </div>
              <p className="text-xs text-zinc-400 mb-4">
                必要な環境変数: <code className="text-cyan-400">MF_EMAIL</code>, <code className="text-cyan-400">MF_PASSWORD</code>
              </p>
              <button
                onClick={syncFromMF}
                disabled={syncingMF}
                className="w-full py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {syncingMF ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                    取得中...
                  </span>
                ) : "マネーフォワードから取得"}
              </button>
            </div>
          </div>

          {/* Setup guide */}
          <div className="border border-zinc-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-zinc-400 mb-3">環境変数の設定方法</h3>
            <div className="bg-zinc-950 rounded p-3 font-mono text-xs text-zinc-300 leading-relaxed">
              <div className="text-zinc-500 mb-1"># .env.local に以下を追加</div>
              <div><span className="text-cyan-400">SBI_USER_ID</span>=あなたのSBIユーザーID</div>
              <div><span className="text-cyan-400">SBI_PASSWORD</span>=あなたのSBIパスワード</div>
              <div className="mt-2"><span className="text-cyan-400">MF_EMAIL</span>=マネフォのメールアドレス</div>
              <div><span className="text-cyan-400">MF_PASSWORD</span>=マネフォのパスワード</div>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              ※ 認証情報はサーバーサイドでのみ使用され、ブラウザには送信されません。Playwrightによるスクレイピングで取得します。
            </p>
          </div>
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
          {/* Quick snapshot form */}
          <div className="border border-purple-800/30 bg-purple-950/10 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-purple-400 mb-3">今日のデータを追加</h3>
            <p className="text-xs text-zinc-400 mb-3">マネーフォワードの画面から数字をコピペするだけ。総資産だけでもOK。</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <div>
                <label className="text-xs text-zinc-500">総資産（必須）</label>
                <input
                  type="text"
                  value={snapTotal}
                  onChange={(e) => setSnapTotal(e.target.value)}
                  placeholder="24,431,422"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500">預金・現金</label>
                <input
                  type="text"
                  value={snapCash}
                  onChange={(e) => setSnapCash(e.target.value)}
                  placeholder="6,369,294"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500">株式（現物）</label>
                <input
                  type="text"
                  value={snapStocks}
                  onChange={(e) => setSnapStocks(e.target.value)}
                  placeholder="6,763,745"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500">投資信託</label>
                <input
                  type="text"
                  value={snapFunds}
                  onChange={(e) => setSnapFunds(e.target.value)}
                  placeholder="10,018,128"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono focus:border-violet-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500">信用</label>
                <input
                  type="text"
                  value={snapMargin}
                  onChange={(e) => setSnapMargin(e.target.value)}
                  placeholder="18,976"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono focus:border-yellow-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500">ポイント</label>
                <input
                  type="text"
                  value={snapPoints}
                  onChange={(e) => setSnapPoints(e.target.value)}
                  placeholder="470,657"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500">負債（カード等）</label>
                <input
                  type="text"
                  value={snapDebt}
                  onChange={(e) => setSnapDebt(e.target.value)}
                  placeholder="0"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono focus:border-red-500 focus:outline-none"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={addSnapshot}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 rounded text-sm font-medium transition-colors"
                >
                  追加
                </button>
              </div>
            </div>
          </div>

          {timelineWithToday.length === 0 ? (
            <div className="text-center text-zinc-500 mt-12">
              <p className="text-lg">資産推移データがありません</p>
              <p className="text-sm mt-2">上のフォームから今日の総資産額を入力するか、CSVを取り込んでください</p>
            </div>
          ) : (
            <>
              {/* Price refresh bar */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-zinc-500">
                  {lastPriceRefresh
                    ? `最終価格更新: ${new Date(lastPriceRefresh).toLocaleString("ja-JP")}`
                    : ""}
                  {holdings.length > 0 && <span className="ml-2 text-emerald-500">（今日のデータは保有銘柄の最新価格から自動算出）</span>}
                </div>
                <button
                  onClick={refreshPrices}
                  disabled={refreshingPrices}
                  className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  {refreshingPrices ? (
                    <>
                      <span className="animate-spin inline-block w-3 h-3 border-2 border-zinc-500 border-t-white rounded-full" />
                      更新中...
                    </>
                  ) : "価格を更新"}
                </button>
              </div>

              {/* Current vs Start */}
              {(() => {
                const latest = timelineWithToday[timelineWithToday.length - 1];
                const first = timelineWithToday[0];
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
                const latest = timelineWithToday[timelineWithToday.length - 1];
                const cats = ASSET_CATEGORIES.filter((c) => {
                  const v = Number(latest[c.key] || 0);
                  return v !== 0;
                });
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {cats.map((c) => {
                      const v = Number(latest[c.key] || 0);
                      const pct = latest.total > 0 ? (Math.abs(v) / latest.total) * 100 : 0;
                      const isDebt = c.key === "debt";
                      return (
                        <div key={c.key} className="border border-zinc-800 rounded-lg p-3 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: c.color }} />
                          <div className="ml-2">
                            <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: c.color }} />
                              {c.label}
                            </div>
                            <div className={clsx("text-lg font-bold mt-1", isDebt ? "text-red-400" : v < 0 ? "text-red-400" : "text-white")}>
                              {v < 0 ? "-" : isDebt ? "-" : ""}¥{Math.abs(v).toLocaleString()}
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
                  <DonutChart data={timelineWithToday[timelineWithToday.length - 1]} />
                </div>

                {/* Stacked area chart */}
                <div className="border border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-400 mb-3">資産推移グラフ</h3>
                  <StackedAreaChart data={timelineWithToday} />
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
                      {(() => {
                        const monthly: TimelineRecord[] = [];
                        let lastMonth = "";
                        const reversed = [...timelineWithToday].reverse();
                        for (const t of reversed) {
                          const month = t.date.substring(0, 7);
                          if (month !== lastMonth) {
                            monthly.push(t);
                            lastMonth = month;
                          }
                        }
                        const today = new Date().toISOString().substring(0, 10);
                        return monthly.slice(0, 24).map((t) => (
                          <tr key={t.date} className={clsx(
                            "border-b border-zinc-800/50 hover:bg-zinc-900",
                            t.date === today && "bg-purple-950/20"
                          )}>
                            <td className="py-1.5 px-2 font-mono text-zinc-400">
                              {t.date}
                              {t.date === today && <span className="ml-1 text-purple-400 text-xs">（今日）</span>}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono font-bold">¥{t.total.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-zinc-400">¥{t.cash.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-blue-400">¥{t.stocks.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-green-400">¥{t.funds.toLocaleString()}</td>
                            <td className={clsx("py-1.5 px-2 text-right font-mono", t.margin < 0 ? "text-red-400" : "text-zinc-500")}>
                              {t.margin < 0 ? "-" : ""}¥{Math.abs(t.margin).toLocaleString()}
                            </td>
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
