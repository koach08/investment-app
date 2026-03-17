"use client";

import { useState, useEffect } from "react";
import { clsx } from "clsx";
import MarkdownRenderer from "@/components/MarkdownRenderer";

interface FredItem {
  name: string;
  seriesId: string;
  latestValue: string;
  previousValue: string;
  date: string;
  change: number;
  region?: string;
}

type RegionFilter = "all" | "japan" | "us" | "global";

const KEY_EVENTS = [
  { name: "日銀金融政策決定会合", schedule: "年8回", next: "次回: 2026年3月", region: "japan" },
  { name: "日本CPI発表", schedule: "毎月下旬", next: "毎月注目", region: "japan" },
  { name: "日銀短観", schedule: "年4回（4/7/10/12月）", next: "四半期ごと", region: "japan" },
  { name: "FOMC会合", schedule: "年8回（約6週間ごと）", next: "次回: 2026年3月", region: "us" },
  { name: "米CPI発表", schedule: "毎月第2〜3水曜", next: "毎月注目", region: "us" },
  { name: "米雇用統計", schedule: "毎月第1金曜", next: "毎月注目", region: "us" },
  { name: "米GDP速報値", schedule: "四半期末翌月", next: "四半期ごと", region: "us" },
  { name: "ECB理事会", schedule: "6週間ごと", next: "定期開催", region: "global" },
  { name: "中国GDP発表", schedule: "年4回", next: "四半期ごと", region: "global" },
  { name: "OPEC会合", schedule: "年2回+臨時", next: "不定期", region: "global" },
];

const REGION_LABELS: Record<RegionFilter, string> = {
  all: "全て",
  japan: "日本",
  us: "米国",
  global: "欧州・中国・その他",
};

