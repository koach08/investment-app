import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { STANDARD } from "./model-config";
import type {
  EngineId,
  EngineResult,
  TechnicalSignal,
  NewsItem,
  MacroData,
  SignalType,
} from "./types";

function buildPrompt(params: {
  ticker: string;
  signal: TechnicalSignal;
  strategy: string;
  news?: NewsItem[];
  macroData?: MacroData[];
  isPerplexity?: boolean;
}): string {
  const { ticker, signal, strategy, news, macroData, isPerplexity } = params;

  let prompt = `あなたは投資分析の専門家です。以下のデータを基に銘柄を分析してください。

## 銘柄: ${ticker}
## 分析スタイル: ${strategy}

## テクニカル指標
- 終値: ${signal.close}
- 前日比: ${signal.changePercent?.toFixed(2)}%
- RSI(14): ${signal.rsi?.toFixed(1) ?? "N/A"}
- MACDヒストグラム: ${signal.macdHistogram?.toFixed(2) ?? "N/A"}
- ボリンジャーバンド: ${signal.bbPosition ?? "N/A"}
- ATR: ${signal.atr?.toFixed(2) ?? "N/A"}
- テクニカルシグナル: ${signal.signal} (スコア: ${signal.score})
`;

  if (news && news.length > 0) {
    prompt += `\n## 関連ニュース\n`;
    news.slice(0, 5).forEach((n) => {
      prompt += `- ${n.title} (${n.source})\n`;
    });
  }

  if (macroData && macroData.length > 0) {
    prompt += `\n## マクロ経済指標\n`;
    macroData.forEach((m) => {
      prompt += `- ${m.name}: ${m.latestValue} (前回: ${m.previousValue})\n`;
    });
  }

  if (isPerplexity) {
    prompt += `\n## 重要: 最新のWeb情報も検索・参照して分析してください。速報ニュースやアナリストの最新見解があれば加味してください。\n`;
  }

  prompt += `
## 回答形式（厳密にこのJSON形式で返してください。JSON以外のテキストは不要です）
{
  "signal": "BUY" | "WATCH_BUY" | "NEUTRAL" | "WATCH_SELL" | "SELL",
  "score": 0〜100の数値,
  "summary": "2〜3文の総合判断",
  "points": ["注目ポイント1", "注目ポイント2", "注目ポイント3"],
  "risks": ["リスク1", "リスク2"],
  "priceRange": { "entry": 想定エントリー価格, "target": 利確目標, "stop": 損切りライン },
  "confidence": 0〜100の確信度
}`;

  return prompt;
}

function parseResult(text: string, engine: EngineId, duration: number): EngineResult {
  try {
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      engine,
      status: "success",
      signal: parsed.signal as SignalType,
      score: parsed.score,
      confidence: parsed.confidence,
      summary: parsed.summary,
      points: parsed.points,
      risks: parsed.risks,
      priceRange: parsed.priceRange,
      duration,
    };
  } catch (e) {
    // If JSON parsing fails, try to extract key info
    return {
      engine,
      status: "success",
      signal: "NEUTRAL",
      score: 50,
      confidence: 30,
      summary: text.slice(0, 200),
      points: [],
      risks: [],
      duration,
    };
  }
}

async function analyzeClaude(prompt: string): Promise<EngineResult> {
  const start = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes("ここに")) {
    return { engine: "claude", status: "error", error: "APIキー未設定" };
  }

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: STANDARD.claude,
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
    system: "投資分析の専門家として、指定されたJSON形式で回答してください。",
  });

  const text = message.content.find((b) => b.type === "text")?.text || "";
  return parseResult(text, "claude", Date.now() - start);
}

async function analyzeGPT4o(prompt: string): Promise<EngineResult> {
  const start = Date.now();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.includes("ここに")) {
    return { engine: "gpt4o", status: "error", error: "APIキー未設定" };
  }

  const client = new OpenAI({ apiKey });
  const res = await client.chat.completions.create({
    model: STANDARD.openai,
    messages: [
      { role: "system", content: "投資分析の専門家として、指定されたJSON形式で回答してください。" },
      { role: "user", content: prompt },
    ],
    max_tokens: 800,
  });

  const text = res.choices[0]?.message?.content || "";
  return parseResult(text, "gpt4o", Date.now() - start);
}

async function analyzeGemini(prompt: string): Promise<EngineResult> {
  const start = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes("ここに")) {
    return { engine: "gemini", status: "error", error: "APIキー未設定" };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: STANDARD.gemini });
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return parseResult(text, "gemini", Date.now() - start);
}

async function analyzeGrok(prompt: string): Promise<EngineResult> {
  const start = Date.now();
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey || apiKey.includes("ここに")) {
    return { engine: "grok", status: "error", error: "APIキー未設定" };
  }

  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.x.ai/v1",
  });
  const res = await client.chat.completions.create({
    model: STANDARD.grok,
    messages: [
      { role: "system", content: "投資分析の専門家として、指定されたJSON形式で回答してください。" },
      { role: "user", content: prompt },
    ],
    max_tokens: 800,
  });

  const text = res.choices[0]?.message?.content || "";
  return parseResult(text, "grok", Date.now() - start);
}

async function analyzePerplexity(prompt: string): Promise<EngineResult> {
  const start = Date.now();
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey || apiKey.includes("ここに")) {
    return { engine: "perplexity", status: "error", error: "APIキー未設定" };
  }

  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.perplexity.ai",
  });
  const res = await client.chat.completions.create({
    model: STANDARD.perplexity,
    messages: [
      { role: "system", content: "投資分析の専門家として、最新のWeb情報も参照しながら指定されたJSON形式で回答してください。" },
      { role: "user", content: prompt },
    ],
    max_tokens: 800,
  });

  const text = res.choices[0]?.message?.content || "";
  return parseResult(text, "perplexity", Date.now() - start);
}

export async function analyzeWithAllEngines(params: {
  ticker: string;
  signal: TechnicalSignal;
  strategy: string;
  news?: NewsItem[];
  macroData?: MacroData[];
}): Promise<EngineResult[]> {
  const prompt = buildPrompt(params);
  const perplexityPrompt = buildPrompt({ ...params, isPerplexity: true });

  const results = await Promise.allSettled([
    analyzeClaude(prompt),
    analyzeGPT4o(prompt),
    analyzeGemini(prompt),
    analyzeGrok(prompt),
    analyzePerplexity(perplexityPrompt),
  ]);

  return results.map((r, i) => {
    const engines: EngineId[] = ["claude", "gpt4o", "gemini", "grok", "perplexity"];
    if (r.status === "fulfilled") {
      return r.value;
    }
    return {
      engine: engines[i],
      status: "error" as const,
      error: r.reason?.message || "Unknown error",
    };
  });
}
