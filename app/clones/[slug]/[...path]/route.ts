import fs from "node:fs";
import path from "node:path";
import { cloneDir } from "@/lib/paths";
import { getLayout } from "@/lib/storage";

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
export async function GET(
  request: Request,
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

  // For the HTML document, inject the ad bootstrap + saved layout — unless the
  // editor requested the raw page (?edit=1), where it manages units itself.
  if (ext === ".html") {
    const editMode = new URL(request.url).searchParams.get("edit") === "1";
    let html = fs.readFileSync(target, "utf8");
    // Strip Content-Security-Policy meta tags — `upgrade-insecure-requests` and
    // script-src policies break the injected ad scripts on http/localhost.
    html = html.replace(
      /<meta[^>]+http-equiv=["']?content-security-policy[^>]*>/gi,
      ""
    );
    if (!editMode) {
      const placements = await getLayout(params.slug);
      if (placements.length) {
        const json = JSON.stringify(placements).replace(/</g, "\\u003c");
        const inject =
          // Restore natural scrolling — many pages set body{overflow:hidden} and
          // drive scroll via JS (which we strip), which would break scroll-driven
          // ad behavior (sticky dock, scroll-reveal).
          "\n<style>html,body{overflow-x:hidden!important;overflow-y:auto!important;height:auto!important;position:static!important}</style>" +
          '\n<link rel="stylesheet" href="/vdo/vdo-player.css">' +
          '\n<link rel="stylesheet" href="/vdo/vdo-ads.css">' +
          '\n<link rel="stylesheet" href="/api/presets/css">' +
          '\n<script src="/vdo/vdo-player.js"></script>' +
          '\n<script src="/vdo/vdo-ads.js"></script>' +
          "\n<script>window.__VDO_LAYOUT__=" + json + ";</script>" +
          '\n<script src="/vdo/vdo-boot.js"></script>\n';
        // Append at the very end — pages can contain multiple/escaped </body>
        // markers; trailing scripts still execute reliably in the browser.
        html = html + inject;
      }
    }
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
    });
  }

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
