import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { LIGHT } from "@/lib/model-config";

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;

  try {
    const body = await request.json();
    const { indices } = body;

    if (!apiKey || apiKey.includes("ここに")) {
      return NextResponse.json({
        summary: "Gemini APIキーが未設定のため、市場サマリーを生成できません。.env.local にGEMINI_API_KEYを設定してください。",
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: LIGHT.gemini });

    const prompt = `あなたは金融市場のアナリストです。以下の世界市場データを基に、今日の市場環境サマリーを日本語200〜300字で作成してください。投資家にとって重要なポイントに焦点を当ててください。

## 世界市場データ
${JSON.stringify(indices, null, 2)}

要約を日本語で簡潔に書いてください。`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text();

    return NextResponse.json({ summary });
  } catch (e) {
    return NextResponse.json(
      { error: `Market summary failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
