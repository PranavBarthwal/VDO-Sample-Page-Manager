import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, cloneDir, metaPath } from "./paths";
import type { CloneMeta } from "./types";

async function ensureDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function saveMeta(meta: CloneMeta): Promise<void> {
  await ensureDirs();
  await fs.writeFile(metaPath(meta.slug), JSON.stringify(meta, null, 2), "utf8");
}

export async function getMeta(slug: string): Promise<CloneMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(slug), "utf8");
    return JSON.parse(raw) as CloneMeta;
  } catch {
    return null;
  }
}

export async function listMeta(): Promise<CloneMeta[]> {
  await ensureDirs();
  let files: string[];
  try {
    files = await fs.readdir(DATA_DIR);
  } catch {
    return [];
  }
  const metas: CloneMeta[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, f), "utf8");
      metas.push(JSON.parse(raw) as CloneMeta);
    } catch {
      /* skip corrupt entry */
    }
  }
  // Newest first.
  return metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Ad-unit placements layered onto a clone (rendered at serve time). */
export interface AdPlacement {
  unitId: string;
  placement: "in-flow" | "viewport";
  selector: string | null;
  position: "after" | "before";
  config: Record<string, unknown>;
}

function layoutPath(slug: string): string {
  return path.join(cloneDir(slug), "layout.json");
}

export async function getLayout(slug: string): Promise<AdPlacement[]> {
  try {
    const raw = await fs.readFile(layoutPath(slug), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AdPlacement[]) : [];
  } catch {
    return [];
  }
}

export async function saveLayout(slug: string, placements: AdPlacement[]): Promise<void> {
  await fs.mkdir(cloneDir(slug), { recursive: true });
  await fs.writeFile(layoutPath(slug), JSON.stringify(placements, null, 2), "utf8");
}

export async function deleteClone(slug: string): Promise<boolean> {
  const meta = await getMeta(slug);
  await fs.rm(cloneDir(slug), { recursive: true, force: true });
  await fs.rm(metaPath(slug), { force: true });
  return meta !== null;
}
