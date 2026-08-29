/**
 * モーニングブリーフの生成。
 *
 * ここが**唯一の出所**。画面のボタン (POST /api/morning-brief) と
 * 自動生成 (GET /api/cron/daily-brief) の両方がこの関数を通る。
 * プロンプトを2箇所に置くと「画面で見た内容」と「自動生成された内容」が
 * 別物になるので、必ずここだけを直すこと。
 */
import Anthropic from "@anthropic-ai/sdk";
import { HEAVY } from "./model-config";
import { robustJsonParse } from "./json-utils";
import { normalizeAiJsonPrefix } from "./ai-prefix";

export interface HoldingInput {
  code?: string;
  ticker?: string;
  name?: string;
  quantity?: number;
  shares?: number;
  marketValue?: number;
  pnl?: number;
  pnlPercent?: number;
  signal?: string;
}

export interface BriefInput {
  indices?: unknown[];
  news?: unknown[];
  fredData?: unknown[];
  holdings?: HoldingInput[];
  earningsTone?: unknown;
  fedTone?: unknown;
  geopoliticalRisk?: { riskScore?: number; riskLevel?: string; hotSpots?: { category: string; severity: string }[] } | null;
  fearGreed?: { score?: number; rating?: string; previousClose?: number; oneWeekAgo?: number; oneMonthAgo?: number } | null;
  jpxStats?: {
    shortSellingRatio?: { totalRatio: number; signal: string };
    marginTrading?: { ratio: number; buyBalance: number; sellBalance: number; signal: string };
    investorFlows?: { foreigners: { net: number }; individuals: { net: number }; signal: string };
  } | null;
}

export interface BriefResult {
  brief: unknown | null;
  rawText?: string;
}

