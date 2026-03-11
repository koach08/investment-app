import { NextResponse } from "next/server";
import { scrapeMoneyForward } from "@/lib/scrapers/moneyforward";

export async function POST() {
  const email = process.env.MF_EMAIL;
  const password = process.env.MF_PASSWORD;

  if (!email || !password) {
    return NextResponse.json(
      { error: "マネーフォワードのログイン情報が.env.localに設定されていません。MF_EMAILとMF_PASSWORDを設定してください。" },
      { status: 400 }
    );
  }

  try {
    const account = await scrapeMoneyForward(email, password);
    return NextResponse.json(account);
  } catch (e) {
    return NextResponse.json(
      { error: `マネーフォワードの取得に失敗: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
