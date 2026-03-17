import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { HEAVY } from "@/lib/model-config";

interface HoldingInput {
  code?: string;
  ticker?: string;
  name?: string;
  quantity?: number;
  shares?: number;
  avgPrice?: number;
  currentPrice?: number;
  marketValue?: number;
  pnl?: number;
  pnlPercent?: number;
  signal?: string;
  score?: number;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes("ここに")) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 500 });
  }

  const body = await request.json();
  const { indices, fredData, news, investmentProfile, holdings, earningsTone, fedTone, geopoliticalRisk, fearGreed, jpxStats } = body;

  // Build holdings section
  let holdingsSection = "";
  if (holdings && holdings.length > 0) {
    const sorted = [...holdings]
      .sort((a: HoldingInput, b: HoldingInput) => (b.marketValue || 0) - (a.marketValue || 0))
      .slice(0, 10);
    holdingsSection = `
## ユーザーの保有銘柄とシグナル（評価額上位、全${holdings.length}銘柄中上位${sorted.length}件）
${sorted.map((h: HoldingInput) => {
  const ticker = h.code || h.ticker || "不明";
  const name = h.name || ticker;
  const qty = h.quantity || h.shares || 0;
  const avg = h.avgPrice || 0;
  const cur = h.currentPrice || 0;
  const mv = h.marketValue || 0;
  const pnl = h.pnl || 0;
  const pnlPct = h.pnlPercent || 0;
  const sig = h.signal || "N/A";
  const sc = h.score ?? "N/A";
  return `- ${ticker}（${name}）: ${qty}株 / 取得${avg.toLocaleString()}円 / 現在${cur.toLocaleString()}円 / 評価額${mv.toLocaleString()}円 / 損益${pnl >= 0 ? "+" : ""}${pnl.toLocaleString()}円(${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%) / シグナル:${sig}(${sc})`;
}).join("\n")}`;
  }

  // Build earnings tone section
  let earningsSection = "";
  if (earningsTone) {
    earningsSection = `
## 決算トーン分析
- 全体トーン: ${earningsTone.overall_tone} (-1〜1、-1=非常にネガティブ、1=非常にポジティブ)
- ガイダンス改定: ${earningsTone.guidance_revision}
- アナリストQAトーン: ${earningsTone.analyst_qa_tone}
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
- タカ派スコア: ${fedTone.fed.hawkish_score} / ハト派スコア: ${fedTone.fed.dovish_score}
- スタンス: ${fedTone.fed.stance}
- 利上げ確率: ${fedTone.fed.rate_hike_probability}%
- 要約: ${fedTone.fed.summary_ja || "N/A"}`;
    }
    if (fedTone.boj) {
      fedSection += `
## 日銀スタンス
- タカ派スコア: ${fedTone.boj.hawkish_score} / ハト派スコア: ${fedTone.boj.dovish_score}
- スタンス: ${fedTone.boj.stance}
- 利上げ確率: ${fedTone.boj.rate_hike_probability}%
- 要約: ${fedTone.boj.summary_ja || "N/A"}`;
    }
  }

  // Build geopolitical risk section
  let geoSection = "";
  if (geopoliticalRisk && geopoliticalRisk.riskScore !== undefined) {
    geoSection = `
## 地政学リスク（GDELT リアルタイム分析）
- リスクスコア: ${geopoliticalRisk.riskScore}/100 (${geopoliticalRisk.riskLevel})
- ホットスポット: ${geopoliticalRisk.hotSpots?.map((h: { category: string; severity: string }) => `${h.category}(${h.severity})`).join(", ") || "なし"}
- 市場影響カテゴリ: ${geopoliticalRisk.marketImpactCategories?.join(", ") || "なし"}
- 主要イベント: ${geopoliticalRisk.topEvents?.slice(0, 5).map((e: { title: string; tone: number }) => `${e.title} (tone:${e.tone?.toFixed(1)})`).join(" / ") || "N/A"}`;
  }

  // Build Fear & Greed section
  let fearGreedSection = "";
  if (fearGreed && fearGreed.score !== undefined) {
    fearGreedSection = `
## 市場センチメント（CNN Fear & Greed Index）
- 現在スコア: ${fearGreed.score}/100 (${fearGreed.rating})
- 前日: ${fearGreed.previousClose} / 1週間前: ${fearGreed.oneWeekAgo} / 1ヶ月前: ${fearGreed.oneMonthAgo} / 1年前: ${fearGreed.oneYearAgo}
${fearGreed.components?.map((c: { name: string; score: number; rating: string }) => `- ${c.name}: ${c.score} (${c.rating})`).join("\n") || ""}
※ 0=極度の恐怖（逆張り買いシグナルの可能性）、100=極度の強欲（危険信号）。ウォーレン・バフェットの格言「他人が恐れている時に貪欲に」を数値化したもの。`;
  }

  // Build JPX stats section
  let jpxSection = "";
  if (jpxStats) {
    if (jpxStats.shortSellingRatio) {
      const ss = jpxStats.shortSellingRatio;
      jpxSection += `
## JPX空売り比率（${ss.date}）
- 空売り比率: ${ss.totalRatio}%
- 判定: ${ss.signal}
※ 40%超は売り圧力大だが、過度な空売りは踏み上げ（ショートスクイーズ）リスクあり＝底打ちシグナルにもなる`;
    }
    if (jpxStats.marginTrading) {
      const mt = jpxStats.marginTrading;
      jpxSection += `
## JPX信用取引残高（${mt.date}）
- 買い残: ${mt.buyBalance}億円 / 売り残: ${mt.sellBalance}億円
- 信用倍率: ${mt.ratio}倍
- 判定: ${mt.signal}
※ 信用倍率が高い＝将来の売り圧力（利確や追証で強制決済される可能性）。低い＝ショートカバー期待`;
    }
    if (jpxStats.investorFlows) {
      const fl = jpxStats.investorFlows;
      jpxSection += `
## 投資部門別売買動向（${fl.date}）
- 外国人: 買${fl.foreigners.buy} / 売${fl.foreigners.sell} / 差引${fl.foreigners.net > 0 ? "+" : ""}${fl.foreigners.net}
- 個人: 買${fl.individuals.buy} / 売${fl.individuals.sell} / 差引${fl.individuals.net > 0 ? "+" : ""}${fl.individuals.net}
- 法人: 買${fl.institutions.buy} / 売${fl.institutions.sell} / 差引${fl.institutions.net > 0 ? "+" : ""}${fl.institutions.net}
- 判定: ${fl.signal}
※ 外国人が売り越しで個人が買い越しの場合、個人が「受け手」になっている危険パターン。逆は好機の可能性`;
    }
  }

  const prompt = `あなたは機関投資家レベルの冷徹なクオンツ・投資ストラテジストである。忖度は一切禁止。全ユーザーに対して厳格にデータドリブンな分析を行え。

## 分析フレームワーク（Institutional Grade）

### 1. マクロ環境分析
- 景気サイクルの現在地を特定（拡大期/ピーク/後退期/底）
- 金融政策スタンス（FRB/日銀）の利上げ・利下げサイクルを評価
- イールドカーブの形状から景気後退リスクを判定
- ドル円・金利差の方向性を評価

### 2. ポートフォリオ・リバランス分析
- 保有銘柄のセクター配分ドリフトを計算（目標配分からの乖離率）
- 集中リスクの検出（単一銘柄が全体の15%超は警告）
- 地域分散の評価（日本株/米国株/その他の比率）
- 投資スタイルバランス（成長/バリュー/配当）の偏りを指摘
- リバランス推奨がある場合は具体的な売買量を提案

### 3. バリュエーション分析
- 推奨銘柄には必ずPER/PBR/PSR等のマルチプル比較を含める
- 同業他社との相対バリュエーションを提示
- DCF的な考え方でフェアバリューレンジを示す
- 配当割引モデルでの配当株の適正価格を計算

### 4. カタリスト・イベント分析
- 今後1-2週間のカタリスト（決算発表、配当権利日、株主総会等）
- マクロイベント（FOMC、日銀会合、雇用統計等）のインパクト予測
- 業種固有のカタリスト（規制変更、新製品発表等）

### 5. 損切り/リバランス厳格ルール
- 損切り提案を躊躇するな。含み損銘柄は明確に「損切り推奨」か「継続保有の根拠」を述べよ
- 信用取引銘柄にはIFDOCO注文設定を必ず提案せよ（エントリー・利確・損切りの3点セット）
- 利確/損切り水準はATR（Average True Range）ベースで算出根拠を示せ
- 信用取引の保有期間は明示し、決済予定日を提案せよ
- 曖昧な表現（「様子見」のみ等）は禁止。具体的な価格とアクションを常に示せ
- 含み益が20%を超える銘柄は部分利確を検討せよ
- ポジションサイズが過大な銘柄は縮小を提案せよ

### 6. テーゼ・トラッキング
- 各推奨銘柄に投資テーゼ（なぜ買うのか）を1文で明示
- テーゼが崩れる条件（ストップ条件）を具体的に記述
- 既存保有銘柄のテーゼが有効か無効かを判定

## 投資家プロフィール
${investmentProfile ? JSON.stringify(investmentProfile, null, 2) : "一般的な個人投資家（日本在住）"}
${holdingsSection}
${earningsSection}
${fedSection}
${geoSection}
${fearGreedSection}
${jpxSection}

## 現在の世界市場データ
${JSON.stringify(indices?.slice(0, 20), null, 2)}

## 経済指標（FRED: クレジット・金融ストレス・景気先行指標含む）
${JSON.stringify(fredData?.slice(0, 20), null, 2)}

## 最新ニュース
${JSON.stringify(news?.slice(0, 10), null, 2)}

## 回答形式（厳密にこのJSON形式で返してください）
{
  "marketOverview": "今日の市場環境を3〜4文で要約（景気サイクル位置、金融政策方向性を含む）",
  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH",
  "riskComment": "リスク判断の理由（1〜2文）",
  "macroRegime": "現在のマクロレジーム（例: 金融引き締め後期・景気減速初期）",
  "portfolioHealth": {
    "sectorConcentration": "セクター集中度の評価（問題なし/やや偏り/要リバランス）",
    "topRisk": "最大のポートフォリオリスク（1文）",
    "driftAlert": "配分ドリフト警告（あれば具体的に）",
    "rebalanceActions": ["具体的なリバランスアクション（例: テック比率を30%→25%に縮小）"]
  },
  "catalysts": [
    {
      "date": "YYYY-MM-DD",
      "event": "イベント名",
      "impact": "想定インパクト（1文）",
      "affectedTickers": ["影響銘柄"]
    }
  ],
  "strategies": {
    "shortTerm": {
      "title": "短期戦略（信用取引含む）",
      "description": "戦略の説明（2〜3文）",
      "picks": [
        {
          "ticker": "ティッカーコード",
          "name": "銘柄名",
          "action": "買い" | "売り（空売り）" | "様子見",
          "reason": "推薦理由（1〜2文）",
          "entryPrice": 想定エントリー価格,
          "targetPrice": 利確目標,
          "stopLoss": 損切りライン,
          "winProbability": 0〜100の勝率,
          "riskReward": "リスクリワード比（例: 1:2.5）",
          "timeframe": "1〜5日",
          "thesis": "投資テーゼ（なぜ今この銘柄なのか1文）",
          "thesisBreaker": "テーゼが崩れる条件（この条件で撤退）",
          "valuation": "バリュエーション根拠（PER/PBR/同業比較等）",
          "dividend": "配当利回り（該当する場合）",
          "shareholderBenefits": "株主優待の有無と内容",
          "ifdoco": {
            "entryOrder": { "type": "指値" | "成行" | "逆指値", "price": エントリー価格 },
            "takeProfit": { "type": "指値", "price": 利確価格 },
            "stopLoss": { "type": "逆指値", "price": 損切り価格 }
          },
          "holdingPeriod": "推奨保有期間（例: 3〜5営業日）",
          "exitDate": "YYYY-MM-DD形式の決済予定日"
        }
      ]
    },
    "midTerm": {
      "title": "中期戦略（数週間〜数ヶ月）",
      "description": "戦略の説明",
      "picks": [同様のフォーマットで2〜3銘柄]
    },
    "longTerm": {
      "title": "長期戦略（半年〜数年）",
      "description": "戦略の説明",
      "picks": [同様のフォーマットで2〜3銘柄]
    }
  },
  "holdingsVerdict": [
    {
      "ticker": "保有銘柄ティッカー",
      "action": "継続保有" | "部分利確" | "全利確" | "損切り" | "買い増し",
      "reason": "判断理由（1文）",
      "thesisStatus": "有効" | "要注意" | "崩壊"
    }
  ],
  "overallAdvice": "全体的なポートフォリオアドバイス（3〜4文）。保有銘柄の問題点があれば遠慮なく指摘せよ。リバランス提案を含む。",
  "watchList": ["注目すべきイベントや指標を5つ（日付付き）"],
  "taxOptimization": "税金最適化のヒント（含み損銘柄の損益通算、NISA枠活用等）",
  "disclaimer": "投資判断は自己責任でお願いします。本分析は参考情報であり、投資助言ではありません。"
}

重要な注意：
- 日本株は末尾に.Tをつけてください（例: 7203.T）
- 配当利回りと株主優待の情報があれば必ず含めてください
- 勝率は過去のテクニカルパターンとファンダメンタルズから合理的に推定してください
- リスクリワード比を明示してください
- 具体的な価格水準を必ず示してください
- 信用取引の短期銘柄にはifdoco, holdingPeriod, exitDateを必ず含めてください
- 保有銘柄がある場合、それらの継続/利確/損切り判断を最優先で述べよ
- holdingsVerdictには保有銘柄全てについて判断を含めよ（省略禁止）
- catalystsには今後2週間の主要イベントを含めよ
- portfolioHealthではセクター配分・地域配分・スタイルバランスを評価せよ
- taxOptimizationでは含み損銘柄の損益通算タイミングやNISA活用を提案せよ
- 各推奨銘柄のthesisとthesisBreakerは必須。曖昧な記述は禁止
- valuationフィールドではPER/PBR/配当利回りの同業比較を含めよ`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: HEAVY.claude,
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
      system: `あなたは機関投資家レベルの冷徹なクオンツ・ストラテジストだ。以下の専門性を持つ:

【エクイティリサーチ】決算分析のプロ。Beat/Missの定量化、ガイダンス改定の意味、アナリストQAのトーン変化を読み取る。投資テーゼの構築と追跡を行う。
【ウェルスマネジメント】ポートフォリオ全体を俯瞰し、セクター配分ドリフト、集中リスク、税金最適化（損益通算、NISA枠活用）を提案する。
【コンペティティブ分析】業界内での競争ポジション、MOAT（経済的堀）の強度、マーケットシェアの変化を評価する。
【マクロストラテジー】景気サイクル、金融政策、イールドカーブから全体のリスクオン/リスクオフ環境を判定する。

データと確率に基づき、忖度なしで分析する。損切りや撤退の提案を躊躇しない。投資助言ではなく分析情報の提供である。`,
    });

    const text = message.content.find((b) => b.type === "text")?.text || "";

    // Parse JSON from response
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
      { error: `Strategy generation failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
