"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { robustJsonParse } from "@/lib/json-utils";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl font-bold text-zinc-100 mt-4 mb-2 border-b border-zinc-700 pb-1">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold text-zinc-100 mt-4 mb-2">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-zinc-200 mt-3 mb-1">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold text-zinc-200 mt-2 mb-1">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="text-sm text-zinc-300 leading-relaxed mb-2">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside space-y-1 text-sm text-zinc-300 mb-2 ml-1">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside space-y-1 text-sm text-zinc-300 mb-2 ml-1">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-zinc-100">{children}</strong>
  ),
  em: ({ children }) => <em className="text-zinc-200 italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-purple-500/50 pl-3 my-2 text-zinc-400 italic">
      {children}
    </blockquote>
  ),
  // NEVER render as code — always convert to readable text
  code: ({ children }) => {
    const text = String(children).trim();
    // Try to parse as JSON and convert to readable format
    const parsed = robustJsonParse(text);
    if (parsed && typeof parsed === "object") {
      const md = jsonToMarkdown(parsed);
      return (
        <span className="block text-sm text-zinc-300 leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={inlineComponents}>
            {md}
          </ReactMarkdown>
        </span>
      );
    }
    // Not JSON — render as plain readable text (no code styling)
    return (
      <span className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
        {children}
      </span>
    );
  },
  // Strip pre tags — content handled by code component above
  pre: ({ children }) => <div className="my-2">{children}</div>,
  table: ({ children }) => (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-zinc-600 text-zinc-200">{children}</thead>
  ),
  tbody: ({ children }) => <tbody className="text-zinc-300">{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-zinc-800">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="text-left py-1.5 px-2 font-semibold text-xs">{children}</th>
  ),
  td: ({ children }) => (
    <td className="py-1.5 px-2 text-xs">{children}</td>
  ),
  hr: () => <hr className="border-zinc-700 my-3" />,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-purple-400 hover:text-purple-300 underline"
    >
      {children}
    </a>
  ),
};

// Simplified components for nested rendering (avoids infinite recursion)
const inlineComponents: Components = {
  ...components,
  code: ({ children }) => (
    <span className="text-sm text-zinc-300">{children}</span>
  ),
};

// Japanese labels for common JSON keys from AI responses
const KEY_LABELS: Record<string, string> = {
  marketOverview: "市場概況",
  riskLevel: "リスクレベル",
  riskComment: "リスクコメント",
  macroRegime: "マクロレジーム",
  overallAdvice: "全体アドバイス",
  disclaimer: "免責事項",
  watchList: "注目リスト",
  taxOptimization: "税金最適化",
  strategies: "戦略",
  shortTerm: "短期戦略",
  midTerm: "中期戦略",
  longTerm: "長期戦略",
  title: "タイトル",
  description: "説明",
  picks: "推薦銘柄",
  ticker: "銘柄コード",
  name: "銘柄名",
  action: "アクション",
  reason: "理由",
  entryPrice: "エントリー価格",
  targetPrice: "利確価格",
  stopLoss: "損切り価格",
  winProbability: "勝率",
  riskReward: "リスクリワード比",
  timeframe: "期間",
  thesis: "テーゼ",
  thesisBreaker: "撤退条件",
  valuation: "バリュエーション",
  dividend: "配当",
  shareholderBenefits: "株主優待",
  holdingsVerdict: "保有銘柄判定",
  portfolioHealth: "ポートフォリオ健全性",
  catalysts: "カタリスト",
  oneLineCall: "今日のコール",
  marketRegime: "市場レジーム",
  overnightSummary: "夜間サマリー",
  keyMovers: "主要変動銘柄",
  sectorHeatmap: "セクターヒートマップ",
  macroSnapshot: "マクロスナップショット",
  todaysCatalysts: "今日のカタリスト",
  holdingsAlert: "保有銘柄アラート",
  tradeIdeas: "トレードアイデア",
  riskDashboard: "リスクダッシュボード",
  sentiment: "センチメント",
  impactScore: "インパクトスコア",
  summary_ja: "要約",
  tradingImplication: "投資アクション",
  biasCheck: "バイアスチェック",
  contrarian: "逆張り視点",
  signal: "シグナル",
  confidence: "確信度",
  reasoning: "推論",
  hot: "HOT",
  cold: "COLD",
  marketVerdict: "市場判定",
  marginBuyCandidates: "信用買い候補",
  shortSellCandidates: "空売り候補",
  existingPositionReview: "既存ポジション管理",
  noTradeReason: "トレード見送り理由",
  weeklyOutlook: "週間アウトルック",
  affectedSectors: "影響セクター",
  affectedTickers: "影響銘柄",
  holdingsImpact: "保有銘柄への影響",
  competitiveImpact: "競争影響",
  supplyChainImpact: "サプライチェーン影響",
  macroImplication: "マクロ影響",
  sectorRotation: "セクターローテーション",
  timeHorizon: "時間軸",
  winners: "勝者",
  losers: "敗者",
  immediate: "即座",
  shortTerm_action: "短期アクション",
  mediumTerm: "中期アクション",
  date: "日付",
  event: "イベント",
  impact: "インパクト",
  move: "変動",
  alert: "アラート",
  type: "タイプ",
  entry: "エントリー",
  target: "ターゲット",
  stop: "ストップ",
  conviction: "確信度",
  yieldCurve: "イールドカーブ",
  dollarYen: "ドル円",
  vix: "VIX",
  fedExpectation: "FRB期待",
  overallRisk: "全体リスク",
  topRisks: "主要リスク",
  blackSwan: "テールリスク",
  sectorConcentration: "セクター集中度",
  topRisk: "最大リスク",
  driftAlert: "ドリフト警告",
  rebalanceActions: "リバランス提案",
  thesisStatus: "テーゼ状態",
  urgency: "緊急度",
  targetAction: "目標アクション",
};

