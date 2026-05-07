import { NextRequest, NextResponse } from "next/server";
import { getAudits, getPerformanceSummary } from "@/lib/quant/audit-log";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker") ?? undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "100");
  const audits = await getAudits({ ticker, limit });
  const summary = await getPerformanceSummary();
  return NextResponse.json({ audits, summary });
}
