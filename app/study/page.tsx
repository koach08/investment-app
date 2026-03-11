"use client";

import { useState } from "react";
import { clsx } from "clsx";

interface StockEntry {
  code: string;
  name: string;
  sector: string;
  buyPrice: number;
  currentPrice: number;
  targetPrice: number;
  analystRating: string;
  dividendYield: string;
  per: string;
  pbr: string;
  note: string;
  market: string;
}

// Mother's portfolio data
const MOTHER_PORTFOLIO: StockEntry[] = [
  // 通信
  { code: "9432", name: "NTT", sector: "通信", buyPrice: 300, currentPrice: 154, targetPrice: 176, analystRating: "買い", dividendYield: "3.42%", per: "13.16", pbr: "1.39", note: "IOWN構想の進展と安定した現預金創出", market: "JP" },
  { code: "9433", name: "KDDI", sector: "通信", buyPrice: 2694, currentPrice: 2660, targetPrice: 2812, analystRating: "買い", dividendYield: "2.96%", per: "15.74", pbr: "2.17", note: "", market: "JP" },
  { code: "9434", name: "ソフトバンク", sector: "通信", buyPrice: 0, currentPrice: 213, targetPrice: 234, analystRating: "買い", dividendYield: "4.02%", per: "19.66", pbr: "3.77", note: "AI/データセンター投資と安定配当", market: "JP" },
  { code: "4755", name: "楽天グループ", sector: "通信", buyPrice: 100, currentPrice: 955, targetPrice: 1004, analystRating: "中立", dividendYield: "0.00%", per: "-", pbr: "-", note: "モバイル事業の赤字圧縮と契約数増", market: "JP" },
  // 金融
  { code: "8306", name: "三菱UFJ FG", sector: "金融", buyPrice: 100, currentPrice: 2957, targetPrice: 2596, analystRating: "買い", dividendYield: "2.50%", per: "18.48", pbr: "1.71", note: "金利正常化に伴う業績上振れ観測", market: "JP" },
  { code: "8316", name: "三井住友FG", sector: "金融", buyPrice: 0, currentPrice: 5639, targetPrice: 5217, analystRating: "買い", dividendYield: "2.78%", per: "18.7", pbr: "1.47", note: "金利上昇による利ザヤ拡大期待", market: "JP" },
  { code: "8308", name: "りそなHD", sector: "金融", buyPrice: 0, currentPrice: 2119, targetPrice: 1746, analystRating: "買い", dividendYield: "1.36%", per: "22.93", pbr: "1.79", note: "国内金利上昇の恩恵を最も受ける業態", market: "JP" },
  { code: "8411", name: "みずほFG", sector: "金融", buyPrice: 0, currentPrice: 7559, targetPrice: 6468, analystRating: "買い", dividendYield: "3.30%", per: "21.58", pbr: "1.8", note: "貸出利回りの改善と配当性向の向上", market: "JP" },
  { code: "8604", name: "野村HD", sector: "金融", buyPrice: 0, currentPrice: 1412, targetPrice: 1496, analystRating: "買い", dividendYield: "3.33%", per: "12.24", pbr: "1.28", note: "貯蓄から投資への流れによる収益増", market: "JP" },
  { code: "8601", name: "大和証券", sector: "金融", buyPrice: 0, currentPrice: 1631, targetPrice: 1411, analystRating: "中立", dividendYield: "3.37%", per: "15.02", pbr: "1.36", note: "", market: "JP" },
  { code: "8591", name: "オリックス", sector: "金融", buyPrice: 0, currentPrice: 4743, targetPrice: 4702, analystRating: "買い", dividendYield: "2.53%", per: "15.41", pbr: "1.34", note: "リース、金融、不動産多角化", market: "JP" },
  // 運輸・航空
  { code: "9201", name: "JAL", sector: "運輸・航空", buyPrice: 3000, currentPrice: 3320, targetPrice: 3570, analystRating: "買い", dividendYield: "2.90%", per: "12.19", pbr: "1.33", note: "", market: "JP" },
  { code: "9202", name: "ANA HD", sector: "運輸・航空", buyPrice: 0, currentPrice: 3386, targetPrice: 3550, analystRating: "買い", dividendYield: "1.78%", per: "9.49", pbr: "1.32", note: "インバウンド需要と国際線単価の維持", market: "JP" },
  { code: "9107", name: "川崎汽船", sector: "運輸・航空", buyPrice: 2000, currentPrice: 2032, targetPrice: 2053, analystRating: "中立", dividendYield: "5.01%", per: "4.83", pbr: "0.86", note: "", market: "JP" },
  { code: "9101", name: "日本郵船", sector: "運輸・航空", buyPrice: 0, currentPrice: 5175, targetPrice: 5174, analystRating: "中立", dividendYield: "4.33%", per: "4.78", pbr: "0.76", note: "", market: "JP" },
  { code: "9104", name: "商船三井", sector: "運輸・航空", buyPrice: 100, currentPrice: 5360, targetPrice: 5334, analystRating: "中立", dividendYield: "3.69%", per: "3.98", pbr: "0.63", note: "", market: "JP" },
  // 医薬品
  { code: "4502", name: "武田薬品", sector: "医薬品", buyPrice: 0, currentPrice: 5783, targetPrice: 5383, analystRating: "買い", dividendYield: "4.00%", per: "74.69", pbr: "1.17", note: "新薬パイプラインの進展と高配当維持", market: "JP" },
  { code: "4503", name: "アステラス製薬", sector: "医薬品", buyPrice: 0, currentPrice: 2217, targetPrice: 1938, analystRating: "中立", dividendYield: "3.80%", per: "-", pbr: "-", note: "がん領域新薬の収益貢献と底打ち感", market: "JP" },
  { code: "4528", name: "小野薬品", sector: "医薬品", buyPrice: 0, currentPrice: 2287, targetPrice: 1800, analystRating: "中立", dividendYield: "3.49%", per: "21.46", pbr: "1.45", note: "", market: "JP" },
  // 製造業
  { code: "6301", name: "コマツ", sector: "製造業", buyPrice: 0, currentPrice: 5656, targetPrice: 5100, analystRating: "中立", dividendYield: "3.40%", per: "11.94", pbr: "1.62", note: "米国・インド等のインフラ需要継続", market: "JP" },
  { code: "7203", name: "トヨタ", sector: "製造業", buyPrice: 100, currentPrice: 3725, targetPrice: 3699, analystRating: "買い", dividendYield: "2.73%", per: "9.79", pbr: "1.54", note: "3年以上で3000円優待", market: "JP" },
  { code: "7267", name: "ホンダ", sector: "製造業", buyPrice: 100, currentPrice: 1561, targetPrice: 1704, analystRating: "買い", dividendYield: "4.45%", per: "9.07", pbr: "0.69", note: "PBR1倍割れに伴う株主還元強化", market: "JP" },
  { code: "6501", name: "日立製作所", sector: "製造業", buyPrice: 0, currentPrice: 5219, targetPrice: 5600, analystRating: "強買", dividendYield: "1.60%", per: "38.99", pbr: "4.08", note: "デジタル事業（Lumada）の高成長", market: "JP" },
  { code: "6752", name: "パナソニックHD", sector: "製造業", buyPrice: 0, currentPrice: 2340, targetPrice: 2415, analystRating: "買い", dividendYield: "1.61%", per: "14.85", pbr: "1.21", note: "EV向け電池供給拡大と収益構造改革", market: "JP" },
  { code: "3402", name: "東レ", sector: "製造業", buyPrice: 0, currentPrice: 1159, targetPrice: 1147, analystRating: "買い", dividendYield: "1.72%", per: "23.69", pbr: "1.02", note: "合繊最大手。炭素繊維は世界トップ", market: "JP" },
  { code: "5401", name: "日本製鐵", sector: "製造業", buyPrice: 100, currentPrice: 690, targetPrice: 680, analystRating: "中立", dividendYield: "3.49%", per: "9.2", pbr: "0.64", note: "国内首位", market: "JP" },
  // 半導体・IT
  { code: "6723", name: "ルネサス", sector: "半導体・IT", buyPrice: 0, currentPrice: 2940, targetPrice: 2959, analystRating: "買い", dividendYield: "0%", per: "18.95", pbr: "1.71", note: "半導体市況の回復と生成AI向け需要拡大", market: "JP" },
  { code: "6702", name: "富士通", sector: "半導体・IT", buyPrice: 0, currentPrice: 3646, targetPrice: 4976, analystRating: "買い", dividendYield: "1.37%", per: "30.14", pbr: "4.33", note: "官公庁・金融向けのDX更新需要が堅調", market: "JP" },
  { code: "6701", name: "NEC", sector: "半導体・IT", buyPrice: 0, currentPrice: 4293, targetPrice: 6354, analystRating: "-", dividendYield: "0.74%", per: "32.64", pbr: "3", note: "ITサービス、社会インフラ", market: "JP" },
  { code: "9984", name: "ソフトバンクG", sector: "半導体・IT", buyPrice: 0, currentPrice: 4348, targetPrice: 5456, analystRating: "買い", dividendYield: "0.28%", per: "19.92", pbr: "1.92", note: "", market: "JP" },
  // 商社
  { code: "8002", name: "丸紅", sector: "商社", buyPrice: 0, currentPrice: 5108, targetPrice: 4531, analystRating: "買い", dividendYield: "3.50%", per: "16.87", pbr: "2.33", note: "穀物・電力等の非資源分野の伸長", market: "JP" },
  { code: "8053", name: "住友商事", sector: "商社", buyPrice: 0, currentPrice: 6284, targetPrice: 5982, analystRating: "買い", dividendYield: "2.22%", per: "-", pbr: "-", note: "", market: "JP" },
  { code: "8031", name: "三井物産", sector: "商社", buyPrice: 0, currentPrice: 5115, targetPrice: 4762, analystRating: "買い", dividendYield: "2.24%", per: "16.67", pbr: "1.96", note: "LNG等のエネルギー分野の堅調な収益", market: "JP" },
  { code: "8058", name: "三菱商事", sector: "商社", buyPrice: 0, currentPrice: 4118, targetPrice: 3656, analystRating: "中立", dividendYield: "3.60%", per: "-", pbr: "-", note: "徹底した還元姿勢と非資源分野の強み", market: "JP" },
  // その他日本株
  { code: "6758", name: "ソニーグループ", sector: "娯楽・学習", buyPrice: 0, currentPrice: 3331, targetPrice: 4990, analystRating: "強買", dividendYield: "0.66%", per: "18.3", pbr: "2.59", note: "", market: "JP" },
  { code: "3382", name: "セブン＆アイHD", sector: "小売", buyPrice: 0, currentPrice: 2334, targetPrice: 2382, analystRating: "買い", dividendYield: "2.14%", per: "35.09", pbr: "1.5", note: "買収提案に伴う企業価値再評価", market: "JP" },
  { code: "4385", name: "メルカリ", sector: "小売", buyPrice: 3000, currentPrice: 2967, targetPrice: 3080, analystRating: "買い", dividendYield: "0.00%", per: "18.86", pbr: "4.98", note: "フリマアプリ。米国にも注力", market: "JP" },
  { code: "1605", name: "INPEX", sector: "燃料", buyPrice: 0, currentPrice: 3677, targetPrice: 3229, analystRating: "中立", dividendYield: "2.93%", per: "11.11", pbr: "0.97", note: "原油相場の下支えと高水準の自社株買い", market: "JP" },
  { code: "186A", name: "アストロスケール", sector: "宇宙", buyPrice: 0, currentPrice: 941, targetPrice: 1050, analystRating: "買い", dividendYield: "0%", per: "-", pbr: "20.32", note: "宇宙ゴミ除去の先駆者", market: "JP" },
  // 外国株
  { code: "ORCL", name: "オラクル", sector: "IT", buyPrice: 178, currentPrice: 146, targetPrice: 272, analystRating: "買い", dividendYield: "-", per: "-", pbr: "-", note: "", market: "US" },
  { code: "ARM", name: "ARM Holdings", sector: "半導体", buyPrice: 117, currentPrice: 119, targetPrice: 161, analystRating: "買い", dividendYield: "-", per: "-", pbr: "-", note: "", market: "US" },
  { code: "PLTR", name: "パランティア", sector: "AI", buyPrice: 0, currentPrice: 157, targetPrice: 189, analystRating: "中立", dividendYield: "0%", per: "-", pbr: "-", note: "企業のAI導入を支援するプラットフォーム", market: "US" },
  { code: "NFLX", name: "ネットフリックス", sector: "娯楽", buyPrice: 0, currentPrice: 78, targetPrice: 111, analystRating: "買い", dividendYield: "-", per: "-", pbr: "-", note: "", market: "US" },
  { code: "GOOG", name: "アルファベット", sector: "IT", buyPrice: 328, currentPrice: 339, targetPrice: 345, analystRating: "買い", dividendYield: "-", per: "-", pbr: "-", note: "", market: "US" },
  { code: "AVGO", name: "ブロードコム", sector: "半導体", buyPrice: 349, currentPrice: 320, targetPrice: 458, analystRating: "買い", dividendYield: "-", per: "-", pbr: "-", note: "", market: "US" },
  { code: "NVDA", name: "エヌビディア", sector: "半導体", buyPrice: 0, currentPrice: 178, targetPrice: 0, analystRating: "-", dividendYield: "0.03%", per: "-", pbr: "-", note: "生成AIのインフラ需要が継続", market: "US" },
  { code: "MSFT", name: "マイクロソフト", sector: "IT", buyPrice: 0, currentPrice: 450, targetPrice: 0, analystRating: "-", dividendYield: "0.70%", per: "-", pbr: "-", note: "AzureへのAI実装と収益化フェーズ", market: "US" },
  { code: "LLY", name: "イーライリリー", sector: "医薬品", buyPrice: 0, currentPrice: 1038, targetPrice: 0, analystRating: "-", dividendYield: "0.50%", per: "-", pbr: "-", note: "減量薬ゼップバウンドの供給体制", market: "US" },
  { code: "CRWD", name: "クラウドストライク", sector: "セキュリティ", buyPrice: 0, currentPrice: 445, targetPrice: 0, analystRating: "-", dividendYield: "0%", per: "-", pbr: "-", note: "次世代サイバーセキュリティ", market: "US" },
  { code: "ISRG", name: "インテュイティブサージカル", sector: "医療機器", buyPrice: 0, currentPrice: 523, targetPrice: 0, analystRating: "-", dividendYield: "0%", per: "-", pbr: "-", note: "ロボット手術（ダビンチ）", market: "US" },
];

