import { NextResponse } from "next/server";
import { callZaim, fetchAccounts } from "@/lib/zaim/client";

/**
 * Zaim API デバッグ: 各エンドポイントを叩いて生レスポンスを返す.
 * 残高取得の手段を切り分ける.
 */
export async function GET() {
  const accessToken = process.env.ZAIM_ACCESS_TOKEN;
  const accessSecret = process.env.ZAIM_ACCESS_SECRET;
  if (!accessToken || !accessSecret) {
    return NextResponse.json({ error: "token 未設定" }, { status: 503 });
  }

  const out: Record<string, unknown> = {};

  // 1. /v2/user/verify (ユーザー情報、profile)
  try {
    out.user_verify = await callZaim("/user/verify", accessToken, accessSecret);
  } catch (e) { out.user_verify = { error: String(e) }; }

  // 2. /v2/home/account 標準
  try {
    out.account_default = await callZaim("/home/account", accessToken, accessSecret);
  } catch (e) { out.account_default = { error: String(e) }; }

  // 3. /v2/home/account?mapping=1 (詳細マッピング)
  try {
    out.account_mapping = await callZaim("/home/account", accessToken, accessSecret, { mapping: 1 });
  } catch (e) { out.account_mapping = { error: String(e) }; }

  // 4. /v2/home/money 直近 30日
  try {
    const today = new Date().toISOString().split("T")[0];
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    out.money_30d = await callZaim("/home/money", accessToken, accessSecret, {
      mapping: 1,
      start_date: monthAgo,
      end_date: today,
      limit: 5,
    });
  } catch (e) { out.money_30d = { error: String(e) }; }

  // 5. /v2/home/category (補助情報)
  try {
    out.category = await callZaim("/home/category", accessToken, accessSecret);
  } catch (e) { out.category = { error: String(e) }; }

  return NextResponse.json(out);
}
