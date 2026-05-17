import { NextResponse } from "next/server";
import { fetchWalletBalance } from "@/lib/onchain/wallet";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const addressFromQuery = url.searchParams.get("address");
  const address = addressFromQuery ?? process.env.METAMASK_WALLET_ADDRESS;

  if (!address) {
    return NextResponse.json(
      { error: "METAMASK_WALLET_ADDRESS 未設定。env または ?address= で指定。" },
      { status: 503 }
    );
  }

  try {
    const balance = await fetchWalletBalance(address);
    return NextResponse.json(balance);
  } catch (e) {
    return NextResponse.json(
      { error: `wallet fetch 失敗: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
