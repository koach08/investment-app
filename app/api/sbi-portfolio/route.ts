import { NextResponse } from "next/server";
import { scrapeSBI } from "@/lib/scrapers/sbi";

export async function POST() {
  const userId = process.env.SBI_USER_ID;
  const password = process.env.SBI_PASSWORD;

  if (!userId || !password) {
    return NextResponse.json(
      { error: "SBI証券のログイン情報が.env.localに設定されていません。SBI_USER_IDとSBI_PASSWORDを設定してください。" },
      { status: 400 }
    );
  }

  try {
    const account = await scrapeSBI(userId, password);
    return NextResponse.json(account);
  } catch (e) {
    return NextResponse.json(
      { error: `SBI証券の取得に失敗: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
