import { NextResponse } from "next/server";
import { getMeta, getLayout, saveLayout, type AdPlacement } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  const placements = await getLayout(params.slug);
  return NextResponse.json({ placements });
}

export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const meta = await getMeta(params.slug);
  if (!meta) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { placements?: AdPlacement[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const placements = Array.isArray(body.placements) ? body.placements : [];
  await saveLayout(params.slug, placements);
  return NextResponse.json({ ok: true, count: placements.length });
}
