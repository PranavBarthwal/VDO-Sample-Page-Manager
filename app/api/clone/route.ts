import { NextResponse } from "next/server";
import { runClone } from "@/lib/clone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = (body.url || "").trim();
  if (!url) {
    return NextResponse.json({ error: "A URL is required" }, { status: 400 });
  }

  let normalized: string;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("Only http(s) URLs are supported");
    }
    normalized = u.toString();
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const meta = await runClone(normalized, { origin });

  const status = meta.status === "failed" ? 502 : 200;
  return NextResponse.json(meta, { status });
}
