import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

async function ensureDir() {
  try { await mkdir(DATA_DIR, { recursive: true }); } catch { /* exists */ }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDir();
    const body = await request.json();
    const { key, data } = body;

    if (!key || !data) {
      return NextResponse.json({ error: "key and data required" }, { status: 400 });
    }

    // Sanitize key
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "");
    const filePath = path.join(DATA_DIR, `${safeKey}.json`);
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");

    return NextResponse.json({ ok: true, path: filePath });
  } catch (e) {
    return NextResponse.json({ error: `保存失敗: ${e instanceof Error ? e.message : "unknown"}` }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureDir();
    const key = request.nextUrl.searchParams.get("key");
    if (!key) {
      return NextResponse.json({ error: "key required" }, { status: 400 });
    }

    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "");
    const filePath = path.join(DATA_DIR, `${safeKey}.json`);

    try {
      const content = await readFile(filePath, "utf-8");
      return NextResponse.json({ data: JSON.parse(content) });
    } catch {
      return NextResponse.json({ data: null });
    }
  } catch (e) {
    return NextResponse.json({ error: `読込失敗: ${e instanceof Error ? e.message : "unknown"}` }, { status: 500 });
  }
}
