"use client";

import { useState, useEffect, useCallback } from "react";
import { clsx } from "clsx";
import type { WalletBalance } from "@/lib/onchain/wallet";

// === Types (mirrored from crypto-trader) ===
type CryptoAction = "BUY" | "SELL" | "HOLD";
type CircuitBreakerState = "ACTIVE" | "WARNING" | "TRIGGERED" | "MANUAL_STOP";

interface BotStatus {
  running: boolean;
  paperMode: boolean;
  lastCycleTimestamp: string | null;
  nextCycleTimestamp: string | null;
  circuitBreakerState: CircuitBreakerState;
  activePairs: string[];
  cycleCount: number;
}

interface Position {
  pair: string;
  exchange: string;
  amount: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  valueJPY: number;
  stopLoss?: number;
  takeProfit?: number;
  entryTimestamp: string;
}

interface DailyPnL {
  date: string;
  startCapitalJPY: number;
  currentCapitalJPY: number;
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;
  totalPnLPercent: number;
  trades: number;
  wins: number;
  losses: number;
  circuitBreakerTriggered: boolean;
}

interface AIDecision {
  timestamp: string;
  pair: string;
  action: CryptoAction;
  confidence: number;
  reason: string;
  fearGreedIndex: number;
  technicalScore: number;
}

interface TradeRecord {
  id: string;
  timestamp: string;
  pair: string;
  side: "buy" | "sell";
  type: string;
  amount: number;
  price: number;
  valueJPY: number;
  pnl?: number;
  pnlPercent?: number;
}

interface CumulativePnL {
  startCapitalJPY: number;
  totalRealizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;
  totalPnLPercent: number;
  totalFees: number;
  netPnL: number;
  totalTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  positionValueJPY: number;
  firstTradeDate: string | null;
  lastTradeDate: string | null;
}

interface StatusData {
  status: BotStatus;
  positions: Position[];
  dailyPnL: DailyPnL;
  cumulativePnL?: CumulativePnL;
  recentDecisions: AIDecision[];
  recentTrades: TradeRecord[];
  jpyBalance?: { free: number; used: number; total: number };
}

interface ProxyError {
  error: string;
  message?: string;
}

interface CryptoProposal {
  id: number;
  pair: string;
  timestamp: string;
  text: string;
}

function fmt(n: number | undefined, digits = 0): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString("ja-JP", { maximumFractionDigits: digits });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "たった今";
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

function buildCryptoRiskPanel(
  positions: Position[],
  pnl: DailyPnL,
  cum: CumulativePnL | undefined,
  status: BotStatus,
  recentDecisions: AIDecision[]
) {
  const capital = cum?.startCapitalJPY ?? pnl.startCapitalJPY;
  const exposure = positions.reduce((sum, p) => sum + p.valueJPY, 0);
  const exposurePercent = capital > 0 ? (exposure / capital) * 100 : 0;
  const openRiskJPY = positions.reduce((sum, p) => {
    if (!p.stopLoss) return sum + p.valueJPY * 0.08;
    return sum + Math.max(0, (p.avgEntryPrice - p.stopLoss) * p.amount);
  }, 0);
  const openRiskPercent = capital > 0 ? (openRiskJPY / capital) * 100 : 0;
  const lossStreak = [...recentDecisions].reverse().slice(0, 5).filter((d) => d.action !== "HOLD" && d.confidence < 55).length;
  const dailyLossPercent = pnl.startCapitalJPY > 0 ? Math.min(0, pnl.totalPnL / pnl.startCapitalJPY) * 100 : 0;
  const warnings: string[] = [];

  if (!status.paperMode) warnings.push("ライブ運用モード。注文前の手動確認を推奨");
  if (exposurePercent > 55) warnings.push("暗号資産エクスポージャーが大きい");
  if (openRiskPercent > 2) warnings.push("未決済ポジションの想定損失が大きい");
  if (dailyLossPercent <= -2) warnings.push("日次損失が2%超。クールダウン推奨");
  if (status.circuitBreakerState !== "ACTIVE") warnings.push(`サーキットブレーカー: ${status.circuitBreakerState}`);
  if (lossStreak >= 3) warnings.push("低確信度の取引判断が続いている");

  const score = Math.round(Math.max(0, 100 - exposurePercent * 0.5 - openRiskPercent * 10 + dailyLossPercent * 8 - warnings.length * 8));
  const gate = status.circuitBreakerState === "TRIGGERED" || score < 35
    ? "AVOID"
    : score < 65 || warnings.length > 0
    ? "REDUCE_SIZE"
    : "TRADEABLE";

  return {
    capital,
    exposure,
    exposurePercent,
    openRiskJPY,
    openRiskPercent,
    dailyLossPercent,
    score,
    gate,
    warnings,
  };
}

