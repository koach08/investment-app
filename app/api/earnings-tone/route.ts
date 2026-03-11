import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { STANDARD } from "@/lib/model-config";

interface EarningsToneRequest {
  ticker: string;
  transcript_text?: string;
  lang?: "ja" | "en";
}

interface EarningsToneResult {
  overall_tone: number;
  confidence_score: number;
  guidance_revision: "up" | "down" | "maintained" | "none";
  bullish_signals: string[];
  bearish_signals: string[];
  uncertainty_words: string[];
  key_topics: string[];
  analyst_qa_tone: "aggressive" | "neutral" | "friendly";
  beat_miss: {
    revenue: "beat" | "miss" | "inline" | "unknown";
    eps: "beat" | "miss" | "inline" | "unknown";
    magnitude: string;
  };
  margin_trend: "expanding" | "contracting" | "stable" | "unknown";
  management_confidence: number;
  key_metrics_changes: string[];
  forward_guidance_detail: string;
  competitive_position_change: "strengthening" | "weakening" | "stable" | "unknown";
  catalyst_next_quarter: string[];
  risk_flags: string[];
  thesis_impact: "strengthens" | "weakens" | "neutral";
  summary_ja: string;
}

async function fetchTranscriptUS(ticker: string): Promise<string | null> {
  try {
    const res = await fetch(`https://earningscall.biz/${ticker}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Extract text content from HTML, stripping tags
    const textContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return textContent.length > 200 ? textContent.slice(0, 15000) : null;
  } catch {
    return null;
  }
}

async function fetchTranscriptJP(ticker: string): Promise<string | null> {
  try {
    const code = ticker.replace(/\.T$/i, "");
    const query = encodeURIComponent(`${code} 決算説明会`);
    const url = `https://news.google.com/rss/search?q=${query}&hl=ja&gl=JP&ceid=JP:ja`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const xml = await res.text();

    // Extract titles and descriptions from RSS items as context
    const items: string[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const title =
        match[1]
          .match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1]
          ?.trim() || "";
      const desc =
        match[1]
          .match(
            /<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/
          )?.[1]
          ?.trim() || "";
      if (title) items.push(`${title}\n${desc}`);
    }

    return items.length > 0
      ? `[Google News検索結果から取得した決算関連情報]\n${items.join("\n---\n")}`
      : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: EarningsToneRequest = await request.json();
    const { ticker, lang = "en" } = body;

    if (!ticker) {
      return NextResponse.json(
        { error: "ticker は必須です" },
        { status: 400 }
      );
    }

    // Step 1: Get transcript text
    let transcriptText = body.transcript_text || "";

    if (!transcriptText) {
      const isJP = /\.\s*T$/i.test(ticker);
      if (isJP) {
        transcriptText = (await fetchTranscriptJP(ticker)) || "";
      } else {
        transcriptText = (await fetchTranscriptUS(ticker)) || "";
      }
    }

    if (!transcriptText) {
      return NextResponse.json(
        {
          error: `${ticker} の決算テキストを取得できませんでした。transcript_text を直接入力してください。`,
        },
        { status: 404 }
      );
    }

    // Step 2: Analyze with Claude
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey.includes("ここに")) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY が未設定です" },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

    const userPrompt = `Analyze this earnings call transcript using institutional equity research standards and return JSON:

## Analysis Framework
1. **Beat/Miss Quantification**: Was revenue/EPS above or below consensus? By how much?
2. **Margin Analysis**: Are operating/net margins expanding or contracting? Why?
3. **Management Tone**: How confident is management? Look for hedging language, deflections, unusual pauses
4. **Guidance Deep Dive**: Forward guidance raised/lowered/maintained? What are the key assumptions?
5. **Competitive Position**: Any changes in market share, pricing power, or competitive dynamics?
6. **Analyst Q&A Decode**: What are analysts most concerned about? Any hostile questions?
7. **Key Metric Changes**: What operational KPIs changed significantly?
8. **Red Flags**: Any accounting changes, one-time items, or unusual language?

{
  "overall_tone": <-1.0 to 1.0>,
  "confidence_score": <0 to 1.0>,
  "guidance_revision": <"up"|"down"|"maintained"|"none">,
  "bullish_signals": [<max 5 specific quotes with context>],
  "bearish_signals": [<max 5 specific quotes with context>],
  "uncertainty_words": [<key uncertainty/hedging terms found>],
  "key_topics": [<max 5 topics>],
  "analyst_qa_tone": <"aggressive"|"neutral"|"friendly">,
  "beat_miss": {
    "revenue": <"beat"|"miss"|"inline"|"unknown">,
    "eps": <"beat"|"miss"|"inline"|"unknown">,
    "magnitude": <"significant beat/miss" or "slight beat/miss" or "inline" or "unknown">
  },
  "margin_trend": <"expanding"|"contracting"|"stable"|"unknown">,
  "management_confidence": <0 to 1.0, based on language certainty, hedging frequency>,
  "key_metrics_changes": [<max 5 significant KPI changes mentioned>],
  "forward_guidance_detail": <"1-2 sentences on specific guidance details">,
  "competitive_position_change": <"strengthening"|"weakening"|"stable"|"unknown">,
  "catalyst_next_quarter": [<max 3 events to watch for next quarter>],
  "risk_flags": [<max 3 red flags: accounting changes, one-time items, executive departures, etc>],
  "thesis_impact": <"strengthens"|"weakens"|"neutral" - how this earnings affects the investment thesis>,
  "summary_ja": <200字以内の日本語要約。Beat/Miss、ガイダンス、テーゼへの影響を含む>
}
Transcript: ${transcriptText.slice(0, 12000)}`;

    const message = await client.messages.create({
      model: STANDARD.claude,
      max_tokens: 2000,
      system: `You are a senior equity research analyst at a top-tier investment bank. Your earnings analysis follows institutional standards:

CRITICAL ANALYSIS PRINCIPLES:
- Quantify everything: "Revenue beat by 3.2%" not "Revenue was strong"
- Context matters: Compare to consensus, guidance, and year-over-year
- Read between the lines: Management's choice of words reveals confidence level
- Analyst Q&A is gold: Hostile questions signal concerns the market cares about
- Red flags first: Accounting changes, one-time items, CFO language shifts
- Guidance is forward-looking: Focus on what management says about next quarter/year
- Competitive dynamics: Market share changes, pricing power, customer concentration

HEDGING LANGUAGE DETECTION:
- "We remain cautiously optimistic" = management is worried
- "We are monitoring the situation" = there is a problem
- "Results were impacted by one-time items" = recurring problems disguised
- Frequent use of "challenging environment" = margins under pressure

Return ONLY valid JSON. No markdown, no explanation.`,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      message.content.find((b) => b.type === "text")?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json(
        { error: "AIからの応答をパースできませんでした" },
        { status: 500 }
      );
    }

    const result: EarningsToneResult = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ ticker, lang, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: `分析失敗: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
