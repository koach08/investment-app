import { NextRequest, NextResponse } from "next/server";

const CRYPTO_TRADER_BASE = process.env.CRYPTO_TRADER_URL || "http://localhost:3004";

async function proxy(req: NextRequest, path: string[]) {
  const url = new URL(req.url);
  const target = `${CRYPTO_TRADER_BASE}/api/${path.join("/")}${url.search}`;

  try {
    const init: RequestInit = {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const body = await req.text();
      if (body) init.body = body;
    }

    const resp = await fetch(target, init);
    const text = await resp.text();

    // Pass through whatever crypto-trader returned
    try {
      return NextResponse.json(JSON.parse(text), { status: resp.status });
    } catch {
      return new NextResponse(text, { status: resp.status });
    }
  } catch (e) {
    return NextResponse.json(
      {
        error: "crypto-trader unreachable",
        message: e instanceof Error ? e.message : String(e),
        target,
      },
      { status: 502 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(req, path);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(req, path);
}