export default function CryptoPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Semi-auto proposals (human final decision)
  const [proposals, setProposals] = useState<CryptoProposal[]>([]);
  const [proposalBusy, setProposalBusy] = useState<string | null>(null);

  // On-chain wallet (read-only, for reference)
  const [wallet, setWallet] = useState<WalletBalance | { error: string } | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/crypto/bot/status");
      const json = (await res.json()) as StatusData | ProxyError;
      if ("error" in json) {
        setError(json.message || json.error);
        setData(null);
      } else {
        setData(json);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 10000);
    return () => clearInterval(id);
  }, [fetchData]);

  const sendAction = async (action: "start" | "stop" | "cycle", paperMode?: boolean) => {
    setActionBusy(true);
    try {
      const body = action === "start" && paperMode !== undefined ? { paperMode } : undefined;
      await fetch(`/api/crypto/bot/${action}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      await fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setActionBusy(false);
    }
  };

  // Semi-auto: AI gives clear proposal, human places the order manually
  const requestProposal = async (pair: string) => {
    setProposalBusy(pair);
    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "user", content: `現在の市場状況を踏まえ、${pair} のスイングまたはデイトレード向けの半自動用提案を1つだけ出してください。必ず以下の形式で:\nエントリー指値: XXX\n損切り: XXX\n利確: XXX\nサイズ目安: 資金のX%\n根拠: 1-2文\n撤退条件: ...\n確信度: XX%` }
          ],
          context: { focus: "crypto", pair, currentPositions: data?.positions || [], mode: "semi-auto human decision" }
        })
      });
      const json = await res.json();
      const proposal = {
        id: Date.now(),
        pair,
        timestamp: new Date().toISOString(),
        text: json.reply || json.content || "提案生成に失敗",
      };
      setProposals((p) => [proposal, ...p].slice(0, 5));
    } catch {
      setProposals((p) => [
        {
          id: Date.now(),
          pair,
          text: "AI提案取得エラー。手動で判断してください。",
          timestamp: new Date().toISOString(),
        },
        ...p,
      ].slice(0, 5));
    } finally {
      setProposalBusy(null);
    }
  };

  const copyOrder = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("コピーしました。bitFlyerで手動発注してください。");
  };

  const fetchWallet = async (addr?: string) => {
    const target = addr || walletAddress;
    if (!target) return;
    setWalletLoading(true);
    try {
      const res = await fetch(`/api/onchain/wallet?address=${encodeURIComponent(target)}`);
      const json = await res.json();
      if (json.error) {
        setWallet({ error: json.error });
      } else {
        setWallet(json);
      }
    } catch (e) {
      setWallet({ error: e instanceof Error ? e.message : "wallet fetch failed" });
    } finally {
      setWalletLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20 text-zinc-500">
        crypto-trader に接続中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">💎 暗号資産（crypto-trader連携）</h1>
        <div className="bg-red-900/20 border border-red-900 rounded-xl p-6">
          <div className="text-red-400 font-medium mb-2">
            crypto-traderに接続できません
          </div>
          <div className="text-sm text-zinc-400 mb-3">{error}</div>
          <div className="text-xs text-zinc-500 space-y-1">
            <div>
              crypto-trader を起動してください:
            </div>
            <div className="text-xs text-zinc-500 mt-2">
              現在は公開デプロイ版 (<span className="text-emerald-400">Railway</span>) をデフォルト参照しています。<br />
              ローカルで動かしている場合は <code className="text-zinc-300">CRYPTO_TRADER_URL</code> で上書きしてください。
            </div>
          </div>
          <button
            onClick={fetchData}
            className="mt-4 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  const { status, positions, dailyPnL: pnl, cumulativePnL: cum, recentDecisions, recentTrades, jpyBalance } = data!;
  const totalUnrealized = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const totalPositionValue = positions.reduce((sum, p) => sum + p.valueJPY, 0);
  const risk = buildCryptoRiskPanel(positions, pnl, cum, status, recentDecisions);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">💎 暗号資産</h1>
          <div className="text-xs text-zinc-500 mt-1">
            crypto-trader連携 ・ サイクル{status.cycleCount}回
            {status.lastCycleTimestamp && ` ・ 最終: ${timeAgo(status.lastCycleTimestamp)}`}
          </div>
          {jpyBalance && (
            <div className="text-[10px] mt-0.5 text-amber-400">
              現在 free JPY: ¥{fmt(jpyBalance.free)} / total ¥{fmt(jpyBalance.total)}（used ¥{fmt(jpyBalance.used)}）
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium",
              status.running
                ? "bg-green-900/50 text-green-400"
                : "bg-zinc-800 text-zinc-400"
            )}
          >
            <span
              className={clsx(
                "w-2 h-2 rounded-full",
                status.running ? "bg-green-400 animate-pulse" : "bg-zinc-600"
              )}
            />
            {status.running ? "稼働中" : "停止"}
          </span>
          {!status.paperMode ? (
            <span className="px-2 py-0.5 rounded text-xs bg-red-900/70 text-red-300 font-bold border border-red-500">
              🔴 LIVE (実取引)
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-xs bg-yellow-900/50 text-yellow-400 font-medium">
              📝 PAPER
            </span>
          )}
          {status.circuitBreakerState === "TRIGGERED" && (
            <span className="px-2 py-0.5 rounded text-xs bg-red-900/50 text-red-400 font-medium">
              停止中
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
         <button
           onClick={() => sendAction("start", true)}
           disabled={actionBusy || status.running}
           className="px-3 py-1.5 text-xs bg-emerald-900/60 text-emerald-300 hover:bg-emerald-900/80 rounded disabled:opacity-30"
         >
           Paper起動
         </button>
         <button
           onClick={() => sendAction("start", false)}
           disabled={actionBusy || status.running}
           className="px-3 py-1.5 text-xs bg-red-800/70 text-red-300 hover:bg-red-800 border border-red-500/60 rounded disabled:opacity-30"
           title="実弾LIVE"
         >
           🔴 LIVE起動
         </button>
         <button
           onClick={() => sendAction("stop")}
           disabled={actionBusy || !status.running}
           className="px-3 py-1.5 text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
         >
           停止
         </button>
        <button
          onClick={() => sendAction("cycle")}
          disabled={actionBusy}
          className="px-3 py-1.5 text-xs bg-blue-900/50 text-blue-400 hover:bg-blue-900/70 rounded disabled:opacity-30"
        >
          手動サイクル実行
        </button>
      </div>

      {/* Full Auto for Crypto */}
      <section className="border border-red-800/60 bg-red-950/10 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-red-400 font-bold">🔴 フルオート運用（crypto専用）</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-red-900/50 text-red-300 rounded">実弾注意</span>
        </div>
        <div className="text-xs text-zinc-400 mb-2">
          ボットがAI判断 → 自動発注を繰り返します。サーキットブレーカー・リスク管理はtrader側で動作中。
          投資アプリ側では監視・手動介入のみ推奨。
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => sendAction("start", true)}
            disabled={actionBusy || status.running}
            className="px-3 py-1 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded disabled:opacity-40"
          >
            📝 Paperでフルオート開始
          </button>
          <button
            onClick={() => sendAction("start", false)}
            disabled={actionBusy || status.running}
            className="px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded disabled:opacity-40 border border-red-500"
            title="実取引モード"
          >
            🔴 LIVEフルオート開始 (実弾)
          </button>
          <button
            onClick={() => sendAction("stop")}
            disabled={actionBusy || !status.running}
            className="px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded disabled:opacity-40"
          >
            停止
          </button>
          <button
            onClick={() => sendAction("cycle")}
            disabled={actionBusy}
            className="px-3 py-1 text-xs bg-orange-800/70 text-orange-200 hover:bg-orange-800 rounded"
          >
            1サイクル強制
          </button>
        </div>
        {status.running && (
          <div className="mt-2 text-[10px] text-red-300">現在フルオート実行中。ポジションは自動で管理されます。</div>
        )}
      </section>

      {/* Semi-auto proposals for human decision (stock寄り or 手動確認したい時用) */}
      <section className="border border-amber-800/50 bg-amber-950/10 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-amber-400">半自動判断支援（人間が最終判断）</div>
            <div className="text-[11px] text-zinc-500">AIが指値・SL/TP・サイズを提案 → あなたがbitFlyerで手動発注 → 結果を後で記録</div>
          </div>
          <button
            onClick={() => setProposals([])}
            className="text-xs px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-900"
          >
            提案クリア
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(data?.status.activePairs || ["BTC/JPY","ETH/JPY","XRP/JPY"]).map((pair) => (
            <button
              key={pair}
              onClick={() => requestProposal(pair)}
              disabled={!!proposalBusy}
              className="px-3 py-1 text-xs rounded bg-amber-900/60 hover:bg-amber-900 text-amber-300 disabled:opacity-50"
            >
              {proposalBusy === pair ? "分析中..." : `${pair} を分析して提案`}
            </button>
          ))}
          <button
            onClick={() => sendAction("cycle")}
            disabled={actionBusy}
            className="px-3 py-1 text-xs rounded bg-blue-900/50 text-blue-300 hover:bg-blue-900/70"
          >
            トレーダー側で1サイクル手動実行
          </button>
        </div>

        {proposals.length > 0 && (
          <div className="space-y-2 pt-2">
            {proposals.map((pr) => (
              <div key={pr.id} className="bg-zinc-950 border border-amber-900/40 rounded-lg p-3 text-sm">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-amber-300">{pr.pair}</span>
                  <span className="text-[10px] text-zinc-500">{timeAgo(pr.timestamp)}</span>
                </div>
                <pre className="whitespace-pre-wrap text-xs text-zinc-300 font-mono leading-snug">{pr.text}</pre>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => copyOrder(pr.text)} className="text-[11px] px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded">提案全文をコピー（発注用）</button>
                  <button onClick={() => setProposals(ps => ps.filter(p => p.id !== pr.id))} className="text-[11px] px-2 py-0.5 text-zinc-400 hover:text-white">削除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div
        className={clsx(
          "border rounded-xl p-4",
          risk.gate === "TRADEABLE"
            ? "border-green-700/40 bg-green-950/10"
            : risk.gate === "REDUCE_SIZE"
            ? "border-yellow-700/40 bg-yellow-950/10"
            : "border-red-700/40 bg-red-950/10"
        )}
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-xs text-zinc-500 font-semibold">Institutional Risk Overlay</div>
            <div className="text-lg font-bold">
              {risk.gate === "TRADEABLE" ? "取引可" : risk.gate === "REDUCE_SIZE" ? "サイズ縮小" : "新規回避"} / Risk {risk.score}
            </div>
          </div>
          <div className="text-right text-xs text-zinc-500">
            目安: 1取引の許容損失は資金の0.5〜0.8%
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="bg-zinc-950/40 rounded p-2">
            <div className="text-zinc-500">総エクスポージャー</div>
            <div className="font-mono font-bold">¥{fmt(risk.exposure)} ({risk.exposurePercent.toFixed(1)}%)</div>
          </div>
          <div className="bg-zinc-950/40 rounded p-2">
            <div className="text-zinc-500">Open Risk</div>
            <div className="font-mono font-bold">¥{fmt(risk.openRiskJPY)} ({risk.openRiskPercent.toFixed(2)}%)</div>
          </div>
          <div className="bg-zinc-950/40 rounded p-2">
            <div className="text-zinc-500">日次損益</div>
            <div className={clsx("font-mono font-bold", pnl.totalPnL >= 0 ? "text-green-400" : "text-red-400")}>
              {pnl.totalPnL >= 0 ? "+" : ""}¥{fmt(pnl.totalPnL)}
            </div>
          </div>
          <div className="bg-zinc-950/40 rounded p-2">
            <div className="text-zinc-500">ポジション評価額</div>
            <div className="font-mono font-bold">¥{fmt(totalPositionValue)}</div>
          </div>
        </div>
        {risk.warnings.length > 0 && (
          <ul className="mt-3 space-y-1">
            {risk.warnings.map((w, i) => (
              <li key={i} className="text-[11px] text-yellow-200/80">{w}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Cumulative Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="text-xs text-zinc-500 mb-1">仮想資金</div>
          <div className="text-xl font-bold text-zinc-100">
            ¥{fmt(cum?.startCapitalJPY ?? pnl.startCapitalJPY)}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {cum ? `${cum.totalTrades}取引（${cum.closedTrades}決済済）` : pnl.date}
          </div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="text-xs text-zinc-500 mb-1">通算損益（実現）</div>
          <div
            className={clsx(
              "text-xl font-bold",
              (cum?.totalRealizedPnL ?? pnl.realizedPnL) >= 0 ? "text-green-400" : "text-red-400"
            )}
          >
            {(cum?.totalRealizedPnL ?? pnl.realizedPnL) >= 0 ? "+" : ""}
            ¥{fmt(cum?.totalRealizedPnL ?? pnl.realizedPnL)}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {cum ? `${cum.wins}勝 ${cum.losses}敗（勝率${cum.winRate.toFixed(0)}%）` : `${pnl.wins}勝 ${pnl.losses}敗`}
          </div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="text-xs text-zinc-500 mb-1">未実現損益</div>
          <div
            className={clsx(
              "text-xl font-bold",
              totalUnrealized >= 0 ? "text-green-400" : "text-red-400"
            )}
          >
            {totalUnrealized >= 0 ? "+" : ""}¥{fmt(totalUnrealized)}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {positions.length}ポジション保有中
          </div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="text-xs text-zinc-500 mb-1">トータルP&L</div>
          <div
            className={clsx(
              "text-xl font-bold",
              (cum?.totalPnL ?? pnl.totalPnL) >= 0 ? "text-green-400" : "text-red-400"
            )}
          >
            {(cum?.totalPnL ?? pnl.totalPnL) >= 0 ? "+" : ""}
            ¥{fmt(cum?.totalPnL ?? pnl.totalPnL)}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {cum ? `${cum.totalPnLPercent >= 0 ? "+" : ""}${cum.totalPnLPercent.toFixed(2)}%` : "—"}
            {cum?.totalFees ? ` / 手数料¥${fmt(cum.totalFees)}` : ""}
          </div>
        </div>
      </div>

      {/* Positions */}
      <section>
        <h2 className="text-sm font-medium text-zinc-400 mb-2">現在のポジション</h2>
        {positions.length === 0 ? (
          <div className="bg-zinc-900 rounded-xl p-8 border border-zinc-800 text-center text-zinc-500 text-sm">
            ポジションなし
          </div>
        ) : (
          <div className="space-y-2">
            {positions.map((p) => (
              <div
                key={p.pair}
                className="bg-zinc-900 rounded-xl p-4 border border-zinc-800"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{p.pair}</span>
                    <span className="text-xs text-zinc-500">
                      {timeAgo(p.entryTimestamp)}
                    </span>
                  </div>
                  <div
                    className={clsx(
                      "font-bold",
                      p.unrealizedPnL >= 0 ? "text-green-400" : "text-red-400"
                    )}
                  >
                    {p.unrealizedPnL >= 0 ? "+" : ""}¥{fmt(p.unrealizedPnL)}
                    <span className="text-xs ml-1">
                      ({p.unrealizedPnLPercent >= 0 ? "+" : ""}
                      {p.unrealizedPnLPercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-zinc-400">
                  <div>
                    <div className="text-zinc-600">保有量</div>
                    <div className="text-zinc-200">{p.amount.toFixed(6)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-600">取得単価</div>
                    <div className="text-zinc-200">¥{fmt(p.avgEntryPrice, 2)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-600">現在値</div>
                    <div className="text-zinc-200">¥{fmt(p.currentPrice, 2)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-600">評価額</div>
                    <div className="text-zinc-200">¥{fmt(p.valueJPY)}</div>
                  </div>
                </div>
                {(p.stopLoss || p.takeProfit) && (
                  <div className="flex gap-4 mt-2 pt-2 border-t border-zinc-800 text-xs">
                    {p.stopLoss && (
                      <div>
                        <span className="text-zinc-600">SL: </span>
                        <span className="text-red-400">¥{fmt(p.stopLoss, 2)}</span>
                      </div>
                    )}
                    {p.takeProfit && (
                      <div>
                        <span className="text-zinc-600">TP: </span>
                        <span className="text-green-400">¥{fmt(p.takeProfit, 2)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* On-chain Wallet (read-only reference) */}
      <section>
        <h2 className="text-sm font-medium text-zinc-400 mb-2">On-chain ウォレット残高</h2>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            placeholder="0x... (ETH wallet)"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono"
          />
          <button
            onClick={() => fetchWallet()}
            disabled={walletLoading || !walletAddress}
            className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded disabled:opacity-50"
          >
            {walletLoading ? "取得中..." : "取得"}
          </button>
        </div>
         {wallet && !('error' in wallet) && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs">
            <div className="font-mono text-[10px] text-zinc-500 mb-1 truncate">{wallet.address}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div>ETH: {wallet.eth?.amount?.toFixed(4) || 0} (¥{fmt(wallet.eth?.jpyValue)})</div>
              <div className="font-bold">合計: ¥{fmt(wallet.totalJPY)}</div>
               {wallet.tokens?.map((t: {symbol?: string; amount?: number; jpyValue?: number}, i: number) => (
                <div key={i}>{t.symbol}: {t.amount?.toFixed(4)} (¥{fmt(t.jpyValue)})</div>
              ))}
            </div>
            <div className="text-[10px] text-zinc-600 mt-1">fetched: {wallet.fetchedAt ? new Date(wallet.fetchedAt).toLocaleTimeString() : ""}</div>
          </div>
        )}
         {'error' in (wallet || {}) && (
           <div className="text-red-400 text-xs">{(wallet as any).error}</div>
         )}
        <div className="text-[10px] text-zinc-600 mt-1">※ 公開情報のみ（秘密鍵不要）。METAMASK_WALLET_ADDRESS でも設定可。</div>
      </section>

      {/* Recent AI Decisions */}
      <section>
        <h2 className="text-sm font-medium text-zinc-400 mb-2">AI判断履歴（直近10件）</h2>
        {recentDecisions.length === 0 ? (
          <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 text-center text-zinc-500 text-sm">
            まだ判断がありません
          </div>
        ) : (
          <div className="space-y-1.5">
            {[...recentDecisions].reverse().map((d, idx) => (
              <div
                key={idx}
                className="bg-zinc-900 rounded-lg p-3 border border-zinc-800"
              >
                <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{d.pair}</span>
                    <span
                      className={clsx(
                        "px-2 py-0.5 rounded text-xs font-bold",
                        d.action === "BUY"
                          ? "bg-green-900/50 text-green-400"
                          : d.action === "SELL"
                          ? "bg-red-900/50 text-red-400"
                          : "bg-zinc-800 text-zinc-400"
                      )}
                    >
                      {d.action}
                    </span>
                    <span className="text-xs text-zinc-500">
                      確信度{d.confidence}%
                    </span>
                    <span className="text-xs text-zinc-600">
                      F&G: {d.fearGreedIndex}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {timeAgo(d.timestamp)}
                  </span>
                </div>
                <div className="text-xs text-zinc-400 leading-relaxed">
                  {d.reason}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Trades */}
      {recentTrades.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-zinc-400 mb-2">取引履歴（直近）</h2>
          <div className="space-y-1">
            {[...recentTrades].reverse().map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between bg-zinc-900 rounded-lg px-3 py-2 border border-zinc-800 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      "px-1.5 py-0.5 rounded font-bold text-[10px]",
                      t.side === "buy"
                        ? "bg-green-900/50 text-green-400"
                        : "bg-red-900/50 text-red-400"
                    )}
                  >
                    {t.side.toUpperCase()}
                  </span>
                  <span className="font-medium">{t.pair}</span>
                   <span className="text-zinc-500">
                     ¥{fmt(t.valueJPY)} <span className="text-[10px] text-zinc-600">({t.amount?.toFixed(5) || "?"})</span>
                   </span>
                   {t.pnl !== undefined && (
                     <span
                       className={clsx(
                         t.pnl >= 0 ? "text-green-400" : "text-red-400"
                       )}
                     >
                       {t.pnl >= 0 ? "+" : ""}¥{fmt(t.pnl)}
                     </span>
                   )}
                </div>
                <span className="text-zinc-500">{timeAgo(t.timestamp)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="text-center text-xs text-zinc-600 pt-4">
        crypto-trader 連携中（プロキシ経由） ・ 10秒ごとに自動更新
      </div>
    </div>
  );
}
