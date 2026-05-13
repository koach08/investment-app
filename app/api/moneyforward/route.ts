import { NextResponse } from "next/server";

/**
 * MF スクレイピングは local 専用 (Playwright が必要)。
 * 本番 (Vercel) では env 未設定で 503 を返す。
 * 動的 import なので playwright-core はバンドルされない。
 */
export async function POST() {
  const email = process.env.MF_EMAIL;
  const password = process.env.MF_PASSWORD;

  if (!email || !password) {
    return NextResponse.json(
      { error: "MF_EMAIL/MF_PASSWORD 未設定。本ルートは local 専用 (Playwright 必須)。" },
      { status: 503 }
    );
  }

  try {
    const { scrapeMoneyForward } = await import("@/lib/scrapers/moneyforward");
    const account = await scrapeMoneyForward(email, password);
    return NextResponse.json(account);
  } catch (e) {
    return NextResponse.json(
      { error: `マネーフォワードの取得に失敗: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
