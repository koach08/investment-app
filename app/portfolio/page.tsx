"use client";

import { useState, useEffect, useCallback } from "react";
import { clsx } from "clsx";
import TickerLink from "@/components/TickerLink";

interface Holding {
  ticker: string;
  name: string;
  shares: number;
  avgPrice: number;
  currentPrice?: number;
  change?: number;
  changePct?: number;
  value?: number;
  pnl?: number;
  pnlPct?: number;
}

const STORAGE_KEY = "investment-app-portfolio";

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [newTicker, setNewTicker] = useState("");
  const [newShares, setNewShares] = useState("");
  const [newAvgPrice, setNewAvgPrice] = useState("");
  const [loading, setLoading] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setHoldings(JSON.parse(saved));
    } catch {
      // ignore
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
    } catch {
      // ignore
    }
  }, [holdings]);

  const addHolding = () => {
    if (!newTicker || !newShares || !newAvgPrice) return;
    const holding: Holding = {
      ticker: newTicker.toUpperCase(),
      name: newTicker.toUpperCase(),
      shares: parseFloat(newShares),
      avgPrice: parseFloat(newAvgPrice),
    };
    setHoldings([...holdings, holding]);
    setNewTicker("");
    setNewShares("");
    setNewAvgPrice("");
  };

  const removeHolding = (ticker: string) => {
    setHoldings(holdings.filter((h) => h.ticker !== ticker));
  };

  const refreshPrices = useCallback(async () => {
    if (holdings.length === 0) return;
    setLoading(true);

    const updated = await Promise.all(
      holdings.map(async (h) => {
        try {
          const res = await fetch(
            `/api/market?ticker=${encodeURIComponent(h.ticker)}&period=1mo`
          );
          const data = await res.json();
          if (data.prices && data.prices.length >= 2) {
            const prices = data.prices;
            const currentPrice = prices[prices.length - 1].close;
            const prevPrice = prices[prices.length - 2].close;
            const change = currentPrice - prevPrice;
            const changePct = (change / prevPrice) * 100;
            const value = currentPrice * h.shares;
            const pnl = (currentPrice - h.avgPrice) * h.shares;
            const pnlPct = ((currentPrice - h.avgPrice) / h.avgPrice) * 100;
            return {
              ...h,
              name: data.name || h.ticker,
              currentPrice,
              change,
              changePct,
              value,
              pnl,
              pnlPct,
            };
          }
        } catch {
          // ignore
        }
        return h;
      })
    );

    setHoldings(updated);
    setLoading(false);
  }, [holdings]);

  useEffect(() => {
    if (holdings.length > 0 && !holdings[0].currentPrice) {
      refreshPrices();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalValue = holdings.reduce((sum, h) => sum + (h.value || 0), 0);
  const totalPnl = holdings.reduce((sum, h) => sum + (h.pnl || 0), 0);
  const totalCost = holdings.reduce(
    (sum, h) => sum + h.avgPrice * h.shares,
    0
  );
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">ポートフォリオ管理</h1>
        <button
          onClick={refreshPrices}
          disabled={loading || holdings.length === 0}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium"
        >
          {loading ? "更新中..." : "価格更新"}
        </button>
      </div>

      {/* Portfolio summary */}
      {holdings.length > 0 && totalValue > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="border border-zinc-800 rounded-lg p-4">
            <div className="text-xs text-zinc-500">総資産評価額</div>
            <div className="text-2xl font-bold mt-1">
              ¥{totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div
            className={clsx(
              "border rounded-lg p-4",
              totalPnl >= 0 ? "border-green-800" : "border-red-800"
            )}
          >
            <div className="text-xs text-zinc-500">含み損益</div>
            <div
              className={clsx(
                "text-2xl font-bold mt-1",
                totalPnl >= 0 ? "text-green-400" : "text-red-400"
              )}
            >
              {totalPnl >= 0 ? "+" : ""}¥
              {totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div
              className={clsx(
                "text-sm mt-1",
                totalPnlPct >= 0 ? "text-green-400" : "text-red-400"
              )}
            >
              ({totalPnlPct >= 0 ? "+" : ""}
              {totalPnlPct.toFixed(2)}%)
            </div>
          </div>
          <div className="border border-zinc-800 rounded-lg p-4">
            <div className="text-xs text-zinc-500">投資元本</div>
            <div className="text-2xl font-bold mt-1">
              ¥{totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      )}

      {/* Add holding form */}
      <div className="border border-zinc-800 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-semibold text-zinc-400 mb-3">銘柄追加</h3>
        <div className="flex gap-2">
          <input suppressHydrationWarning
            type="text"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value)}
            placeholder="ティッカー"
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
          />
          <input suppressHydrationWarning
            type="number"
            value={newShares}
            onChange={(e) => setNewShares(e.target.value)}
            placeholder="株数"
            className="w-24 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
          />
          <input suppressHydrationWarning
            type="number"
            value={newAvgPrice}
            onChange={(e) => setNewAvgPrice(e.target.value)}
            placeholder="平均取得価格"
            className="w-36 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
          />
          <button
            onClick={addHolding}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-medium"
          >
            追加
          </button>
        </div>
      </div>

      {/* Holdings table */}
      {holdings.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="text-left py-2 px-2">ティッカー</th>
                <th className="text-left py-2 px-2">銘柄名</th>
                <th className="text-right py-2 px-2">株数</th>
                <th className="text-right py-2 px-2">平均取得</th>
                <th className="text-right py-2 px-2">現在値</th>
                <th className="text-right py-2 px-2">前日比</th>
                <th className="text-right py-2 px-2">評価額</th>
                <th className="text-right py-2 px-2">損益</th>
                <th className="text-center py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr
                  key={h.ticker}
                  className="border-b border-zinc-800/50 hover:bg-zinc-900"
                >
                  <td className="py-2 px-2">
                    <TickerLink ticker={h.ticker} />
                  </td>
                  <td className="py-2 px-2">{h.name}</td>
                  <td className="py-2 px-2 text-right font-mono">{h.shares}</td>
                  <td className="py-2 px-2 text-right font-mono">
                    {h.avgPrice.toLocaleString()}
                  </td>
                  <td className="py-2 px-2 text-right font-mono">
                    {h.currentPrice?.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    }) || "-"}
                  </td>
                  <td
                    className={clsx(
                      "py-2 px-2 text-right font-mono",
                      h.changePct && h.changePct >= 0
                        ? "text-green-400"
                        : "text-red-400"
                    )}
                  >
                    {h.changePct != null
                      ? `${h.changePct >= 0 ? "+" : ""}${h.changePct.toFixed(2)}%`
                      : "-"}
                  </td>
                  <td className="py-2 px-2 text-right font-mono">
                    {h.value
                      ? `¥${h.value.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}`
                      : "-"}
                  </td>
                  <td
                    className={clsx(
                      "py-2 px-2 text-right font-mono font-bold",
                      h.pnl && h.pnl >= 0 ? "text-green-400" : "text-red-400"
                    )}
                  >
                    {h.pnl != null
                      ? `${h.pnl >= 0 ? "+" : ""}¥${h.pnl.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })} (${h.pnlPct?.toFixed(1)}%)`
                      : "-"}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <button
                      onClick={() => removeHolding(h.ticker)}
                      className="text-zinc-600 hover:text-red-400 text-xs"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center text-zinc-500 mt-12">
          <p className="text-lg">ポートフォリオが空です</p>
          <p className="text-sm mt-2">
            上のフォームから銘柄を追加してください
          </p>
        </div>
      )}
    </div>
  );
}
