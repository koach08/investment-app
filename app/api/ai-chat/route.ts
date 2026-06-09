import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { HEAVY } from "@/lib/model-config";
import { realtimeMultiPrices, realtimeMarketQuery } from "@/lib/perplexity-realtime";

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
  let topHoldings: HoldingInput[] = [];
  if (context?.holdings && context.holdings.length > 0) {
    const sorted = [...context.holdings]
      .sort((a: HoldingInput, b: HoldingInput) => (b.marketValue || 0) - (a.marketValue || 0))
      .slice(0, 15);
    topHoldings = sorted;
    holdingsInfo = `
## ユーザーの保有銘柄（唯一の正・推測で書き換え禁止）
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

  // === Perplexity でリアルタイム情報取得 (株価/最新ニュース) ===
  // ユーザー直近メッセージから ticker 抽出 OR 「現在/今/最新/株価」キーワードあれば実行
  let realtimeInfo = "";
  const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === "user")?.content as string | undefined;
  if (lastUserMsg && process.env.PERPLEXITY_API_KEY) {
    const triggerKeywords = ["現在", "今の", "今日", "最新", "リアルタイム", "株価", "価格", "値段", "いくら"];
    const hasTrigger = triggerKeywords.some(k => lastUserMsg.includes(k));
    // メッセージから ticker 抽出 (例: "7203.T", "7203", "AAPL")
    const tickerMatches = lastUserMsg.match(/\b\d{4}\.T\b|\b[A-Z]{2,5}\b/g) || [];
    const explicitTickers = [...new Set(tickerMatches.map(t => t.endsWith(".T") ? t : (/^\d{4}$/.test(t) ? `${t}.T` : t)))];

    try {
      // 1. 明示的に ticker 指定された場合は その個別株を Perplexity に問い合わせ
      if (explicitTickers.length > 0 && explicitTickers.length <= 5) {
        const items = explicitTickers.map(t => ({ ticker: t }));
        const prices = await realtimeMultiPrices(items);
        const blocks = Object.entries(prices)
          .filter(([, v]) => v != null)
          .map(([k, v]) => `### ${k} (Perplexity リアルタイム)\n${v}`)
          .join("\n\n");
        if (blocks) realtimeInfo += `\n\n## リアルタイム情報 (Perplexity 経由)\n${blocks}`;
      }
      // 2. ticker 指定なし + キーワード hit → 自由テキスト query (例: "今日の日経平均は")
      else if (hasTrigger) {
        const ans = await realtimeMarketQuery(lastUserMsg);
        if (ans) realtimeInfo += `\n\n## リアルタイム情報 (Perplexity 経由)\n${ans}`;
      }
      // 3. ポートフォリオ質問なら top 3 保有銘柄の状況も取る (重い)
      else if (topHoldings.length > 0 && (lastUserMsg.includes("ポート") || lastUserMsg.includes("保有") || lastUserMsg.includes("評価"))) {
        const top3 = topHoldings.slice(0, 3).map(h => ({
          ticker: h.code || h.ticker || "",
          name: h.name,
        })).filter(h => h.ticker);
        if (top3.length > 0) {
          const prices = await realtimeMultiPrices(top3);
          const blocks = Object.entries(prices)
            .filter(([, v]) => v != null)
            .map(([k, v]) => `### ${k}\n${v}`)
            .join("\n\n");
          if (blocks) realtimeInfo += `\n\n## 保有銘柄リアルタイム情報 (Perplexity)\n${blocks}`;
        }
      }
    } catch (e) {
      console.warn("[ai-chat] perplexity 失敗:", e instanceof Error ? e.message : e);
    }
  }

  // === 今日の日付 (JST) === 日付誤認を防ぐためサーバ側で確定して注入する
  const todayJst = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());

  // === 戦略タブで生成した戦略をチャットに引き継ぐ ===
  // これが無いと「戦略タブで空売りを提案」→「チャットでなぜ空売りしてるんだと矛盾」が起きる
  let strategyInfo = "";
  if (context?.generatedStrategy) {
    let stratStr = "";
    try {
      stratStr = typeof context.generatedStrategy === "string"
        ? context.generatedStrategy
        : JSON.stringify(context.generatedStrategy, null, 2);
    } catch {
      stratStr = "";
    }
    if (stratStr && stratStr.length > 20) {
      // 長すぎる場合は先頭を優先 (system prompt 肥大化防止)
      const clipped = stratStr.length > 8000 ? stratStr.slice(0, 8000) + "\n…(以下省略)" : stratStr;
      strategyInfo = `

## ⚠️ あなた自身が直近に生成した「投資戦略」（このアプリの戦略タブの出力）
ユーザーはこの戦略に従って実際に注文を出している可能性が高い。
この戦略と矛盾する発言を絶対にするな。例えば戦略でANA空売りを提示しているのに「なぜ空売りしているのか」と問い返すのは重大な誤りだ。
戦略の内容を前提として会話を継続せよ。

${clipped}`;
    }
  }

  const systemPrompt = `あなたは機関投資家レベルの冷徹なクオンツ・投資アナリストだ。忖度は一切禁止。データと確率に基づき厳格に分析する。

## 🗓️ 今日の日付（厳守）
今日は **${todayJst}** だ。これがこの会話の基準日である。
- 日付・曜日・「今日/先週/明日」の判断は必ずこの基準日を使え。会話履歴の古い日付に引きずられて日付を取り違えるな。
- カタリストやイベントの「済み/未来」の判定もこの基準日で行え。

## 🧠 会話の一貫性（最重要・絶対厳守）
過去の対応で「文脈を忘れる・自分の指示と逆を言う・数字がコロコロ変わる」という重大な失敗が起きた。二度と繰り返すな。
- 会話履歴とこの後の「保有銘柄」「生成済み戦略」は**唯一の正**として扱え。保有数量・建単価・口座種別を**勝手に推測して言い換えるな**。不明なら一度だけ質問し、得た情報はそれ以降ずっと保持せよ。
- 自分が一度出した推奨（売る/買う/空売り/逆指値の価格）と**矛盾する発言をするな**。考えを変える正当な理由があるときだけ「前言を修正する。理由は〜」と明示してから変えよ。理由なく方針を反転させるな。
- 現物・信用買い・信用売り（空売り）を厳密に区別せよ。ユーザーが戦略どおり空売りしている場合、それを否定したり「なぜ？」と問い返すな。
- 一度提示した価格（利確/損切り/トリガー）は会話中で勝手に変えるな。変える必要があるなら理由を述べてから。

## 📡 データの限界（正直さ）
- あなたはリアルタイムの板情報・約定状況・口座残高を持っていない。下記コンテキストやPerplexity要約は**時点付きスナップショット**にすぎない。
- リアルタイム株価が無いのに具体的な株価・エントリー価格を**断定するな**。出す場合は「（${todayJst}時点の参考値／要確認）」と前提を必ず添えよ。
- 注文の実行手順を案内するときは、ユーザーが見ている画面の表示を正として扱い、推測で画面項目を断定しない。

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
- 数字（価格、利回り、リスクリワード比）を示すときは根拠と前提（データ時点）を添える。リアルタイム株価が無ければ断定せず参考値と明示する
- 損切り・撤退の提案を躊躇しない。ただし含み損銘柄の判断（損切り/継続保有）は根拠を明示する
- 信用取引・空売りのIFDOCO注文値は、ユーザーがその実行を求めたときにのみ提示する。こちらから無条件に煽らない
- 投資助言ではなく分析情報の提供
- 日本株ティッカーは末尾に.T（例: 7203.T）
- 配当金・株主優待の情報を積極的に提供
- 銘柄の質問にはMOAT評価とバリュエーション比較を含める
- ポートフォリオの質問にはセクター配分とリバランス提案を含める
- ユーザーが混乱しているときは煽らず、まず現状を1つずつ確定させてから次へ進む
${holdingsInfo}
${strategyInfo}
${realtimeInfo}

## 現在の市場コンテキスト
${context ? JSON.stringify({ indices: context.indices, fredData: context.fredData, news: context.news }, null, 2) : "コンテキストなし"}

回答は簡潔かつ具体的に。必要に応じて箇条書きやテーブルを使え。
回答はMarkdown形式で返すこと。JSONやコードブロック（\`\`\`）で囲まないこと。見出し、箇条書き、太字等のMarkdown記法を直接使え。`;

  try {
    const client = new Anthropic({ apiKey });

    // Convert messages to Anthropic format
    const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const message = await client.messages.create({
      model: HEAVY.claude,
      max_tokens: 6000,
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
