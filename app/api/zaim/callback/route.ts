import { NextRequest, NextResponse } from "next/server";
import { getAccessToken, fetchAccounts } from "@/lib/zaim/client";

/**
 * Zaim 認証コールバック.
 * URL に oauth_token と oauth_verifier が含まれる。
 * cookie の request secret と合わせて access token に交換。
 *
 * 結果はブラウザに表示 → ユーザーが Vercel env に手動登録する想定 (MVP)。
 * 本番化したら DB / KV に保存。
 */
export async function GET(req: NextRequest) {
  const oauthToken = req.nextUrl.searchParams.get("oauth_token");
  const oauthVerifier = req.nextUrl.searchParams.get("oauth_verifier");
  const requestSecret = req.cookies.get("zaim_request_secret")?.value;

  if (!oauthToken || !oauthVerifier) {
    return NextResponse.json({ error: "oauth_token / oauth_verifier 不足" }, { status: 400 });
  }
  if (!requestSecret) {
    return NextResponse.json({ error: "cookie request secret 喪失 (10分以内に再試行)" }, { status: 400 });
  }

  try {
    const { accessToken, accessSecret } = await getAccessToken(oauthToken, requestSecret, oauthVerifier);
    // 動作確認 + 口座一覧を表示
    const accounts = await fetchAccounts(accessToken, accessSecret).catch(() => []);

    const html = `<!doctype html>
<meta charset="utf-8">
<title>Zaim 連携完了</title>
<style>
  body{font-family:system-ui;max-width:720px;margin:40px auto;padding:0 20px;background:#0a0a0a;color:#e5e5e5}
  h1{color:#22c55e}
  pre{background:#1a1a1a;padding:12px;border-radius:6px;overflow:auto;border:1px solid #333}
  code{background:#1a1a1a;padding:2px 6px;border-radius:4px}
  .warning{background:#451a03;border-left:4px solid #f97316;padding:12px;margin:16px 0;color:#fed7aa}
  .ok{background:#052e16;border-left:4px solid #22c55e;padding:12px;margin:16px 0;color:#bbf7d0}
  table{border-collapse:collapse;width:100%;margin:12px 0}
  td,th{border:1px solid #333;padding:6px;text-align:left}
  th{background:#1a1a1a}
</style>
<h1>✓ Zaim 連携完了</h1>
<div class="ok">アクセストークン取得成功。下のトークンを Vercel 環境変数に登録してください。</div>

<h2>1. このトークンを保存</h2>
<div class="warning">⚠ Access Token / Secret はパスワード相当。<strong>絶対に外部に貼らない</strong>。
このページを閉じる前に Vercel env に登録すること。</div>
<pre>ZAIM_ACCESS_TOKEN=${accessToken}
ZAIM_ACCESS_SECRET=${accessSecret}</pre>

<h2>2. ターミナルでこのコマンド実行</h2>
<pre>cd ~/investment-app
printf "${accessToken}" | vercel env add ZAIM_ACCESS_TOKEN production
printf "${accessSecret}" | vercel env add ZAIM_ACCESS_SECRET production
vercel --prod --yes</pre>

<h2>3. 取得できた口座 (動作確認)</h2>
${accounts.length === 0 ? '<p>口座データなし (Zaim に口座連携してない場合は空)</p>' : `
<table>
  <thead><tr><th>ID</th><th>口座名</th><th>残高</th><th>通貨</th></tr></thead>
  <tbody>
${accounts.map(a => `<tr><td>${a.id}</td><td>${a.name}</td><td>${a.amount ?? "-"}</td><td>${a.currency_code ?? "JPY"}</td></tr>`).join("\n")}
  </tbody>
</table>`}

<h2>4. 次にやる</h2>
<p>Vercel env 登録 + 再デプロイ完了後、<a href="/advisor">/advisor</a> に進む。</p>
`;

    const res = new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    // cookie 消去
    res.cookies.delete("zaim_request_token");
    res.cookies.delete("zaim_request_secret");
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: `Zaim 認証失敗: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
