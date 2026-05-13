/**
 * Zaim API クライアント (OAuth 1.0a)
 *
 * 個人開発者の Consumer Key/Secret + ユーザーの Access Token/Secret で
 * Zaim の家計/口座データを取得する。
 *
 * Endpoints:
 *  - https://api.zaim.net/v2/auth/request  → request token
 *  - https://auth.zaim.net/users/auth      → authorize (ブラウザ)
 *  - https://api.zaim.net/v2/auth/access   → access token
 *  - https://api.zaim.net/v2/home/account  → 口座一覧
 *  - https://api.zaim.net/v2/home/money    → 入出金履歴
 */

import OAuth from "oauth-1.0a";
import crypto from "crypto";

const REQUEST_TOKEN_URL = "https://api.zaim.net/v2/auth/request";
const ACCESS_TOKEN_URL = "https://api.zaim.net/v2/auth/access";
const AUTH_URL = "https://auth.zaim.net/users/auth";
const API_BASE = "https://api.zaim.net/v2";

function buildOAuth(): OAuth {
  const key = process.env.ZAIM_CONSUMER_KEY;
  const secret = process.env.ZAIM_CONSUMER_SECRET;
  if (!key || !secret) {
    throw new Error("ZAIM_CONSUMER_KEY / ZAIM_CONSUMER_SECRET 未設定");
  }
  return new OAuth({
    consumer: { key, secret },
    signature_method: "HMAC-SHA1",
    hash_function(base_string: string, key: string) {
      return crypto.createHmac("sha1", key).update(base_string).digest("base64");
    },
  });
}

function parseFormResponse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split("&")) {
    const [k, v] = part.split("=");
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return out;
}

/** Step 1: request token を取得 + 認証 URL 生成 */
export async function getRequestToken(callbackUrl: string): Promise<{
  requestToken: string;
  requestSecret: string;
  authorizeUrl: string;
}> {
  const oauth = buildOAuth();
  const req = { url: REQUEST_TOKEN_URL, method: "POST", data: { oauth_callback: callbackUrl } };
  const authHeader = oauth.toHeader(oauth.authorize(req));

  const res = await fetch(REQUEST_TOKEN_URL, {
    method: "POST",
    headers: {
      ...authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `oauth_callback=${encodeURIComponent(callbackUrl)}`,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zaim request token 失敗 HTTP ${res.status}: ${body}`);
  }

  const text = await res.text();
  const parsed = parseFormResponse(text);
  const requestToken = parsed.oauth_token;
  const requestSecret = parsed.oauth_token_secret;
  if (!requestToken || !requestSecret) {
    throw new Error(`Zaim request token レスポンス不正: ${text}`);
  }

  return {
    requestToken,
    requestSecret,
    authorizeUrl: `${AUTH_URL}?oauth_token=${encodeURIComponent(requestToken)}`,
  };
}

/** Step 2: callback で受け取った verifier を使い access token に交換 */
export async function getAccessToken(
  requestToken: string,
  requestSecret: string,
  oauthVerifier: string,
): Promise<{ accessToken: string; accessSecret: string }> {
  const oauth = buildOAuth();
  const token = { key: requestToken, secret: requestSecret };
  const req = { url: ACCESS_TOKEN_URL, method: "POST", data: { oauth_verifier: oauthVerifier } };
  const authHeader = oauth.toHeader(oauth.authorize(req, token));

  const res = await fetch(ACCESS_TOKEN_URL, {
    method: "POST",
    headers: {
      ...authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `oauth_verifier=${encodeURIComponent(oauthVerifier)}`,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zaim access token 失敗 HTTP ${res.status}: ${body}`);
  }

  const text = await res.text();
  const parsed = parseFormResponse(text);
  const accessToken = parsed.oauth_token;
  const accessSecret = parsed.oauth_token_secret;
  if (!accessToken || !accessSecret) {
    throw new Error(`Zaim access token レスポンス不正: ${text}`);
  }

  return { accessToken, accessSecret };
}

/** 認証済みリクエスト (任意エンドポイント) */
export async function callZaim<T = unknown>(
  path: string,
  accessToken: string,
  accessSecret: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const oauth = buildOAuth();
  const token = { key: accessToken, secret: accessSecret };
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const req = { url: url.toString(), method: "GET", data: {} };
  const authHeader = oauth.toHeader(oauth.authorize(req, token));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { ...authHeader },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zaim API ${path} HTTP ${res.status}: ${body}`);
  }

  return await res.json();
}

// =====================================================================
// 便利な型 + 高レベル関数
// =====================================================================

export interface ZaimAccount {
  id: number;
  name: string;
  active: number; // 1 or 0
  parent_account_id: number;
  modified: string;
  sort: number;
  /** Zaim 内で管理する残高 (なければ undefined) */
  amount?: number;
  currency_code?: string;
}

/** 口座一覧取得 */
export async function fetchAccounts(
  accessToken: string,
  accessSecret: string,
): Promise<ZaimAccount[]> {
  const data = await callZaim<{ accounts: ZaimAccount[] }>("/home/account", accessToken, accessSecret);
  return data.accounts.filter(a => a.active === 1);
}
