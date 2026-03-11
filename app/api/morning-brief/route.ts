import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { HEAVY } from "@/lib/model-config";

interface HoldingInput {
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

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes("ここに")) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 500 });
  }

  const body = await request.json();
  const { indices, news, fredData, holdings, earningsTone, fedTone, geopoliticalRisk } = body;

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

  const prompt = `以下のデータから、機関投資家レベルのモーニングブリーフを作成せよ。

## 世界市場データ
${JSON.stringify(indices?.slice(0, 20), null, 2)}

## 経済指標
${JSON.stringify(fredData?.slice(0, 8), null, 2)}

## 最新ニュース
${JSON.stringify(news?.slice(0, 15), null, 2)}

${earningsTone ? `## 直近の決算トーン: ${JSON.stringify(earningsTone)}` : ""}
${fedTone ? `## 中央銀行スタンス: ${JSON.stringify(fedTone)}` : ""}
${geopoliticalRisk?.riskScore !== undefined ? `## 地政学リスク（GDELT）: スコア${geopoliticalRisk.riskScore}/100 (${geopoliticalRisk.riskLevel}) / ホットスポット: ${geopoliticalRisk.hotSpots?.slice(0, 3).map((h: { category: string; severity: string }) => `${h.category}(${h.severity})`).join(", ") || "なし"}` : ""}
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

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: HEAVY.claude,
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
      system: `あなたは大手証券会社のチーフストラテジストだ。毎朝7時のモーニングミーティングで、ポートフォリオマネージャーたちに今日の戦略を伝える。

モーニングブリーフの原則:
- 最重要情報を最初に（逆ピラミッド型）
- 数字で語る（「上昇」ではなく「+2.3%」）
- アクショナブルであること（「注目」ではなく「〇〇円でエントリー」）
- リスク最優先（良いニュースより悪いニュースを重視）
- 保有銘柄への影響を必ずチェック
- コンセンサスと異なる見方があれば積極的に提示
- 1分で読める簡潔さを維持`,
    });

    const text = message.content.find((b) => b.type === "text")?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json({ brief: parsed });
      } catch {
        return NextResponse.json({ brief: null, rawText: text });
      }
    }
    return NextResponse.json({ brief: null, rawText: text });
  } catch (e) {
    return NextResponse.json(
      { error: `Morning brief failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
