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
    // 口座ごとに通貨が付く。外貨口座をそのまま足すと桁がずれるので、
    // 円建てだけで合計し、外した分は通貨ごとに申告する。
    const excludedByCurrency: Record<string, number> = {};
    let total = 0;
    for (const a of enriched) {
      const c = (a.currency ?? "JPY").toUpperCase();
      if (c === "JPY") total += a.amount;
      else excludedByCurrency[c] = (excludedByCurrency[c] ?? 0) + a.amount;
    }

    return NextResponse.json({
      connected: true,
      totalJPY: total,
      accountCount: enriched.length,
      accounts: enriched,
      excludedByCurrency: Object.keys(excludedByCurrency).length > 0 ? excludedByCurrency : undefined,
      note:
        "残高は money records 365日分から計算。初期残高未設定の場合は実残高と乖離あり。" +
        (Object.keys(excludedByCurrency).length > 0
          ? " 外貨建ての口座は totalJPY に含めていない（excludedByCurrency を参照）。"
          : ""),
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
