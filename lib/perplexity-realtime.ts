/**
 * Perplexity を使ったリアルタイム情報取得.
 * Claude/GPT は学習データの cutoff があるが Perplexity は web を引いて最新情報返す.
 *
 * 用途:
 *  - 株価 (yahoo は 15-20分遅延)
 *  - 最新ニュース (今日のヘッドライン)
 *  - 決算情報、アナリスト動向
 */

import OpenAI from "openai";

const PERPLEXITY_BASE = "https://api.perplexity.ai";

let _client: OpenAI | null = null;
function client(): OpenAI | null {
  if (_client) return _client;
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return null;
  _client = new OpenAI({ apiKey: key, baseURL: PERPLEXITY_BASE });
  return _client;
}

/** 軽量 query: 単一銘柄のリアルタイム情報取得. ~3-5秒 */
export async function realtimePriceQuery(ticker: string, name?: string): Promise<string | null> {
  const c = client();
  if (!c) return null;

  const target = name ? `${ticker} (${name})` : ticker;
  try {
    const resp = await c.chat.completions.create({
      model: "sonar",
      messages: [
        {
          role: "system",
          content: "あなたは金融データアシスタントです。最新の株価・市場情報を簡潔に返してください。数字と日付を必ず含める。",
        },
        {
          role: "user",
          content: `${target} の現在の株価、今日の値動き、直近1週間の動向、最新ニュース1-2件を 3-4行で。`,
        },
      ],
      max_tokens: 400,
    });
    return resp.choices[0]?.message?.content ?? null;
  } catch (e) {
    console.warn(`[perplexity] ${ticker} 失敗:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** 自由テキスト query (例: "今日の日経平均は？") */
export async function realtimeMarketQuery(question: string): Promise<string | null> {
  const c = client();
  if (!c) return null;

  try {
    const resp = await c.chat.completions.create({
      model: "sonar",
      messages: [
        {
          role: "system",
          content: "あなたは金融市場アシスタント。最新データを web から取得し、簡潔に日本語で答える。数値と日付を必ず含める。",
        },
        { role: "user", content: question },
      ],
      max_tokens: 600,
    });
    return resp.choices[0]?.message?.content ?? null;
  } catch (e) {
    console.warn(`[perplexity] query 失敗:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** 複数銘柄一括 (並列、各 ~3秒なので合計それくらい) */
export async function realtimeMultiPrices(items: { ticker: string; name?: string }[]): Promise<Record<string, string | null>> {
  const results = await Promise.all(items.map(i => realtimePriceQuery(i.ticker, i.name)));
  const out: Record<string, string | null> = {};
  items.forEach((item, i) => { out[item.ticker] = results[i]; });
  return out;
}
