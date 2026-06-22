import { NextResponse } from "next/server";
import { getMeta } from "@/lib/storage";
import { runClone } from "@/lib/clone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const existing = await getMeta(params.slug);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const meta = await runClone(existing.url, { origin, slug: params.slug });

  const status = meta.status === "failed" ? 502 : 200;
  return NextResponse.json(meta, { status });
}
