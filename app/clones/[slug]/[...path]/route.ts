import fs from "node:fs";
import path from "node:path";
import { cloneDir } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
};

/**
 * Serves a clone's stored files (index.html, assets/…, screenshots) from the
 * on-disk store, which lives outside /public so it works under `next start`.
 * Path traversal is blocked by resolving and verifying containment.
 */
export function GET(
  _request: Request,
  { params }: { params: { slug: string; path: string[] } }
) {
  const base = path.resolve(cloneDir(params.slug));
  const target = path.resolve(base, ...(params.path ?? []));

  // Containment check — never serve outside the clone's own directory.
  if (target !== base && !target.startsWith(base + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!stat.isFile()) return new Response("Not found", { status: 404 });

  const ext = path.extname(target).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
  const data = fs.readFileSync(target);

  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Cache-Control": "no-store",
    },
  });
}
