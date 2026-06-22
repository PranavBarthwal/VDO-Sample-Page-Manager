import { NextResponse } from "next/server";
import { deleteClone, getMeta } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  const meta = await getMeta(params.slug);
  if (!meta) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(meta);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  const existed = await deleteClone(params.slug);
  if (!existed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
