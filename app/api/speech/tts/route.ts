import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

/**
 * テキスト → 音声 (OpenAI TTS)。日本語対応。mp3 を返す。
 * Azure 不要・既存の OPENAI_API_KEY を使用。
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY未設定" }, { status: 500 });
  }

  try {
    const { text, voice } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });
    const speech = await client.audio.speech.create({
      model: "tts-1",
      voice: voice || "nova",
      input: text.slice(0, 4000),
    });

    const buf = Buffer.from(await speech.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `読み上げ失敗: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
