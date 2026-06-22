import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Response } from "playwright";
import * as cheerio from "cheerio";
import {
  assetLocalName,
  cloneDir,
  cloneWebPath,
  kindFromContentType,
} from "./paths";
import type { AssetKind, AssetRecord } from "./types";

export interface ScrapeResult {
  finalUrl: string;
  title: string;
  assets: AssetRecord[];
  htmlDiskPath: string;
  originalScreenshotDiskPath: string;
}

interface CapturedResponse {
  buffer: Buffer;
  contentType: string;
  kind: AssetKind;
}

const NAV_TIMEOUT = 45_000;
const ASSET_CONTENT_TYPES = /^(text\/css|image\/|font\/|application\/(font|x-font)|application\/octet-stream)/i;

/**
 * Render `url` in a headless browser, capture the final DOM and every CSS /
 * image / font / SVG it loaded, download them locally, rewrite all references
 * to local paths, and write a self-contained snapshot under public/clones/{slug}.
 */
export async function scrapeAndStore(url: string, slug: string): Promise<ScrapeResult> {
  const dir = cloneDir(slug);
  const assetsDir = path.join(dir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ args: ["--no-sandbox"] });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    });
    const page = await context.newPage();

    // Collect response bodies for CSS / images / fonts / SVGs as they load.
    const captured = new Map<string, CapturedResponse>();
    const pending: Promise<void>[] = [];

    page.on("response", (response: Response) => {
      pending.push(
        (async () => {
          try {
            const headers = response.headers();
            const contentType = headers["content-type"] || "";
            const reqUrl = response.url();
            const isSvg =
              contentType.includes("svg") || /\.svg(\?|$)/i.test(reqUrl);
            if (!ASSET_CONTENT_TYPES.test(contentType) && !isSvg) return;
            if (!response.ok()) return;
            const buffer = await response.body();
            if (!buffer || buffer.length === 0) return;
            const rec: CapturedResponse = {
              buffer,
              contentType,
              kind: kindFromContentType(contentType, reqUrl),
            };
            // Key by both final and request URL to survive redirects.
            captured.set(response.url(), rec);
            captured.set(response.request().url(), rec);
          } catch {
            /* body unavailable (redirect, aborted, etc.) — skip */
          }
        })()
      );
    });

    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    // Wait for the DOM to be ready (reliable), then treat network idle as
    // best-effort: ad/analytics-heavy pages (e.g. news sites) keep connections
    // open indefinitely and never reach "networkidle", so requiring it would
    // time out and fail an otherwise-cloneable page.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
    await autoScroll(page);
    // Settle any lazy-loaded assets triggered by scrolling.
    await page.waitForTimeout(800);

    const finalUrl = page.url();
    const html = await page.content();
    const title = await page.title();

    const originalScreenshotDiskPath = path.join(dir, "original.png");
    await page.screenshot({ path: originalScreenshotDiskPath, fullPage: true });

    await context.close();
    await browser.close();
    browser = null;

    // Make sure every in-flight body read has resolved.
    await Promise.allSettled(pending);

    // --- Persist captured assets to disk and build the URL -> local-path map ---
    const records: AssetRecord[] = [];
    const urlToWebPath = new Map<string, string>();

    for (const [absUrl, cap] of captured) {
      const rel = assetLocalName(absUrl, cap.contentType); // e.g. assets/host/path.css
      const segments = rel.split("/");
      const webPath = cloneWebPath(slug, ...segments); // /clones/slug/assets/host/path.css
      const diskPath = path.join(dir, ...segments);
      urlToWebPath.set(absUrl, webPath);
      if (!records.find((r) => r.diskPath === diskPath)) {
        records.push({
          absoluteUrl: absUrl,
          webPath,
          diskPath,
          bytes: cap.buffer.length,
          contentType: cap.contentType,
          kind: cap.kind,
        });
      }
    }

    // Write asset bytes, rewriting url(...) references inside CSS files.
    for (const rec of records) {
      const cap = captured.get(rec.absoluteUrl)!;
      await fs.mkdir(path.dirname(rec.diskPath), { recursive: true });
      if (rec.kind === "css") {
        const css = cap.buffer.toString("utf8");
        const rewritten = rewriteCssUrls(css, rec.absoluteUrl, urlToWebPath);
        await fs.writeFile(rec.diskPath, rewritten, "utf8");
      } else {
        await fs.writeFile(rec.diskPath, cap.buffer);
      }
    }

    // --- Rewrite the HTML document ---
    const rewrittenHtml = rewriteHtml(html, finalUrl, urlToWebPath);
    const htmlDiskPath = path.join(dir, "index.html");
    await fs.writeFile(htmlDiskPath, rewrittenHtml, "utf8");

    return {
      finalUrl,
      title,
      assets: records,
      htmlDiskPath,
      originalScreenshotDiskPath,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/** Scroll to the bottom in steps to trigger lazy-loaded images/fonts. */
async function autoScroll(page: import("playwright").Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let total = 0;
      const step = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
    });
  });
}

