import { NextResponse } from "next/server";

/**
 * Azure Speech の短命トークンを発行する。
 * ブラウザに subscription key を晒さないため、ここでサーバ側がトークンに変換する。
 * トークンは約10分有効。ブラウザの Speech SDK は fromAuthorizationToken で使う。
 *
 * 必要な環境変数:
 *   AZURE_SPEECH_KEY    — Azure Speech リソースのキー
 *   AZURE_SPEECH_REGION — リージョン (例: japaneast, eastus)
 */
export async function GET() {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!key || !region) {
    return NextResponse.json(
      { error: "AZURE_SPEECH_KEY / AZURE_SPEECH_REGION 未設定" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Length": "0",
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Azure token 取得失敗 (${res.status})` },
        { status: res.status }
      );
    }

    const token = await res.text();
    return NextResponse.json({ token, region });
  } catch (e) {
    return NextResponse.json(
      { error: `token 発行エラー: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
