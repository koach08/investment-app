import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { STANDARD } from "@/lib/model-config";

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes("ここに")) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 500 });
  }

  const body = await request.json();
  const { ticker, name, currentPrice, financialData, peers } = body;

  if (!ticker) {
    return NextResponse.json({ error: "ticker は必須です" }, { status: 400 });
  }

  const prompt = `以下の銘柄の機関投資家レベルのバリュエーション分析を実施せよ。

## 対象銘柄
- ティッカー: ${ticker}
- 銘柄名: ${name || ticker}
- 現在株価: ${currentPrice || "不明"}
${financialData ? `- 財務データ: ${JSON.stringify(financialData, null, 2)}` : ""}
${peers ? `- 比較銘柄: ${JSON.stringify(peers)}` : ""}

## 分析フレームワーク

### 1. マルチプル分析（Comps）
- PER（予想/実績）と業界平均との比較
- PBR と ROE の関係性
- EV/EBITDA（可能な場合）
- PSR（高成長企業の場合）
- 配当利回りと配当性向
- ヒストリカル平均との乖離（割安/割高の程度）

### 2. 簡易DCF分析
- 過去の成長率から将来の成長率を推定
- ターミナルバリューの算出（永久成長率法）
- WACC の推定（β値、リスクフリーレート、エクイティリスクプレミアム）
- フェアバリューレンジの算出

### 3. 配当割引モデル（配当株の場合）
- 配当成長率の推定
- Gordon Growth Model による理論株価

### 4. シナリオ分析
- Bull Case: 楽観シナリオの目標株価と前提条件
- Base Case: 基本シナリオの目標株価と前提条件
- Bear Case: 悲観シナリオの目標株価と前提条件

## 回答形式（厳密にこのJSON形式で返せ）
{
  "ticker": "${ticker}",
  "name": "${name || ticker}",
  "currentPrice": ${currentPrice || 0},
  "multiples": {
    "per": { "current": 数値, "industryAvg": 数値, "historical5yAvg": 数値, "verdict": "割安/適正/割高" },
    "pbr": { "current": 数値, "industryAvg": 数値, "verdict": "割安/適正/割高" },
    "dividendYield": { "current": "X.X%", "industryAvg": "X.X%", "payoutRatio": "X%" },
    "evEbitda": { "current": 数値, "industryAvg": 数値, "verdict": "割安/適正/割高" }
  },
  "dcfAnalysis": {
    "assumptions": {
      "revenueGrowth": "X%",
      "terminalGrowth": "X%",
      "wacc": "X%",
      "marginAssumption": "説明"
    },
    "fairValue": 数値,
    "upside": "X%（現在株価からの乖離）"
  },
  "scenarios": {
    "bull": { "price": 数値, "probability": "X%", "keyAssumption": "前提条件" },
    "base": { "price": 数値, "probability": "X%", "keyAssumption": "前提条件" },
    "bear": { "price": 数値, "probability": "X%", "keyAssumption": "前提条件" }
  },
  "moatAssessment": {
    "type": "MOAT の種類（ネットワーク効果/スイッチングコスト/規模の経済/無形資産/コスト優位性/なし）",
    "strength": 1〜5の数値,
    "durability": "堀の持続期間の推定（短期/中期/長期）",
    "explanation": "MOAT の説明（1-2文）"
  },
  "peerComparison": [
    {
      "ticker": "比較銘柄ティッカー",
      "name": "銘柄名",
      "per": 数値,
      "pbr": 数値,
      "dividendYield": "X%",
      "roePct": 数値,
      "verdict": "対象銘柄との比較コメント（1文）"
    }
  ],
  "investmentRating": "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell",
  "targetPrice": 数値,
  "riskReward": "リスクリワード比（例: 1:2.5）",
  "keyRisks": ["主要リスク3つ"],
  "catalysts": ["今後のカタリスト3つ"],
  "oneLiner": "この銘柄を一言で表現（例: '割安な高配当ディフェンシブ銘柄'）",
  "summary_ja": "バリュエーション分析の要約（3〜4文、日本語）"
}

注意:
- 日本株は末尾に.Tをつける
- 数値が不明な場合は推定値を使い、推定であることを明記
- 同業他社比較は最低3社含める
- MOATの強度は厳格に評価（安易に高評価をつけない）
- scenarios の probability の合計は100%`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: STANDARD.claude,
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
      system: `あなたは機関投資家レベルのバリュエーション・アナリストだ。以下の専門性を持つ:

【マルチプル分析】同業他社との相対バリュエーション、ヒストリカル平均との比較を厳格に実施
【DCF分析】保守的な前提でフェアバリューを算出。成長率は過度に楽観的にしない
【MOAT評価】経済的堀の種類と強度を厳格に評価。堀がない企業には容赦なく「なし」と判定
【シナリオ分析】Bull/Base/Bearの確率加重で期待リターンを算出

数字と根拠に基づき分析する。「割安かもしれない」のような曖昧な表現は禁止。「PER 12.5倍は業界平均15.3倍を18%下回り、割安」のように定量的に述べよ。`,
    });

    const text = message.content.find((b) => b.type === "text")?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json({ valuation: parsed });
      } catch {
        return NextResponse.json({ valuation: null, rawText: text });
      }
    }
    return NextResponse.json({ valuation: null, rawText: text });
  } catch (e) {
    return NextResponse.json(
      { error: `Valuation analysis failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
