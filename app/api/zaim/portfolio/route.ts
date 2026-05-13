import { NextResponse } from "next/server";
import { fetchAccounts } from "@/lib/zaim/client";

/** Zaim から総資産 + 口座内訳取得 */
export async function GET() {
  const accessToken = process.env.ZAIM_ACCESS_TOKEN;
  const accessSecret = process.env.ZAIM_ACCESS_SECRET;
  if (!accessToken || !accessSecret) {
    return NextResponse.json(
      { error: "ZAIM_ACCESS_TOKEN/ZAIM_ACCESS_SECRET 未設定。/api/zaim/auth で連携してください。", connected: false },
      { status: 503 }
    );
  }

  try {
    const accounts = await fetchAccounts(accessToken, accessSecret);
    const total = accounts.reduce((s, a) => s + (a.amount ?? 0), 0);
    return NextResponse.json({
      connected: true,
      totalJPY: total,
      accountCount: accounts.length,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        amount: a.amount ?? 0,
        currency: a.currency_code ?? "JPY",
      })),
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: `Zaim portfolio 取得失敗: ${e instanceof Error ? e.message : "unknown"}`,
        connected: false,
      },
      { status: 500 }
    );
  }
}