export default function CalendarPage() {
  const [fredData, setFredData] = useState<FredItem[]>([]);
  const [isMock, setIsMock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [regionFilter, setRegionFilter] = useState<RegionFilter>("all");

  useEffect(() => {
    fetchFred();
  }, []);

  const fetchFred = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/economic-calendar");
      const data = await res.json();
      setFredData(data.data || []);
      setIsMock(data.isMock || false);
    } catch {
      setFredData([]);
    }
    setLoading(false);
  };

  const runAiExplanation = async () => {
    setAiLoading(true);
    setAiAnalysis("");
    try {
      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "calendar",
          fredData: fredData,
        }),
      });
      const data = await res.json();
      setAiAnalysis(data.summary || data.error || "解説失敗");
    } catch {
      setAiAnalysis("AI解説の取得に失敗しました。");
    }
    setAiLoading(false);
  };

  const filteredData = regionFilter === "all"
    ? fredData
    : fredData.filter((d) => d.region === regionFilter);

  const filteredEvents = regionFilter === "all"
    ? KEY_EVENTS
    : KEY_EVENTS.filter((e) => e.region === regionFilter);

  // Check for yield curve inversion
  const yieldSpread = fredData.find((d) => d.seriesId === "T10Y2Y");
  const isInverted = yieldSpread && parseFloat(yieldSpread.latestValue) < 0;

  // Check for JPY weakness
  const usdjpy = fredData.find((d) => d.seriesId === "DEXJPUS");
  const jpyWeak = usdjpy && parseFloat(usdjpy.latestValue) > 150;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">経済指標</h1>
        <button
          onClick={runAiExplanation}
          disabled={aiLoading || fredData.length === 0}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium"
        >
          {aiLoading ? "解説中..." : "AI解説"}
        </button>
      </div>

      {/* Region filter */}
      <div className="flex gap-1 mb-4">
        {(Object.entries(REGION_LABELS) as [RegionFilter, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setRegionFilter(key)}
            className={clsx(
              "px-3 py-1.5 rounded text-sm",
              regionFilter === key ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isMock && (
        <div className="bg-yellow-950/30 border border-yellow-800/50 rounded-lg p-3 mb-4 text-sm text-yellow-400">
          FRED APIキーが未設定のため、モックデータを表示しています。
          .env.local に FRED_API_KEY を設定してください。
        </div>
      )}

      {/* Warnings */}
      {isInverted && (regionFilter === "all" || regionFilter === "us") && (
        <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-3 mb-4 text-sm text-red-400">
          逆イールド発生中: 長短金利差（10Y-2Y）= {yieldSpread.latestValue}
          — 歴史的に景気後退の先行指標
        </div>
      )}

      {jpyWeak && (regionFilter === "all" || regionFilter === "japan") && (
        <div className="bg-orange-950/30 border border-orange-800/50 rounded-lg p-3 mb-4 text-sm text-orange-400">
          円安警戒: ドル円 = {usdjpy?.latestValue}円 — 外貨建て資産の円換算額に注意
        </div>
      )}

      {/* AI Analysis */}
      {aiAnalysis && (
        <div className="border border-purple-800/50 bg-purple-950/20 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-purple-400 mb-2">AI解説</h3>
          <MarkdownRenderer content={aiAnalysis} />
        </div>
      )}

      {loading ? (
        <div className="text-center text-zinc-500 py-12">データ取得中...</div>
      ) : (
        <>
          {/* Grouped indicators */}
          {regionFilter === "all" ? (
            <>
              {/* Japan section */}
              <h2 className="text-lg font-semibold mb-3 text-red-400">日本</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {fredData.filter((d) => d.region === "japan").map((item) => (
                  <IndicatorCard key={item.seriesId} item={item} isInverted={false} />
                ))}
              </div>

              {/* US section */}
              <h2 className="text-lg font-semibold mb-3 text-blue-400">米国</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {fredData.filter((d) => d.region === "us").map((item) => (
                  <IndicatorCard key={item.seriesId} item={item} isInverted={item.seriesId === "T10Y2Y" && !!isInverted} />
                ))}
              </div>

              {/* Global section */}
              <h2 className="text-lg font-semibold mb-3 text-green-400">欧州・中国・コモディティ</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                {fredData.filter((d) => d.region === "global").map((item) => (
                  <IndicatorCard key={item.seriesId} item={item} isInverted={false} />
                ))}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              {filteredData.map((item) => (
                <IndicatorCard key={item.seriesId} item={item} isInverted={item.seriesId === "T10Y2Y" && !!isInverted} />
              ))}
            </div>
          )}

          {/* Key events */}
          <h2 className="text-lg font-semibold mb-3">重要経済イベント</h2>
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="text-left py-2 px-4">イベント</th>
                  <th className="text-left py-2 px-4">地域</th>
                  <th className="text-left py-2 px-4">スケジュール</th>
                  <th className="text-left py-2 px-4">備考</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((event) => (
                  <tr key={event.name} className="border-b border-zinc-800/50 hover:bg-zinc-900">
                    <td className="py-2 px-4 font-medium">{event.name}</td>
                    <td className="py-2 px-4">
                      <span className={clsx(
                        "text-xs px-1.5 py-0.5 rounded",
                        event.region === "japan" ? "bg-red-900/50 text-red-400" :
                        event.region === "us" ? "bg-blue-900/50 text-blue-400" :
                        "bg-green-900/50 text-green-400"
                      )}>
                        {event.region === "japan" ? "日本" : event.region === "us" ? "米国" : "グローバル"}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-zinc-400">{event.schedule}</td>
                    <td className="py-2 px-4 text-zinc-500">{event.next}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function IndicatorCard({ item, isInverted }: { item: FredItem; isInverted: boolean }) {
  return (
    <div
      className={clsx(
        "border rounded-lg p-4",
        isInverted ? "border-red-700 bg-red-950/20" : "border-zinc-800"
      )}
    >
      <div className="text-xs text-zinc-500 truncate">{item.name}</div>
      <div className="text-2xl font-bold mt-1">{item.latestValue}</div>
      <div className="flex justify-between mt-2 text-xs text-zinc-500">
        <span>前回: {item.previousValue}</span>
        <span
          className={clsx(
            item.change > 0 ? "text-green-400" : item.change < 0 ? "text-red-400" : ""
          )}
        >
          {item.change > 0 ? "+" : ""}
          {item.change !== 0 ? item.change.toFixed(2) : "±0"}
        </span>
      </div>
      <div className="text-xs text-zinc-600 mt-1">{item.date}</div>
    </div>
  );
}
