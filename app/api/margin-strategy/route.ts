import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { HEAVY } from "@/lib/model-config";

interface CandidateTechnical {
  ticker: string;
  name: string;
  close: number;
  rsi: number | null;
  macdHistogram: number | null;
  bbPosition: string | null;
  signal: string;
  score: number;
  atr14: number | null;
  volume: number;
  avgVolume: number;
  change5d: number;
  change20d: number;
}

interface MarginHolding {
  ticker: string;
  name: string;
  direction: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  entryDate?: string;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes("ここに")) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 500 });
  }

  const body = await request.json();
  const { indices, fredData, news, earningsTone, fedTone, geopoliticalRisk, candidateTickers, marginHoldings } = body;

  // Build candidate tickers section
  let candidatesSection = "";
  if (candidateTickers && candidateTickers.length > 0) {
    candidatesSection = `
## スキャン候補銘柄のテクニカルデータ（${candidateTickers.length}銘柄）
${candidateTickers.map((c: CandidateTechnical) => {
  return `- ${c.ticker}（${c.name}）: 終値${c.close?.toLocaleString()} / RSI=${c.rsi?.toFixed(1) ?? "N/A"} / MACD Hist=${c.macdHistogram?.toFixed(2) ?? "N/A"} / BB=${c.bbPosition ?? "N/A"} / シグナル:${c.signal}(${c.score}) / ATR14=${c.atr14?.toFixed(1) ?? "N/A"} / 出来高=${c.volume?.toLocaleString()} (平均${c.avgVolume?.toLocaleString()}) / 5日変化=${c.change5d?.toFixed(2)}% / 20日変化=${c.change20d?.toFixed(2)}%`;
}).join("\n")}`;
  }

  // Build existing margin holdings section
  let marginSection = "";
  if (marginHoldings && marginHoldings.length > 0) {
    marginSection = `
## 既存信用ポジション（${marginHoldings.length}件）
${marginHoldings.map((h: MarginHolding) => {
  return `- ${h.ticker}（${h.name}）: ${h.direction} / ${h.quantity}株 / 建値${h.entryPrice?.toLocaleString()} / 現在${h.currentPrice?.toLocaleString()} / 損益${h.pnl >= 0 ? "+" : ""}${h.pnl?.toLocaleString()}円(${h.pnlPercent >= 0 ? "+" : ""}${h.pnlPercent?.toFixed(1)}%)${h.entryDate ? ` / 建日${h.entryDate}` : ""}`;
}).join("\n")}`;
  }

  // Build earnings tone section
  let earningsSection = "";
  if (earningsTone) {
    earningsSection = `
## 決算トーン分析
- 全体トーン: ${earningsTone.overall_tone}
- ガイダンス改定: ${earningsTone.guidance_revision}
- 強気シグナル: ${earningsTone.bullish_signals?.join(", ") || "なし"}
- 弱気シグナル: ${earningsTone.bearish_signals?.join(", ") || "なし"}
- 要約: ${earningsTone.summary_ja || "N/A"}`;
  }

  // Build central bank stance section
  let fedSection = "";
  if (fedTone) {
    if (fedTone.fed) {
      fedSection += `
## FRBスタンス
- タカ派: ${fedTone.fed.hawkish_score} / ハト派: ${fedTone.fed.dovish_score} / スタンス: ${fedTone.fed.stance}
- 利上げ確率: ${fedTone.fed.rate_hike_probability}%
- 要約: ${fedTone.fed.summary_ja || "N/A"}`;
    }
    if (fedTone.boj) {
      fedSection += `
## 日銀スタンス
- タカ派: ${fedTone.boj.hawkish_score} / ハト派: ${fedTone.boj.dovish_score} / スタンス: ${fedTone.boj.stance}
- 利上げ確率: ${fedTone.boj.rate_hike_probability}%
- 要約: ${fedTone.boj.summary_ja || "N/A"}`;
    }
  }

  const prompt = `あなたはヘッジファンドの信用取引デスクのチーフトレーダーである。感情を排し、確率論と定量分析のみで判断せよ。

## 信用取引10箇条（絶対遵守）
1. 1トレードのリスクは総資金の2%以内
2. ストップロスはATRベース（買い: 現値-2×ATR、売り: 現値+2×ATR）
3. リスクリワード比は最低1:2（1:3以上推奨）
4. 相場環境が悪ければNO_TRADE判定を出す勇気を持て
5. 同時保有ポジションは最大3つまで
6. 信用金利コスト（買い年2.80%、貸株料年1.10%）を常に意識
7. 保有期間は原則1〜10営業日、最長でも制度信用6ヶ月
8. 維持率30%を割り込むシナリオを常にシミュレーション
9. 建玉は必ずIFDOCO注文で管理（IF新規→OCO利確+損切）
10. 「何もしない」は最高のトレードである

## SBI証券信用取引仕様
- 信用買い金利: 年2.80%（制度）/ 年2.80%（一般）
- 貸株料: 年1.10%（制度）
- 最低維持率: 30%
- IFDOCO注文: IF注文（新規建て）→ OCO注文（利確指値 + 損切逆指値）
- 注文単位: 100株

## 5軸分析フレームワーク
1. **マクロ環境**: 景気サイクル、金融政策、地政学リスク、通貨動向
2. **セクターモメンタム**: セクターローテーション、資金フロー、相対強度
3. **テクニカル**: RSI、MACD、ボリンジャーバンド、ATR、出来高分析
4. **カタリスト**: 決算、経済指標、政策イベント、需給イベント（SQ等）
5. **需給**: 信用残、貸借倍率、空売り比率、外国人動向

${candidatesSection}
${marginSection}
${earningsSection}
${fedSection}
${geopoliticalRisk?.riskScore !== undefined ? `
## 地政学リスク（GDELT リアルタイム）
- リスクスコア: ${geopoliticalRisk.riskScore}/100 (${geopoliticalRisk.riskLevel})
- ホットスポット: ${geopoliticalRisk.hotSpots?.map((h: { category: string; severity: string }) => `${h.category}(${h.severity})`).join(", ") || "なし"}
- 市場影響カテゴリ: ${geopoliticalRisk.marketImpactCategories?.join(", ") || "なし"}
- 注意: 地政学リスクが高い場合、信用取引はNO_TRADE判定を強く検討せよ` : ""}

## 現在の世界市場データ
${JSON.stringify(indices?.slice(0, 20), null, 2)}

## 経済指標
${JSON.stringify(fredData?.slice(0, 8), null, 2)}

## 最新ニュース
${JSON.stringify(news?.slice(0, 10), null, 2)}

## 回答形式（厳密にこのJSON形式で返してください）
{
  "marketVerdict": {
    "signal": "GO" | "CAUTION" | "NO_TRADE",
    "confidence": 0-100,
    "reasoning": "判定理由（2-3文）",
    "keyFactors": ["判定に影響した主要因（3-5個）"],
    "volatilityRegime": "LOW_VOL" | "NORMAL" | "HIGH_VOL" | "CRISIS",
    "trendDirection": "BULLISH" | "NEUTRAL" | "BEARISH"
  },
  "marginBuyCandidates": [
    {
      "ticker": "ティッカー",
      "name": "銘柄名",
      "direction": "信用買い",
      "conviction": "HIGH" | "MEDIUM" | "LOW",
      "probabilityOfProfit": 0-100,
      "thesis": "なぜ今この銘柄を信用買いするのか（1-2文）",
      "thesisBreaker": "このテーゼが崩れる条件（この条件で即撤退）",
      "technicalSetup": "テクニカル根拠（RSI/MACD/BB/出来高の状態）",
      "entryPrice": エントリー価格,
      "targetPrice": 利確目標価格,
      "stopLossPrice": 損切り価格,
      "ifdoco": {
        "entryOrder": { "type": "指値" | "成行" | "逆指値", "price": 価格, "condition": "条件説明" },
        "takeProfit": { "type": "指値", "price": 利確価格 },
        "stopLoss": { "type": "逆指値", "price": 損切り価格, "triggerPrice": トリガー価格 }
      },
      "holdingPeriod": "推奨保有期間（例: 3-5営業日）",
      "exitDate": "YYYY-MM-DD",
      "positionSize": "推奨ポジションサイズ（例: 100株 or 200株）",
      "estimatedInterestCost": "想定金利コスト（例: 約○○円/日）",
      "marginRequirement": "必要証拠金概算（例: 約○○万円）",
      "catalysts": ["この銘柄に関連するカタリスト"],
      "atrBasis": "ATR14の値と、それに基づくSL/TP算出根拠"
    }
  ],
  "shortSellCandidates": [
    {
      同じMarginTrade構造で "direction": "空売り"
    }
  ],
  "noTradeReason": "NO_TRADE判定の場合の詳細理由（GO/CAUTIONの場合はnull）",
  "existingPositionReview": [
    {
      "ticker": "ティッカー",
      "action": "継続保有" | "利確決済" | "損切り決済" | "建値変更" | "ポジション縮小",
      "urgency": "HIGH" | "MEDIUM" | "LOW",
      "reason": "判断理由（1-2文）",
      "targetAction": "具体的なアクション（例: 明日の寄付で成行決済）"
    }
  ],
  "riskDashboard": {
    "recommendedMarginUtilization": "推奨証拠金使用率（例: 40%以下）",
    "maxConcurrentPositions": 最大同時ポジション数,
    "dailyInterestCostEstimate": "1日あたりの金利コスト概算",
    "weeklyDecayCost": "週あたりの時間的コスト",
    "marginMaintenanceBuffer": "維持率バッファ（例: 現在の維持率と30%ラインの距離）",
    "portfolioHeatLevel": "LOW" | "MEDIUM" | "HIGH" | "OVERHEATED"
  },
  "weeklyOutlook": "今週の信用取引環境の見通し（3-4文）",
  "disclaimer": "信用取引は元本を超える損失が発生する可能性があります。本分析は情報提供目的であり、投資助言ではありません。"
}

重要な注意:
- 日本株は末尾に.Tをつけてください（例: 7203.T）
- NO_TRADE判定を恐れるな。相場環境が悪い時は候補銘柄を空にしてnoTradeReasonを詳述せよ
- IFDOCO値は必ずSBI証券で入力可能な具体的数値で示せ（100株単位）
- ATRベースでSL/TPを算出し、その計算根拠をatrBasisに記述せよ
- 金利コストと保有期間を考慮した実質リターンを意識せよ
- 既存ポジションがある場合、その管理を最優先で記述せよ
- marginBuyCandidatesとshortSellCandidatesは合計3銘柄以内
- CAUTIONの場合はポジションサイズを通常の半分に抑えることを推奨
- 勝率(probabilityOfProfit)はテクニカル+ファンダ+需給から合理的に推定せよ`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: HEAVY.claude,
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
      system: `あなたはヘッジファンドの信用取引デスクのチーフトレーダーだ。以下の専門性を持つ:

【信用取引ストラテジスト】ATRベースのリスク管理、IFDOCO注文戦略、ポジションサイジング、金利コスト最適化のプロフェッショナル。
【テクニカルアナリスト】RSI、MACD、ボリンジャーバンド、出来高分析を組み合わせたマルチタイムフレーム分析。チャートパターンの確率論的評価。
【マクロストラテジスト】景気サイクル、金融政策、地政学リスクからリスクオン/リスクオフ環境を判定。セクターローテーションの方向性を評価。
【リスクマネージャー】証拠金維持率管理、最大ドローダウン制限、相関リスク評価。「何もしない」判断を最も重要なリスク管理と位置づける。

感情を完全に排除し、確率論とデータに基づいて判断する。NO_TRADEの判定を躊躇しない。信用取引のリスクを常に最優先で考慮する。

【重要】回答はJSONのみ返すこと。\`\`\`json等のコードブロックで囲まないこと。説明文やコメントも不要。純粋なJSONオブジェクトのみを返せ。`,
    });

    const text = message.content.find((b) => b.type === "text")?.text || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json({ strategy: parsed });
      } catch {
        return NextResponse.json({ strategy: null, rawText: text });
      }
    }

    return NextResponse.json({ strategy: null, rawText: text });
  } catch (e) {
    return NextResponse.json(
      { error: `Margin strategy generation failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
