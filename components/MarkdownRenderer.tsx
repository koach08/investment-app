"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

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
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="block bg-zinc-900 border border-zinc-700 rounded-md p-3 my-2 text-xs text-zinc-300 overflow-x-auto whitespace-pre">
          {children}
        </code>
      );
    }
    return (
      <code className="bg-zinc-800 text-purple-300 rounded px-1.5 py-0.5 text-xs">
        {children}
      </code>
    );
  },
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
};

function labelForKey(key: string): string {
  return KEY_LABELS[key] || key;
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
    const label = labelForKey(key);
    if (value === null || value === undefined || value === "") continue;

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      lines.push(`**${label}:** ${String(value)}`);
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
              lines.push(`**${i + 1}. ${v.ticker || ""} ${v.name || ""}**`);
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

export default function MarkdownRenderer({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  // Strip all JSON/code fences
  let cleaned = content
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  // If the entire content looks like raw JSON, convert to readable markdown
  if (
    (cleaned.startsWith("{") && cleaned.endsWith("}")) ||
    (cleaned.startsWith("[") && cleaned.endsWith("]"))
  ) {
    try {
      const obj = JSON.parse(cleaned);
      cleaned = jsonToMarkdown(obj);
    } catch {
      // Not valid JSON, continue with the original
    }
  }

  // Strip remaining ```json ... ``` blocks and just keep the inner content as markdown
  cleaned = cleaned.replace(/```json\s*\n([\s\S]*?)```/g, (_match, inner) => {
    // Try to parse and convert the inner JSON to readable text
    const trimmed = inner.trim();
    try {
      const obj = JSON.parse(trimmed);
      return jsonToMarkdown(obj);
    } catch {
      return trimmed;
    }
  });

  // Strip any remaining bare code fences
  cleaned = cleaned.replace(/```\s*\n([\s\S]*?)```/g, "$1");

  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
