import { NextResponse } from "next/server";
import { getRequestToken } from "@/lib/zaim/client";

/**
 * Zaim OAuth 開始: request token を取得し、認証 URL に redirect。
 * リクエスト secret は cookie に一時保存 (callback で使う)。
 */
export async function GET() {
  try {
    const callbackUrl = process.env.ZAIM_CALLBACK_URL ?? `${getBaseUrl()}/api/zaim/callback`;
    const { requestToken, requestSecret, authorizeUrl } = await getRequestToken(callbackUrl);

    const res = NextResponse.redirect(authorizeUrl);
    res.cookies.set("zaim_request_token", requestToken, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600 });
    res.cookies.set("zaim_request_secret", requestSecret, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600 });
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: `Zaim 認証開始失敗: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}

function getBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://investment-app-iota-nine.vercel.app";
}
