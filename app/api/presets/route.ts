import { NextResponse } from "next/server";
import { listPresets, deletePreset } from "@/lib/presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const presets = await listPresets();
  // Don't ship full CSS in the list payload — names + config are enough for pickers.
  return NextResponse.json({
    presets: presets.map((p) => ({ id: p.id, name: p.name, config: p.config, createdAt: p.createdAt })),
  });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deletePreset(id);
  return NextResponse.json({ ok: true });
}
