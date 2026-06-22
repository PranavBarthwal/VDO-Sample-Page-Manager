import path from "node:path";
import crypto from "node:crypto";

/**
 * Root of the on-disk store for served clone files (HTML, assets, screenshots).
 * Kept OUTSIDE /public on purpose: `next start` only serves public files that
 * existed at build time, so runtime-written files there 404. We serve these
 * through a route handler (app/clones/[slug]/[...path]) that reads from disk.
 */
export const CLONE_STORE_DIR = path.join(process.cwd(), "clone-store");

/** Root of the metadata store (one JSON file per clone). */
export const DATA_DIR = path.join(process.cwd(), "data", "clones");

/** Turn a URL into a short, filesystem- and route-safe slug. */
export function urlToSlug(rawUrl: string): string {
  let host = "";
  let pathname = "";
  try {
    const u = new URL(rawUrl);
    host = u.hostname.replace(/^www\./, "");
    pathname = u.pathname;
  } catch {
    host = rawUrl;
  }

  // example.com           -> example
  // example.com/foo/bar   -> example-foo-bar
  const hostPart = host.split(".")[0] || "site";
  const pathPart = pathname
    .split("/")
    .filter(Boolean)
    .join("-");

  let slug = [hostPart, pathPart].filter(Boolean).join("-");
  slug = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) slug = "site";
  // Keep slugs reasonable; disambiguate longer URLs with a short hash.
  if (slug.length > 60 || pathPart) {
    const hash = crypto.createHash("sha1").update(rawUrl).digest("hex").slice(0, 6);
    slug = `${slug.slice(0, 60)}-${hash}`;
  }
  return slug;
}

/** Disk dir holding a clone's served files (html, assets, screenshots). */
export function cloneDir(slug: string): string {
  return path.join(CLONE_STORE_DIR, slug);
}

/** Disk path to a clone's metadata JSON. */
export function metaPath(slug: string): string {
  return path.join(DATA_DIR, `${slug}.json`);
}

/** Web path (served by Next from /public) for a file inside a clone dir. */
export function cloneWebPath(slug: string, ...parts: string[]): string {
  return ["/clones", slug, ...parts].join("/");
}

/**
 * Map an absolute asset URL to a local, collision-resistant path under assets/.
 * Mirrors host + pathname so the folder structure is preserved, and folds the
 * query string into the filename so `?v=2` variants don't clobber each other.
 */
export function assetLocalName(absoluteUrl: string, contentType?: string): string {
  let u: URL;
  try {
    u = new URL(absoluteUrl);
  } catch {
    return `assets/misc/${crypto.createHash("sha1").update(absoluteUrl).digest("hex").slice(0, 12)}`;
  }

  const host = u.hostname.replace(/[^a-z0-9.-]/gi, "_");
  let p = decodeURIComponent(u.pathname);
  if (!p || p.endsWith("/")) p += "index";

  // Fold query into the filename to keep variants distinct.
  if (u.search) {
    const qHash = crypto.createHash("sha1").update(u.search).digest("hex").slice(0, 8);
    const ext = path.extname(p);
    const base = ext ? p.slice(0, -ext.length) : p;
    p = `${base}.${qHash}${ext}`;
  }

  let rel = path.posix.join("assets", host, p);

  // Ensure a sensible extension when the URL has none.
  if (!path.extname(rel) && contentType) {
    const ext = extFromContentType(contentType);
    if (ext) rel += ext;
  }

  // Sanitize each segment.
  rel = rel
    .split("/")
    .map((seg) => seg.replace(/[<>:"\\|?*\x00-\x1f]/g, "_"))
    .join("/");

  return rel;
}

export function extFromContentType(contentType: string): string {
  const ct = contentType.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "text/css": ".css",
    "text/html": ".html",
    "application/javascript": ".js",
    "text/javascript": ".js",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
    "font/woff2": ".woff2",
    "font/woff": ".woff",
    "font/ttf": ".ttf",
    "font/otf": ".otf",
    "application/font-woff2": ".woff2",
    "application/font-woff": ".woff",
    "application/x-font-ttf": ".ttf",
  };
  return map[ct] || "";
}

export function kindFromContentType(contentType: string, url: string): import("./types").AssetKind {
  const ct = contentType.split(";")[0].trim().toLowerCase();
  if (ct.includes("css")) return "css";
  if (ct === "image/svg+xml" || /\.svg(\?|$)/i.test(url)) return "svg";
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("font/") || ct.includes("font") || /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url))
    return "font";
  if (ct.includes("javascript")) return "script";
  return "other";
}
