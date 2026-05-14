import { NextResponse } from "next/server";
import { fetchAccounts, fetchAccountBalances } from "@/lib/zaim/client";

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
    // accounts (メタ) + balances (money records から計算) を並列取得
    const [accounts, balances] = await Promise.all([
      fetchAccounts(accessToken, accessSecret),
      fetchAccountBalances(accessToken, accessSecret),
    ]);

    const enriched = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      // money records から計算した残高 (365日分の差し引き)
      amount: balances.get(a.id) ?? 0,
      currency: a.currency_code ?? "JPY",
    }));
    const total = enriched.reduce((s, a) => s + a.amount, 0);

    return NextResponse.json({
      connected: true,
      totalJPY: total,
      accountCount: enriched.length,
      accounts: enriched,
      note: "残高は money records 365日分から計算。初期残高未設定の場合は実残高と乖離あり。",
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
