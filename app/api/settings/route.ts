import { NextResponse } from "next/server";
import { getConfig, saveConfig, getAnthropicKey } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const key = await getAnthropicKey();
  const cfg = await getConfig();
  return NextResponse.json({
    hasKey: !!key,
    fromEnv: !cfg.anthropicApiKey && !!process.env.ANTHROPIC_API_KEY,
  });
}

export async function POST(request: Request) {
  let body: { apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const apiKey = (body.apiKey || "").trim();
  await saveConfig({ anthropicApiKey: apiKey });
  return NextResponse.json({ ok: true, hasKey: !!apiKey });
}
