import { NextRequest, NextResponse } from "next/server";
import { convene } from "@/lib/council";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 投資委員会エンドポイント。
 * 5人格(強気/弱気/リスク管理/クオンツ/ファクト)で並列熟議 → Claude議長が最終決定を合成。
 *
 * body: {
 *   question: string,
 *   holdings?: HoldingInput[],
 *   positionsBriefing?: string,   // lib/positions.positionsBriefing() の出力
 *   lessonsBriefing?: string,     // lib/decision-log.lessonsBriefing() の出力
 *   marketNote?: string           // 任意の市況メモ
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question: string = (body.question || "").toString().trim();
    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const todayJst = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(new Date());

    // 保有銘柄ブリーフィング
    const holdings = Array.isArray(body.holdings) ? body.holdings : [];
    let holdingsText = "保有銘柄の登録なし。";
    if (holdings.length > 0) {
      holdingsText = holdings
        .slice(0, 20)
        .map((h: Record<string, unknown>) => {
          const code = h.code || h.ticker || "?";
          const name = h.name || "";
          const qty = h.quantity ?? h.shares ?? "?";
          const avg = h.avgPrice ?? "?";
          const cur = h.currentPrice ?? "?";
          const pnl = h.pnlPercent != null ? `${h.pnlPercent}%` : "";
          return `- ${code} ${name} ${qty}株 建値${avg} 現在${cur} ${pnl}`;
        })
        .join("\n");
    }

    const parts = [
      `本日: ${todayJst}`,
      `\n【保有銘柄】\n${holdingsText}`,
    ];
    if (body.positionsBriefing) parts.push(`\n【オープン建玉】\n${body.positionsBriefing}`);
    if (body.lessonsBriefing) parts.push(`\n【過去の教訓】\n${body.lessonsBriefing}`);
    if (body.marketNote) parts.push(`\n【市況メモ】\n${body.marketNote}`);

    const briefing = parts.join("\n");

    const result = await convene({ question, briefing, todayJst });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: `council failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
