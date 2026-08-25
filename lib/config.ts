import fs from "node:fs/promises";
import path from "node:path";

const CONFIG_PATH = path.join(process.cwd(), "data", "config.json");

export interface AppConfig {
  anthropicApiKey?: string;
}

export async function getConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    return JSON.parse(raw) as AppConfig;
  } catch {
    return {};
  }
}

export async function saveConfig(patch: Partial<AppConfig>): Promise<void> {
  const current = await getConfig();
  const next = { ...current, ...patch };
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");
}

/** Resolve the Anthropic key from the settings file or the environment. */
export async function getAnthropicKey(): Promise<string | null> {
  const cfg = await getConfig();
  return cfg.anthropicApiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || null;
}
