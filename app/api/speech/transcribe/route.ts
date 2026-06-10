import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

/**
 * 音声 → テキスト (OpenAI Whisper)。
 * ブラウザの MediaRecorder で録った音声 (multipart) を受け取り日本語で文字起こしする。
 * Azure 不要・既存の OPENAI_API_KEY を使用。
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY未設定" }, { status: 500 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "音声ファイルがありません" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });
    const result = await client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "ja",
    });

    return NextResponse.json({ text: result.text });
  } catch (e) {
    return NextResponse.json(
      { error: `文字起こし失敗: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
