import { NextRequest, NextResponse } from "next/server";
import { gatherBriefInputs } from "@/lib/brief-inputs";
import { generateMorningBrief } from "@/lib/morning-brief";
import { kvSet } from "@/lib/kv";
import { checkTrendSignals } from "@/lib/signal-check";
import { LATEST_KEY, dayKey, type StoredBrief } from "@/lib/daily-brief";

// LLM を1回叩くので少し長めに取る
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** 実行元の確認。Vercel Cron は Authorization: Bearer $CRON_SECRET を付けてくる */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // 未設定なら誰でも叩けてしまうので、その場合は拒否する
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "CRON_SECRET が未設定か、認証ヘッダが一致しません" },
      { status: 401 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes("ここに")) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 500 });
  }

  const startedAt = Date.now();
  const origin = request.nextUrl.origin;

  try {
    const { input, missing, fatal } = await gatherBriefInputs(origin);

    // 材料が足りないまま生成すると、薄い内容が「今日の分析」の顔で残る。
    // 前日のブリーフを消さずに、失敗として返す。
    if (fatal) {
      return NextResponse.json(
        { ok: false, reason: "必須の材料（指数・ニュース）が取れませんでした", missing },
        { status: 503 }
      );
    }

    // ブリーフ生成と並行してシグナルも見る。LLM を使わないので追加コストはほぼゼロ。
    // シグナルの取得に失敗してもブリーフは出す（主従を逆にしない）
    const [{ brief, rawText }, signals] = await Promise.all([
      generateMorningBrief(input, apiKey),
      checkTrendSignals(startedAt).catch(() => []),
    ]);

    const stored: StoredBrief = {
      brief: brief ?? null,
      rawText: rawText ?? null,
      generatedAt: new Date().toISOString(),
      source: "cron",
      missing,
      durationMs: Date.now() - startedAt,
      holdingsCount: input.holdings?.length ?? 0,
      newsCount: input.news?.length ?? 0,
      signals,
    };

    // 日付キーと最新キーの両方に置く。日付キーは後から振り返れるように
    await Promise.all([kvSet(LATEST_KEY, stored), kvSet(dayKey(new Date()), stored)]);

    return NextResponse.json({
      ok: true,
      generatedAt: stored.generatedAt,
      parsed: brief !== null,
      signalsChanged: signals.filter((x) => x.changedThisMonth).map((x) => x.ticker),
      missing,
      durationMs: stored.durationMs,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