type AnalysisType = "overview" | "sector" | "individual";

export default function StudyPage() {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysisType, setAnalysisType] = useState<AnalysisType>("overview");
  const [sectorFilter, setSectorFilter] = useState("all");

  const sectors = [...new Set(MOTHER_PORTFOLIO.map((s) => s.sector))];

  const filteredStocks = sectorFilter === "all"
    ? MOTHER_PORTFOLIO
    : MOTHER_PORTFOLIO.filter((s) => s.sector === sectorFilter);

  const jpStocks = MOTHER_PORTFOLIO.filter((s) => s.market === "JP");
  const usStocks = MOTHER_PORTFOLIO.filter((s) => s.market === "US");

  const runAnalysis = async (type: AnalysisType) => {
    setLoading(true);
    setAnalysis("");
    setAnalysisType(type);
    try {
      const res = await fetch("/api/portfolio-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stocks: MOTHER_PORTFOLIO,
          analysisType: type,
        }),
      });
      const data = await res.json();
      setAnalysis(data.analysis || data.error || "分析失敗");
    } catch {
      setAnalysis("AI分析の取得に失敗しました");
    }
    setLoading(false);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">学習用ポートフォリオ分析</h1>
      <p className="text-sm text-zinc-500 mb-6">参考ポートフォリオをAIで分析して投資を学習</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="border border-zinc-800 rounded-lg p-4">
          <div className="text-xs text-zinc-500">銘柄数</div>
          <div className="text-xl font-bold mt-1">
            {MOTHER_PORTFOLIO.length}<span className="text-sm text-zinc-500 ml-1">銘柄</span>
          </div>
          <div className="text-xs text-zinc-500 mt-1">日本{jpStocks.length} / 米国{usStocks.length}</div>
        </div>
        <div className="border border-zinc-800 rounded-lg p-4">
          <div className="text-xs text-zinc-500">セクター数</div>
          <div className="text-xl font-bold mt-1">{sectors.length}</div>
        </div>
        <div className="border border-zinc-800 rounded-lg p-4">
          <div className="text-xs text-zinc-500">買い推奨</div>
          <div className="text-xl font-bold mt-1 text-green-400">
            {MOTHER_PORTFOLIO.filter((s) => s.analystRating.includes("買")).length}
          </div>
        </div>
        <div className="border border-zinc-800 rounded-lg p-4">
          <div className="text-xs text-zinc-500">平均配当利回り</div>
          <div className="text-xl font-bold mt-1 text-yellow-400">
            {(() => {
              const yields = MOTHER_PORTFOLIO
                .map((s) => parseFloat(s.dividendYield))
                .filter((y) => !isNaN(y) && y > 0);
              return yields.length > 0
                ? (yields.reduce((a, b) => a + b, 0) / yields.length).toFixed(2) + "%"
                : "-";
            })()}
          </div>
        </div>
      </div>

      {/* AI Analysis buttons */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => runAnalysis("overview")}
          disabled={loading}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium"
        >
          {loading && analysisType === "overview" ? "分析中..." : "全体分析"}
        </button>
        <button
          onClick={() => runAnalysis("sector")}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium"
        >
          {loading && analysisType === "sector" ? "分析中..." : "セクター分析"}
        </button>
        <button
          onClick={() => runAnalysis("individual")}
          disabled={loading}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg text-sm font-medium"
        >
          {loading && analysisType === "individual" ? "分析中..." : "個別銘柄評価"}
        </button>
      </div>

      {/* AI Analysis result */}
      {(analysis || loading) && (
        <div className="border border-purple-800/50 bg-purple-950/20 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-purple-400 mb-2">
            AI分析結果（{analysisType === "overview" ? "全体" : analysisType === "sector" ? "セクター" : "個別"}）
          </h3>
          {loading ? (
            <div className="text-zinc-400 animate-pulse">分析中...（30秒ほどお待ちください）</div>
          ) : (
            <div className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto">
              {analysis}
            </div>
          )}
        </div>
      )}

      {/* Sector filter */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        <button
          onClick={() => setSectorFilter("all")}
          className={clsx(
            "px-3 py-1 rounded text-sm whitespace-nowrap",
            sectorFilter === "all" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"
          )}
        >
          全て ({MOTHER_PORTFOLIO.length})
        </button>
        {sectors.map((sector) => (
          <button
            key={sector}
            onClick={() => setSectorFilter(sector)}
            className={clsx(
              "px-3 py-1 rounded text-sm whitespace-nowrap",
              sectorFilter === sector ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"
            )}
          >
            {sector} ({MOTHER_PORTFOLIO.filter((s) => s.sector === sector).length})
          </button>
        ))}
      </div>

      {/* Stock table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400">
              <th className="text-left py-2 px-2">コード</th>
              <th className="text-left py-2 px-2">銘柄名</th>
              <th className="text-left py-2 px-2">セクター</th>
              <th className="text-right py-2 px-2">現在値</th>
              <th className="text-right py-2 px-2">目標価格</th>
              <th className="text-right py-2 px-2">上昇余地</th>
              <th className="text-center py-2 px-2">評価</th>
              <th className="text-right py-2 px-2">配当</th>
              <th className="text-right py-2 px-2">PER</th>
              <th className="text-right py-2 px-2">PBR</th>
              <th className="text-left py-2 px-2">メモ</th>
            </tr>
          </thead>
          <tbody>
            {filteredStocks.map((s) => {
              const upside = s.targetPrice > 0 && s.currentPrice > 0
                ? ((s.targetPrice - s.currentPrice) / s.currentPrice * 100)
                : 0;
              return (
                <tr key={s.code} className="border-b border-zinc-800/50 hover:bg-zinc-900">
                  <td className="py-2 px-2 font-mono text-blue-400">
                    <a href={`/detail?ticker=${s.market === "JP" ? s.code + ".T" : s.code}`}>{s.code}</a>
                  </td>
                  <td className="py-2 px-2 font-medium">{s.name}</td>
                  <td className="py-2 px-2 text-xs text-zinc-400">{s.sector}</td>
                  <td className="py-2 px-2 text-right font-mono">
                    {s.market === "US" ? "$" : "¥"}{s.currentPrice.toLocaleString()}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-zinc-400">
                    {s.targetPrice > 0 ? `${s.market === "US" ? "$" : "¥"}${s.targetPrice.toLocaleString()}` : "-"}
                  </td>
                  <td className={clsx("py-2 px-2 text-right font-mono",
                    upside > 10 ? "text-green-400" : upside > 0 ? "text-green-500/70" : upside < -5 ? "text-red-400" : "text-zinc-500"
                  )}>
                    {upside !== 0 ? `${upside > 0 ? "+" : ""}${upside.toFixed(1)}%` : "-"}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={clsx(
                      "text-xs px-1.5 py-0.5 rounded",
                      s.analystRating.includes("強買") ? "bg-green-900/50 text-green-300" :
                      s.analystRating.includes("買") ? "bg-green-900/30 text-green-400" :
                      s.analystRating === "中立" ? "bg-zinc-800 text-zinc-400" :
                      "bg-zinc-800 text-zinc-500"
                    )}>
                      {s.analystRating}
                    </span>
                  </td>
                  <td className={clsx("py-2 px-2 text-right font-mono",
                    parseFloat(s.dividendYield) >= 3 ? "text-yellow-400" : "text-zinc-400"
                  )}>
                    {s.dividendYield || "-"}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-zinc-400">{s.per !== "-" ? s.per : "-"}</td>
                  <td className={clsx("py-2 px-2 text-right font-mono",
                    parseFloat(s.pbr) < 1 ? "text-blue-400" : "text-zinc-400"
                  )}>
                    {s.pbr !== "-" ? s.pbr : "-"}
                  </td>
                  <td className="py-2 px-2 text-xs text-zinc-500 max-w-[200px] truncate" title={s.note}>{s.note || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
