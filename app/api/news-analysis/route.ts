import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { STANDARD } from "@/lib/model-config";

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes("ここに")) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 500 });
  }

  const body = await request.json();
  const { text, holdings } = body;

  if (!text || text.trim().length === 0) {
    return NextResponse.json({ error: "テキストが必要です" }, { status: 400 });
  }

  let holdingsContext = "";
  if (holdings && holdings.length > 0) {
    const tickers = holdings
      .map((h: { code?: string; ticker?: string; name?: string }) => `${h.code || h.ticker}（${h.name || ""}）`)
      .join(", ");
    holdingsContext = `\n\nユーザーの保有銘柄: ${tickers}`;
  }

  const prompt = `以下のニューステキストを機関投資家レベルの深度で投資観点から分析せよ。${holdingsContext}

## ニューステキスト
${text.slice(0, 5000)}

## 分析フレームワーク
1. **ファーストオーダー影響**: 直接影響を受ける企業・セクター
2. **セカンドオーダー影響**: 間接的に影響を受けるサプライチェーン・競合
3. **マクロ影響**: 金利・為替・景気サイクルへの含意
4. **競争構造変化**: 業界内のパワーバランスの変化（5Forces観点）
5. **時間軸**: 短期的な株価反応 vs 中長期的な構造変化

## 回答形式（厳密にこのJSON形式で返せ）
{
  "sentiment": "positive" | "negative" | "neutral",
  "impactScore": 1〜10の数値（市場インパクトの大きさ）,
  "impactType": "structural" | "cyclical" | "event-driven" | "regulatory",
  "affectedSectors": ["影響を受けるセクター名のリスト"],
  "affectedTickers": ["影響を受ける銘柄ティッカーのリスト（日本株は.T付き）"],
  "competitiveImpact": {
    "winners": ["このニュースで恩恵を受ける銘柄（ティッカー+理由）"],
    "losers": ["このニュースで打撃を受ける銘柄（ティッカー+理由）"]
  },
  "supplyChainImpact": "サプライチェーンへの波及効果（1〜2文）",
  "holdingsImpact": [
    {
      "ticker": "保有銘柄ティッカー",
      "impact": "positive" | "negative" | "neutral",
      "severity": 1〜5の深刻度,
      "reason": "影響の理由（1文）",
      "action": "推奨アクション（買い増し/継続保有/一部売却/全売却/様子見）"
    }
  ],
  "tradingImplication": {
    "immediate": "即座に検討すべきアクション（具体的価格水準含む）",
    "shortTerm": "1-2週間の戦略",
    "mediumTerm": "1-3ヶ月の戦略"
  },
  "sectorRotation": "セクターローテーションへの示唆（1〜2文）",
  "macroImplication": "マクロ経済への含意（金利・為替・景気への影響）",
  "biasCheck": "このニュースの報道バイアスや注意点（1〜2文）",
  "contrarian": "コンセンサスと反対の見方があれば提示（1文）",
  "timeHorizon": "short" | "medium" | "long",
  "summary_ja": "ニュースの投資影響要約（3〜4文、日本語）"
}

注意:
- holdingsImpactは保有銘柄がある場合のみ該当するものを含める
- affectedTickersは日本株なら.T付き
- competitiveImpactは業界内の勝者と敗者を明確に特定せよ
- tradingImplicationは3つの時間軸で具体的な価格水準やアクションを含めること
- biasCheckでは報道元の偏りや確認すべき情報を指摘すること
- contrarianでは多数派と異なる視点を提供せよ（無理に作らなくてよい）`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: STANDARD.claude,
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
      system: `あなたは機関投資家レベルのニュース・投資分析エンジンだ。以下の専門性を持つ:
- セクターアナリスト: 業界構造、競争ダイナミクス、サプライチェーン波及を分析
- マクロストラテジスト: 金利・為替・景気サイクルへの含意を評価
- コンペティティブ分析: 勝者と敗者を明確に特定、MOAT変化を検出
- リスクマネージャー: ファーストオーダーとセカンドオーダーのリスクを識別
バイアスを排除し、データに基づいて分析する。コンセンサスと異なる視点があれば積極的に提示する。`,
    });

    const responseText = message.content.find((b) => b.type === "text")?.text || "";

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json({ analysis: parsed });
      } catch {
        return NextResponse.json({ analysis: null, rawText: responseText });
      }
    }

    return NextResponse.json({ analysis: null, rawText: responseText });
  } catch (e) {
    return NextResponse.json(
      { error: `News analysis failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
