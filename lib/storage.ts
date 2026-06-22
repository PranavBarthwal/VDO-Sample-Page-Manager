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

export async function deleteClone(slug: string): Promise<boolean> {
  const meta = await getMeta(slug);
  await fs.rm(cloneDir(slug), { recursive: true, force: true });
  await fs.rm(metaPath(slug), { force: true });
  return meta !== null;
}
