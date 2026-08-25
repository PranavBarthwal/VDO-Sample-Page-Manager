import fs from "node:fs/promises";
import path from "node:path";

const PRESETS_PATH = path.join(process.cwd(), "data", "custom-presets.json");

export interface CustomPreset {
  id: string; // slug used as .vdo-preset-<id>
  name: string;
  css: string; // CSS rules scoped under .vdo-preset-<id>
  config: {
    accent?: string;
    contentAspect?: string;
    entrance?: string;
    glow?: boolean;
    storyBar?: boolean;
  };
  prompt: string;
  createdAt: string;
}

export async function listPresets(): Promise<CustomPreset[]> {
  try {
    const raw = await fs.readFile(PRESETS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CustomPreset[]) : [];
  } catch {
    return [];
  }
}

export async function addPreset(preset: CustomPreset): Promise<void> {
  const all = await listPresets();
  all.unshift(preset);
  await fs.mkdir(path.dirname(PRESETS_PATH), { recursive: true });
  await fs.writeFile(PRESETS_PATH, JSON.stringify(all, null, 2), "utf8");
}

export async function deletePreset(id: string): Promise<void> {
  const all = await listPresets();
  await fs.writeFile(PRESETS_PATH, JSON.stringify(all.filter((p) => p.id !== id), null, 2), "utf8");
}

/** Concatenated CSS for all custom presets — served at /api/presets/css. */
export async function presetsCss(): Promise<string> {
  const all = await listPresets();
  return all
    .map((p) => `/* ${p.name} (${p.id}) */\n${p.css}`)
    .join("\n\n");
}
