import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { STANDARD } from "@/lib/model-config";

interface CentralBankTone {
  hawkish_score: number;
  dovish_score: number;
  stance: "hawkish" | "dovish" | "neutral";
  rate_hike_probability: number;
  key_phrases: string[];
  summary_ja: string;
}

interface FedToneResponse {
  fed: CentralBankTone | null;
  boj: CentralBankTone | null;
  updated_at: string;
  error?: string;
}

function parseRSSItems(
  xml: string
): { title: string; description: string; link: string }[] {
  const items: { title: string; description: string; link: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
    const content = match[1];
    const title =
      content
        .match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1]
        ?.trim() || "";
    const description =
      content
        .match(
          /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/
        )?.[1]
        ?.trim() || "";
    const link =
      content
        .match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1]
        ?.trim() || "";

    if (title) {
      items.push({ title, description, link });
    }
  }

  return items;
}

async function fetchRSSText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const xml = await res.text();
    const items = parseRSSItems(xml);

    if (items.length === 0) return null;

    // Use the first 3 items as context
    const textParts = items.slice(0, 3).map((item) => {
      const desc = item.description
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return `Title: ${item.title}\n${desc}`;
    });

    return textParts.join("\n---\n");
  } catch {
    return null;
  }
}

async function fetchFedPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 10000);
  } catch {
    return null;
  }
}

async function analyzeTone(
  client: Anthropic,
  centralBankName: string,
  text: string
): Promise<CentralBankTone> {
  const userPrompt = `Analyze this ${centralBankName} central bank statement and return ONLY valid JSON:
{
  "hawkish_score": <0 to 1.0, 1.0=most hawkish>,
  "dovish_score": <0 to 1.0>,
  "stance": <"hawkish"|"dovish"|"neutral">,
  "rate_hike_probability": <0 to 1.0>,
  "key_phrases": [<hawkish/dovish key phrases found>],
  "summary_ja": <80字以内>
}

Statement text:
${text.slice(0, 10000)}`;

  const message = await client.messages.create({
    model: STANDARD.claude,
    max_tokens: 800,
    system:
      "You are a central bank policy analyst. Analyze the provided statement for monetary policy tone and return ONLY valid JSON.",
    messages: [{ role: "user", content: userPrompt }],
  });

  const responseText =
    message.content.find((b) => b.type === "text")?.text || "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error("Failed to parse AI response");
  }

  return JSON.parse(jsonMatch[0]) as CentralBankTone;
}

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes("ここに")) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が未設定です" },
      { status: 500 }
    );
  }

  const client = new Anthropic({ apiKey });

  const response: FedToneResponse = {
    fed: null,
    boj: null,
    updated_at: new Date().toISOString(),
  };

  // Fetch Fed and BOJ data in parallel
  const [fedText, bojText] = await Promise.all([
    fetchRSSText("https://www.federalreserve.gov/feeds/press_all.xml").then(
      async (rssText) => {
        // Also try to fetch the latest press release page for richer context
        if (!rssText) {
          return fetchFedPageText(
            "https://www.federalreserve.gov/newsevents/pressreleases.htm"
          );
        }
        return rssText;
      }
    ),
    fetchRSSText("https://www.boj.or.jp/rss/news.xml"),
  ]);

  // Analyze in parallel
  const analyses = await Promise.allSettled([
    fedText
      ? analyzeTone(client, "Federal Reserve (Fed)", fedText)
      : Promise.resolve(null),
    bojText
      ? analyzeTone(client, "Bank of Japan (日本銀行)", bojText)
      : Promise.resolve(null),
  ]);

  if (analyses[0].status === "fulfilled" && analyses[0].value) {
    response.fed = analyses[0].value;
  }
  if (analyses[1].status === "fulfilled" && analyses[1].value) {
    response.boj = analyses[1].value;
  }

  if (!response.fed && !response.boj) {
    return NextResponse.json(
      {
        ...response,
        error:
          "Fed・日銀ともにデータを取得できませんでした。RSS接続をご確認ください。",
      },
      { status: 502 }
    );
  }

  return NextResponse.json(response);
}