function labelForKey(key: string): string {
  return KEY_LABELS[key] || key;
}

const PRICE_KEYS = new Set(["entryPrice", "targetPrice", "stopLoss", "stopLossPrice", "price", "triggerPrice"]);
const PERCENT_KEYS = new Set(["winProbability", "probabilityOfProfit", "confidence"]);
const SKIP_KEYS = new Set(["ifdoco"]); // rendered inline

function formatValue(key: string, value: string | number | boolean): string {
  if (typeof value === "number") {
    if (PRICE_KEYS.has(key)) return `¥${value.toLocaleString()}`;
    if (PERCENT_KEYS.has(key)) return `${value}%`;
  }
  return String(value);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderIfdoco(ifdoco: any): string {
  if (!ifdoco) return "";
  const lines: string[] = ["", "| 注文 | タイプ | 価格 |", "|---|---|---|"];
  if (ifdoco.entryOrder) lines.push(`| IF新規 | ${ifdoco.entryOrder.type || ""} | ¥${ifdoco.entryOrder.price?.toLocaleString() || "—"} |`);
  if (ifdoco.takeProfit) lines.push(`| OCO利確 | ${ifdoco.takeProfit.type || "指値"} | ¥${ifdoco.takeProfit.price?.toLocaleString() || "—"} |`);
  if (ifdoco.stopLoss) lines.push(`| OCO損切 | ${ifdoco.stopLoss.type || "逆指値"} | ¥${ifdoco.stopLoss.price?.toLocaleString() || "—"} |`);
  lines.push("");
  return lines.join("\n");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jsonToMarkdown(obj: any, depth = 0): string {
  if (obj === null || obj === undefined) return "";
  if (typeof obj === "string") return obj;
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);

  if (Array.isArray(obj)) {
    return obj
      .map((item) => {
        if (typeof item === "string") return `- ${item}`;
        if (typeof item === "object") return jsonToMarkdown(item, depth);
        return `- ${String(item)}`;
      })
      .join("\n");
  }

  const lines: string[] = [];
  const heading = depth === 0 ? "##" : depth === 1 ? "###" : "####";

  for (const [key, value] of Object.entries(obj)) {
    if (SKIP_KEYS.has(key)) {
      lines.push(renderIfdoco(value));
      continue;
    }
    const label = labelForKey(key);
    if (value === null || value === undefined || value === "") continue;

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      lines.push(`**${label}:** ${formatValue(key, value)}`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) continue;
      if (typeof value[0] === "string") {
        lines.push(`**${label}:**`);
        value.forEach((v) => lines.push(`- ${v}`));
      } else {
        lines.push(`${heading} ${label}`);
        value.forEach((v, i) => {
          if (typeof v === "object" && v !== null) {
            if (v.ticker || v.name) {
              const actionBadge = v.action ? ` [${v.action}]` : "";
              lines.push(`**${i + 1}. ${v.ticker || ""} ${v.name || ""}${actionBadge}**`);
            }
            lines.push(jsonToMarkdown(v, depth + 1));
            lines.push("---");
          } else {
            lines.push(`- ${String(v)}`);
          }
        });
      }
    } else if (typeof value === "object") {
      lines.push(`${heading} ${label}`);
      lines.push(jsonToMarkdown(value, depth + 1));
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Aggressively strip ALL code fences and backticks from text.
 * This ensures no code-styled content appears in the output.
 */
function stripAllCodeFences(text: string): string {
  let s = text;
  // Strip fenced code blocks: ```<lang>\n...\n``` — try to convert inner JSON
  s = s.replace(/```[\w]*\s*\n?([\s\S]*?)```/g, (_match, inner) => {
    const trimmed = (inner as string).trim();
    const parsed = robustJsonParse(trimmed);
    if (parsed && typeof parsed === "object") {
      return "\n" + jsonToMarkdown(parsed) + "\n";
    }
    return "\n" + trimmed + "\n";
  });
  // Handle inline code fences: ```json{...}```
  s = s.replace(/```[\w]*\s*(\{[\s\S]*?\})\s*```/g, (_match, inner) => {
    const parsed = robustJsonParse((inner as string).trim());
    if (parsed && typeof parsed === "object") {
      return "\n" + jsonToMarkdown(parsed) + "\n";
    }
    return "\n" + (inner as string).trim() + "\n";
  });
  // Remove any remaining orphan ``` lines
  s = s.replace(/^```[\w]*\s*$/gm, "");
  return s.trim();
}

export default function MarkdownRenderer({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  let cleaned = stripAllCodeFences(content);

  // Try to parse the entire content as JSON and convert to readable markdown
  const robustParsed = robustJsonParse(cleaned);
  if (robustParsed && typeof robustParsed === "object") {
    cleaned = jsonToMarkdown(robustParsed);
  } else if (
    cleaned.includes('"marketOverview"') || cleaned.includes('"oneLineCall"') ||
    cleaned.includes('"strategies"') || cleaned.includes('"riskLevel"') ||
    cleaned.includes('"sentiment"') || cleaned.includes('"marketVerdict"') ||
    cleaned.includes('"holdingsVerdict"') || cleaned.includes('"portfolioHealth"') ||
    cleaned.includes('"overnightSummary"') || cleaned.includes('"keyMovers"') ||
    cleaned.includes('"riskDashboard"') || cleaned.includes('"tradeIdeas"')
  ) {
    // Text contains embedded JSON — try to extract and convert it
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      const candidate = cleaned.slice(start, end + 1);
      const parsed = robustJsonParse(candidate);
      if (parsed && typeof parsed === "object") {
        const before = cleaned.slice(0, start).trim();
        const after = cleaned.slice(end + 1).trim();
        const parts: string[] = [];
        if (before) parts.push(before);
        parts.push(jsonToMarkdown(parsed));
        if (after) parts.push(after);
        cleaned = parts.join("\n\n");
      } else {
        // Even truncation-tolerant parser failed — show as a structured note,
        // not as a flowing JSON dump.
        cleaned =
          "**生成結果が途中で切れた可能性があります** — 再生成するとより整った形で表示されます。\n\n" +
          "以下、AI出力の生データ:\n\n```json\n" +
          candidate.slice(0, 4000) + (candidate.length > 4000 ? "\n... (省略) ..." : "") +
          "\n```";
      }
    }
  } else if (cleaned.trimStart().startsWith("{") || cleaned.trimStart().startsWith("[")) {
    // JSON-like but no known keys, parser failed → wrap in code block
    cleaned = "```json\n" + cleaned + "\n```";
  }

  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
