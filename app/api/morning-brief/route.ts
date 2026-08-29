import { NextRequest, NextResponse } from "next/server";
import { generateMorningBrief, type BriefInput } from "@/lib/morning-brief";

// プロンプトと生成処理は lib/morning-brief.ts が唯一の出所。
// 自動生成 (cron) と同じコードを通すことで、画面で見た内容と
// 自動生成された内容がずれないようにしている。
export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes("ここに")) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 500 });
  }

  const body = (await request.json()) as BriefInput;

  try {
    const result = await generateMorningBrief(body, apiKey);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: `Morning brief failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