export function buildBriefPrompt(input: BriefInput): string {
  const { indices, news, fredData, holdings, earningsTone, fedTone, geopoliticalRisk, fearGreed, jpxStats } = input;

  let holdingsContext = "";
  if (holdings && holdings.length > 0) {
    const sorted = [...holdings]
      .sort((a: HoldingInput, b: HoldingInput) => (b.marketValue || 0) - (a.marketValue || 0))
      .slice(0, 15);
    holdingsContext = `
## ユーザー保有銘柄（評価額上位）
${sorted.map((h: HoldingInput) => {
  const ticker = h.code || h.ticker || "不明";
  const name = h.name || ticker;
  const pnlPct = h.pnlPercent || 0;
  const sig = h.signal || "N/A";
  return `- ${ticker}（${name}）: 損益${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}% / シグナル:${sig}`;
}).join("\n")}`;
  }

  return `以下のデータから、機関投資家レベルのモーニングブリーフを作成せよ。

## 世界市場データ
${JSON.stringify(indices?.slice(0, 20), null, 2)}

## 経済指標（クレジットスプレッド・金融ストレス・景気先行指標含む）
${JSON.stringify(fredData?.slice(0, 20), null, 2)}

## 最新ニュース
${JSON.stringify(news?.slice(0, 15), null, 2)}

${earningsTone ? `## 直近の決算トーン: ${JSON.stringify(earningsTone)}` : ""}
${fedTone ? `## 中央銀行スタンス: ${JSON.stringify(fedTone)}` : ""}
${geopoliticalRisk?.riskScore !== undefined ? `## 地政学リスク（GDELT）: スコア${geopoliticalRisk.riskScore}/100 (${geopoliticalRisk.riskLevel}) / ホットスポット: ${geopoliticalRisk.hotSpots?.slice(0, 3).map((h: { category: string; severity: string }) => `${h.category}(${h.severity})`).join(", ") || "なし"}` : ""}
${fearGreed?.score !== undefined ? `## 市場センチメント（CNN Fear & Greed Index）: ${fearGreed.score}/100 (${fearGreed.rating}) / 前日:${fearGreed.previousClose} / 1週前:${fearGreed.oneWeekAgo} / 1月前:${fearGreed.oneMonthAgo}。0=極度の恐怖（逆張り買い?）、100=極度の強欲（危険?）` : ""}
${jpxStats?.shortSellingRatio ? `## JPX空売り比率: ${jpxStats.shortSellingRatio.totalRatio}% (${jpxStats.shortSellingRatio.signal})` : ""}
${jpxStats?.marginTrading ? `## JPX信用倍率: ${jpxStats.marginTrading.ratio}倍 / 買い残${jpxStats.marginTrading.buyBalance}億 / 売り残${jpxStats.marginTrading.sellBalance}億 (${jpxStats.marginTrading.signal})` : ""}
${jpxStats?.investorFlows ? `## 投資部門別: 外国人${jpxStats.investorFlows.foreigners.net > 0 ? "買越" : "売越"} / 個人${jpxStats.investorFlows.individuals.net > 0 ? "買越" : "売越"} (${jpxStats.investorFlows.signal})` : ""}
${holdingsContext}

## 回答形式（厳密にこのJSON形式で返せ）
{
  "date": "YYYY-MM-DD",
  "marketRegime": "現在のマーケットレジーム（例: リスクオン・金融引き締め後期）",
  "overnightSummary": "夜間の主要動向を3〜4文で要約",
  "keyMovers": [
    {
      "ticker": "ティッカー",
      "move": "+3.2%等の変動",
      "reason": "変動理由（1文）"
    }
  ],
  "sectorHeatmap": {
    "hot": ["好調セクター名（理由付き）"],
    "cold": ["不調セクター名（理由付き）"]
  },
  "macroSnapshot": {
    "yieldCurve": "イールドカーブの状態と示唆",
    "dollarYen": "ドル円の方向性と影響",
    "vix": "VIX水準とボラティリティ環境",
    "fedExpectation": "市場の利上げ/利下げ期待"
  },
  "todaysCatalysts": [
    {
      "time": "HH:MM JST",
      "event": "イベント名",
      "expectedImpact": "想定インパクト（1文）"
    }
  ],
  "holdingsAlert": [
    {
      "ticker": "保有銘柄で注意が必要なもの",
      "alert": "注意内容（決算発表、ニュース影響等）",
      "action": "推奨アクション"
    }
  ],
  "tradeIdeas": [
    {
      "type": "long" | "short" | "pair",
      "ticker": "ティッカー",
      "thesis": "トレードアイデアのテーゼ（1文）",
      "entry": "エントリー水準",
      "target": "ターゲット",
      "stop": "ストップ",
      "conviction": "high" | "medium" | "low"
    }
  ],
  "riskDashboard": {
    "overallRisk": "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH",
    "topRisks": ["今日の主要リスク3つ"],
    "blackSwan": "テールリスクシナリオ（可能性は低いが注意すべき事象）"
  },
  "oneLineCall": "今日のマーケットを一言で表現（例: 'リスクオフ継続、ディフェンシブ選好'）"
}`;
}

export const BRIEF_SYSTEM_PROMPT = `あなたは大手証券会社のチーフストラテジストだ。毎朝7時のモーニングミーティングで、ポートフォリオマネージャーたちに今日の戦略を伝える。

モーニングブリーフの原則:
- 最重要情報を最初に（逆ピラミッド型）
- 数字で語る（「上昇」ではなく「+2.3%」）
- アクショナブルであること（「注目」ではなく「〇〇円でエントリー」）
- リスク最優先（良いニュースより悪いニュースを重視）
- 保有銘柄への影響を必ずチェック
- コンセンサスと異なる見方があれば積極的に提示
- 1分で読める簡潔さを維持

【重要】回答はJSONのみ返すこと。コードブロックで囲まないこと。説明文やコメントも不要。純粋なJSONオブジェクトのみを返せ。`;

export async function generateMorningBrief(input: BriefInput, apiKey: string): Promise<BriefResult> {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: HEAVY.claude,
    max_tokens: 8000,
    messages: [{ role: "user", content: buildBriefPrompt(input) }],
    system: BRIEF_SYSTEM_PROMPT,
  });

  const rawOut = message.content.find((b) => b.type === "text")?.text || "";
  const text = normalizeAiJsonPrefix(rawOut);
  const parsed = robustJsonParse(text);
  if (parsed) return { brief: parsed };
  return { brief: null, rawText: text };
}
