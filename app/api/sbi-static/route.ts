import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * GitHub commit された data/sbi-holdings.json を返す.
 * local cron で更新 → push → Vercel 再 deploy → このエンドポイントから最新が見える.
 */
export async function GET() {
  const path = join(process.cwd(), "data", "sbi-holdings.json");
  if (!existsSync(path)) {
    return NextResponse.json(
      { error: "data/sbi-holdings.json が無い。local で `npm run sync:sbi` を実行してください。", connected: false },
      { status: 503 }
    );
  }
  try {
    const content = readFileSync(path, "utf-8");
    const data = JSON.parse(content);
    return NextResponse.json({ ...data, connected: true });
  } catch (e) {
    return NextResponse.json(
      { error: `JSON 読み込み失敗: ${e instanceof Error ? e.message : "unknown"}`, connected: false },
      { status: 500 }
    );
  }
}
