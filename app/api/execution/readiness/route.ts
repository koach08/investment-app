import { NextResponse } from "next/server";
import { getExecutionReadiness } from "@/lib/execution/readiness";

export async function GET() {
  return NextResponse.json(getExecutionReadiness());
}
