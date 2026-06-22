import { NextResponse } from "next/server";
import { listMeta } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const clones = await listMeta();
  return NextResponse.json({ clones });
}