function resolveAbs(ref: string, base: string): string | null {
  if (!ref) return null;
  const trimmed = ref.trim();
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:")
  ) {
    return null;
  }
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return null;
  }
}

function mapRef(
  ref: string,
  base: string,
  urlToWebPath: Map<string, string>
): string | null {
  const abs = resolveAbs(ref, base);
  if (!abs) return null;
  return urlToWebPath.get(abs) ?? null;
}

/** Rewrite a srcset value, remapping each candidate URL that we captured. */
function rewriteSrcset(
  srcset: string,
  base: string,
  urlToWebPath: Map<string, string>
): string {
  return srcset
    .split(",")
    .map((part) => {
      const seg = part.trim();
      if (!seg) return seg;
      const [u, ...descriptor] = seg.split(/\s+/);
      const local = mapRef(u, base, urlToWebPath);
      return [local ?? u, ...descriptor].join(" ");
    })
    .join(", ");
}

function rewriteCssUrls(
  css: string,
  cssUrl: string,
  urlToWebPath: Map<string, string>
): string {
  // url(...) references
  let out = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, q, ref) => {
    const local = mapRef(ref, cssUrl, urlToWebPath);
    return local ? `url(${q}${local}${q})` : full;
  });
  // @import "..." (without url())
  out = out.replace(/@import\s+(['"])([^'"]+)\1/gi, (full, q, ref) => {
    const local = mapRef(ref, cssUrl, urlToWebPath);
    return local ? `@import ${q}${local}${q}` : full;
  });
  return out;
}

function rewriteHtml(
  html: string,
  baseUrl: string,
  urlToWebPath: Map<string, string>
): string {
  const $ = cheerio.load(html, { decodeEntities: false });

  // The captured DOM is already fully rendered — strip scripts so the clone is
  // an inert, faithful snapshot that won't redirect or re-fetch from the origin.
  $("script").remove();
  $("base").remove();

  const attrTargets: Array<[string, string]> = [
    ["img", "src"],
    ["img", "data-src"],
    ["source", "src"],
    ["video", "src"],
    ["video", "poster"],
    ["audio", "src"],
    ["embed", "src"],
    ["object", "data"],
    ["use", "href"],
    ["use", "xlink:href"],
    ["image", "href"],
    ["image", "xlink:href"],
    ["input", "src"],
  ];
  for (const [sel, attr] of attrTargets) {
    $(sel).each((_, el) => {
      const ref = $(el).attr(attr);
      if (!ref) return;
      const local = mapRef(ref, baseUrl, urlToWebPath);
      if (local) $(el).attr(attr, local);
    });
  }

  // srcset (img + source)
  $("img[srcset], source[srcset]").each((_, el) => {
    const ss = $(el).attr("srcset");
    if (ss) $(el).attr("srcset", rewriteSrcset(ss, baseUrl, urlToWebPath));
  });

  // stylesheets, icons, preloaded fonts/images
  $("link[href]").each((_, el) => {
    const rel = ($(el).attr("rel") || "").toLowerCase();
    if (
      rel.includes("stylesheet") ||
      rel.includes("icon") ||
      rel.includes("preload") ||
      rel.includes("apple-touch")
    ) {
      const ref = $(el).attr("href");
      const local = ref && mapRef(ref, baseUrl, urlToWebPath);
      if (local) $(el).attr("href", local);
    }
  });

  // inline style attributes
  $("[style]").each((_, el) => {
    const style = $(el).attr("style");
    if (style && style.includes("url(")) {
      $(el).attr("style", rewriteCssUrls(style, baseUrl, urlToWebPath));
    }
  });

  // <style> blocks
  $("style").each((_, el) => {
    const css = $(el).html();
    if (css && css.includes("url(")) {
      $(el).html(rewriteCssUrls(css, baseUrl, urlToWebPath));
    }
  });

  return $.html();
}
