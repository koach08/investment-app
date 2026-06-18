import { NextRequest, NextResponse } from "next/server";

// Persistence moved from the local filesystem (read-only on Vercel -> EROFS) to a
// Supabase KV table so the deployed site can both read fresh data and accept writes.
// The key is server-only (no NEXT_PUBLIC_*) and never reaches the browser; the client
// always goes through this same-origin route.
const SUPABASE_URL = process.env.INVESTMENT_KV_SUPABASE_URL;
const SUPABASE_KEY = process.env.INVESTMENT_KV_SUPABASE_KEY;
const TABLE = "investment_app_kv";

function config() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("INVESTMENT_KV_SUPABASE_URL / INVESTMENT_KV_SUPABASE_KEY 未設定");
  }
  return {
    base: `${SUPABASE_URL}/rest/v1/${TABLE}`,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, data } = body;
    if (!key || data === undefined || data === null) {
      return NextResponse.json({ error: "key and data required" }, { status: 400 });
    }
    const safeKey = String(key).replace(/[^a-zA-Z0-9_-]/g, "");
    const { base, headers } = config();

    const res = await fetch(base, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key: safeKey, data, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: `保存失敗: ${res.status} ${detail}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `保存失敗: ${e instanceof Error ? e.message : "unknown"}` }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get("key");
    if (!key) {
      return NextResponse.json({ error: "key required" }, { status: 400 });
    }
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "");
    const { base, headers } = config();

    const res = await fetch(`${base}?key=eq.${encodeURIComponent(safeKey)}&select=data`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: `読込失敗: ${res.status} ${detail}` }, { status: 500 });
    }
    const rows = (await res.json()) as { data: unknown }[];
    return NextResponse.json({ data: rows.length > 0 ? rows[0].data : null });
  } catch (e) {
    return NextResponse.json({ error: `読込失敗: ${e instanceof Error ? e.message : "unknown"}` }, { status: 500 });
  }
}
