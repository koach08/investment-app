"use client";

import { useState, useEffect, useCallback } from "react";
import NewsCard from "@/components/NewsCard";

interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  category: string;
}

const CATEGORIES = [
  { key: "global", label: "グローバル" },
  { key: "japan", label: "日本" },
  { key: "us", label: "米国" },
  { key: "asia", label: "アジア" },
];

export default function NewsPage() {
  const [category, setCategory] = useState("global");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tickerSearch, setTickerSearch] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const params = tickerSearch
        ? `ticker=${encodeURIComponent(tickerSearch)}`
        : `category=${category}`;
      const res = await fetch(`/api/news?${params}`);
      const data = await res.json();
      setNews(data.news || []);
    } catch {
      setNews([]);
    }
    setLoading(false);
  }, [category, tickerSearch]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  // Auto-refresh every 15 minutes
  useEffect(() => {
    const interval = setInterval(fetchNews, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  const generateAiSummary = async () => {
    setAiLoading(true);
    setAiSummary("");
    try {
      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "news",
          news: news.slice(0, 15),
        }),
      });
      const data = await res.json();
      setAiSummary(data.summary || data.error || "要約失敗");
    } catch {
      setAiSummary("要約生成に失敗しました。");
    }
    setAiLoading(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">ニュース</h1>
        <button
          onClick={generateAiSummary}
          disabled={aiLoading || news.length === 0}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium"
        >
          {aiLoading ? "要約中..." : "AI要約"}
        </button>
      </div>

      {/* AI Summary */}
      {aiSummary && (
        <div className="border border-purple-800/50 bg-purple-950/20 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-purple-400 mb-2">
            AI要約（投資家視点）
          </h3>
          <div className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {aiSummary}
          </div>
        </div>
      )}

      {/* Search + category tabs */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => {
                setCategory(c.key);
                setTickerSearch("");
              }}
              className={`px-3 py-1.5 rounded text-sm whitespace-nowrap ${
                category === c.key && !tickerSearch
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-1">
          <input suppressHydrationWarning
            type="text"
            value={tickerSearch}
            onChange={(e) => setTickerSearch(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && fetchNews()}
            placeholder="銘柄検索（例: AAPL, 7203.T）"
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={fetchNews}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm"
          >
            検索
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-zinc-500 py-12">ニュース取得中...</div>
      ) : news.length > 0 ? (
        <div className="grid gap-2">
          {news.map((n, i) => (
            <NewsCard key={i} {...n} />
          ))}
        </div>
      ) : (
        <div className="text-center text-zinc-500 py-12">
          ニュースが見つかりませんでした
        </div>
      )}
    </div>
  );
}
