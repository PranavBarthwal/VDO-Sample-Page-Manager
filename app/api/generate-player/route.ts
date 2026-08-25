import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicKey } from "@/lib/config";
import { addPreset, type CustomPreset } from "@/lib/presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ASPECTS = ["9:16", "1:1", "4:5", "16:9", "4:3"];
const ENTRANCES = ["none", "fade", "slide", "scale", "flip"];

function slugify(s: string): string {
  return (
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "player"
  );
}

/** Strip anything that could break out of the <style> sandbox. */
function sanitizeCss(css: string): string {
  return css
    .replace(/<\/?\s*style[^>]*>/gi, "")
    .replace(/<\s*script/gi, "")
    .replace(/@import[^;]+;/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/expression\s*\(/gi, "")
    .slice(0, 8000);
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", description: "Short, human-friendly preset name (2-4 words)" },
    css: {
      type: "string",
      description:
        "CSS rules for the player skin. EVERY selector MUST start with the placeholder .PRESET_ROOT (it will be replaced with the real class). Override CSS variables on .PRESET_ROOT and optionally style child elements.",
    },
    accent: { type: "string", description: "Accent color as a hex string, e.g. #ff3040" },
    contentAspect: { type: "string", enum: ASPECTS },
    entrance: { type: "string", enum: ENTRANCES },
    glow: { type: "boolean" },
    storyBar: { type: "boolean" },
  },
  required: ["name", "css", "accent", "contentAspect", "entrance", "glow", "storyBar"],
};

const SYSTEM = `You design CSS "skins" for a self-contained video ad player used in an ad-tech demo tool. You only produce CSS — never JavaScript.

The player markup (do not change it) uses these classes you may style:
- .PRESET_ROOT            the player root (set CSS variables + border/background here)
- .vdo-stage             the video viewport (relative, contains everything)
- .vdo-scrim-top/.vdo-scrim-bottom   gradient scrims
- .vdo-top               top bar (title + buttons)
- .vdo-title             title text
- .vdo-pill              the "VDO" brand pill
- .vdo-iconbtn           round control buttons
- .vdo-center-btn        center play button
- .vdo-controls          bottom controls container
- .vdo-progress          progress track
- .vdo-progress-fill     progress fill (use the accent)

Available CSS variables to override on .PRESET_ROOT:
--vdo-accent, --vdo-bg, --vdo-fg, --vdo-muted, --vdo-radius, --vdo-control-bg, --vdo-shadow

Rules:
- EVERY selector MUST begin with .PRESET_ROOT (e.g. ".PRESET_ROOT", ".PRESET_ROOT .vdo-pill").
- No @import, no url() to external resources, no <script>, no JS, no position:fixed.
- Keep it tasteful and production-credible — like players from Teads, Connatix, JW Player, YouTube, Instagram Reels.
- Output strictly via the structured schema.`;

export async function POST(request: Request) {
  const apiKey = await getAnthropicKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Anthropic API key set. Add one in Settings." },
      { status: 400 }
    );
  }

  let body: { prompt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const prompt = (body.prompt || "").trim();
  if (!prompt) return NextResponse.json({ error: "A description is required" }, { status: 400 });

  const client = new Anthropic({ apiKey });

  let parsed: any;
  try {
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } } as any,
      messages: [
        {
          role: "user",
          content: `Design a video player skin for this brief:\n\n"${prompt}"\n\nReturn the CSS and recommended config.`,
        },
      ],
    });
    const textBlock = message.content.find((b: any) => b.type === "text") as any;
    if (!textBlock?.text) throw new Error("Empty response from model");
    parsed = JSON.parse(textBlock.text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Generation failed: ${msg}` }, { status: 502 });
  }

  const id = `${slugify(parsed.name || prompt)}-${Date.now().toString(36).slice(-5)}`;
  const css = sanitizeCss(String(parsed.css || "")).replace(/\.PRESET_ROOT/g, `.vdo-preset-${id}`);

  const preset: CustomPreset = {
    id,
    name: String(parsed.name || "Custom Player").slice(0, 60),
    css,
    config: {
      accent: typeof parsed.accent === "string" ? parsed.accent : undefined,
      contentAspect: ASPECTS.includes(parsed.contentAspect) ? parsed.contentAspect : "9:16",
      entrance: ENTRANCES.includes(parsed.entrance) ? parsed.entrance : "fade",
      glow: !!parsed.glow,
      storyBar: !!parsed.storyBar,
    },
    prompt,
    createdAt: new Date().toISOString(),
  };

  await addPreset(preset);
  return NextResponse.json({ preset });
}
