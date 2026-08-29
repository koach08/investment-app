import { NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";
import { LATEST_KEY, isStale, ageHours, type StoredBrief } from "@/lib/daily-brief";

// 保存済みを返すだけ。LLM は呼ばないので速い
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stored = await kvGet<StoredBrief>(LATEST_KEY);
    if (!stored) {
      return NextResponse.json({ stored: null, stale: false, ageHours: null });
    }
    return NextResponse.json({
      stored,
      stale: isStale(stored.generatedAt),
      ageHours: ageHours(stored.generatedAt),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
