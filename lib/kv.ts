/**
 * Supabase の KV テーブルへのサーバー側アクセス。
 *
 * 画面からは /api/save-data 経由で読み書きするが、cron のように
 * サーバー内で完結する処理は自分自身に HTTP を投げたくないのでここを使う。
 * テーブルとキーの正規化ルールは /api/save-data と揃えてある。
 */

const TABLE = "investment_app_kv";

function config() {
  const url = process.env.INVESTMENT_KV_SUPABASE_URL;
  const key = process.env.INVESTMENT_KV_SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("INVESTMENT_KV_SUPABASE_URL / INVESTMENT_KV_SUPABASE_KEY 未設定");
  }
  return {
    base: `${url}/rest/v1/${TABLE}`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  };
}

/** /api/save-data と同じ正規化。ここがずれると読み書きで別キーになる */
export function safeKey(key: string): string {
  return String(key).replace(/[^a-zA-Z0-9_-]/g, "");
}

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const { base, headers } = config();
  const res = await fetch(`${base}?key=eq.${encodeURIComponent(safeKey(key))}&select=data`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV読込失敗 ${res.status}: ${await res.text()}`);
  const rows = (await res.json()) as { data: T }[];
  return rows.length > 0 ? rows[0].data : null;
}

export async function kvSet(key: string, data: unknown): Promise<void> {
  const { base, headers } = config();
  const res = await fetch(base, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: safeKey(key), data, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`KV保存失敗 ${res.status}: ${await res.text()}`);
}
