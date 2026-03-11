import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { STANDARD } from "@/lib/model-config";

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
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes("ここに")) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 500 });
  }

  const body = await request.json();
  const { messages, context } = body;

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  // Build holdings context
  let holdingsInfo = "";
  if (context?.holdings && context.holdings.length > 0) {
    const sorted = [...context.holdings]
      .sort((a: HoldingInput, b: HoldingInput) => (b.marketValue || 0) - (a.marketValue || 0))
      .slice(0, 15);
    holdingsInfo = `
## ユーザーの保有銘柄
${sorted.map((h: HoldingInput) => {
  const ticker = h.code || h.ticker || "不明";
  const name = h.name || ticker;
  const qty = h.quantity || h.shares || 0;
  const avg = h.avgPrice || 0;
  const cur = h.currentPrice || 0;
  const pnl = h.pnl || 0;
  const pnlPct = h.pnlPercent || 0;
  return `- ${ticker}（${name}）: ${qty}株 / 取得${avg.toLocaleString()}円 / 現在${cur.toLocaleString()}円 / 損益${pnl >= 0 ? "+" : ""}${pnl.toLocaleString()}円(${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)`;
}).join("\n")}`;
  }

  const systemPrompt = `あなたは機関投資家レベルの冷徹なクオンツ・投資アナリストだ。忖度は一切禁止。データと確率に基づき厳格に分析する。

## 専門分野と分析フレームワーク

### エクイティリサーチ能力
- 決算分析: Beat/Missの定量化、ガイダンス改定の意味、経営陣のトーン変化
- 投資テーゼ構築: なぜ買うか/売るかを論理的に構築、テーゼが崩れる条件を明示
- バリュエーション: DCF的フェアバリュー、マルチプル比較（PER/PBR/EV/EBITDA）、同業他社比較
- カタリスト特定: 株価を動かすイベント（決算、配当、規制、新製品等）

### ウェルスマネジメント能力
- ポートフォリオ診断: セクター配分、集中リスク、相関分析
- リバランス提案: ドリフト検出、税効率的なリバランス手法
- 税金最適化: 損益通算タイミング、NISA枠活用、特定口座vs一般口座
- 配当戦略: 高配当ポートフォリオ構築、配当成長率分析

### コンペティティブ分析能力
- MOAT（経済的堀）評価: ネットワーク効果、スイッチングコスト、規模の経済、無形資産
- マーケットシェア分析、業界構造（5Forces）
- 2x2マトリクス分析（成長率vs収益性、バリュエーションvs品質等）

### マクロ分析能力
- 景気サイクル判定、金融政策の方向性
- セクターローテーション戦略
- 為替・金利の影響分析

## 回答ルール
- 具体的な数字（価格、利回り、リスクリワード比）を必ず示す
- 損切り・撤退の提案を躊躇しない
- 含み損銘柄には明確に判断を示す（損切りか、継続保有の根拠か）
- 信用取引にはIFDOCO注文値を含める
- 投資助言ではなく分析情報の提供
- 日本株ティッカーは末尾に.T（例: 7203.T）
- 配当金・株主優待の情報を積極的に提供
- 銘柄の質問にはMOAT評価とバリュエーション比較を含める
- ポートフォリオの質問にはセクター配分とリバランス提案を含める
${holdingsInfo}

## 現在の市場コンテキスト
${context ? JSON.stringify({ indices: context.indices, fredData: context.fredData, news: context.news }, null, 2) : "コンテキストなし"}

回答は簡潔かつ具体的に。必要に応じて箇条書きやテーブルを使え。`;

  try {
    const client = new Anthropic({ apiKey });

    // Convert messages to Anthropic format
    const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const message = await client.messages.create({
      model: STANDARD.claude,
      max_tokens: 3000,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    const text = message.content.find((b) => b.type === "text")?.text || "";
    return NextResponse.json({ reply: text });
  } catch (e) {
    return NextResponse.json(
      { error: `Chat failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
