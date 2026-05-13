import { NextResponse } from "next/server";

/**
 * SBI スクレイピングは local 専用 (Playwright が必要)。
 * 本番 (Vercel) では env 未設定で 503 を返す。
 * 動的 import なので playwright-core はバンドルされない。
 */
export async function POST() {
  const userId = process.env.SBI_USER_ID;
  const password = process.env.SBI_PASSWORD;

  if (!userId || !password) {
    return NextResponse.json(
      { error: "SBI_USER_ID/SBI_PASSWORD 未設定。本ルートは local 専用 (Playwright 必須)。" },
      { status: 503 }
    );
  }

  try {
    const { scrapeSBI } = await import("@/lib/scrapers/sbi");
    const account = await scrapeSBI(userId, password);
    return NextResponse.json(account);
  } catch (e) {
    return NextResponse.json(
      { error: `SBI証券の取得に失敗: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
