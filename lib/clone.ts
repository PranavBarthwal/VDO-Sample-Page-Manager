import path from "node:path";
import { chromium } from "playwright";
import { scrapeAndStore } from "./scraper";
import { compareScreenshots } from "./similarity";
import { saveMeta } from "./storage";
import { cloneDir, cloneWebPath, urlToSlug } from "./paths";
import type { CloneMeta } from "./types";

export interface CloneOptions {
  /** Origin of THIS app (e.g. http://localhost:3000) so we can screenshot our own clone. */
  origin: string;
  /** Reuse an existing slug (regenerate); otherwise derive from the URL. */
  slug?: string;
}

/**
 * Full pipeline: scrape -> store assets -> screenshot the served clone ->
 * compute visual similarity -> persist metadata. Always returns a CloneMeta,
 * even on failure (status: "failed").
 */
export async function runClone(url: string, opts: CloneOptions): Promise<CloneMeta> {
  const started = Date.now();
  const slug = opts.slug ?? urlToSlug(url);
  const dir = cloneDir(slug);

  const base: CloneMeta = {
    url,
    slug,
    createdAt: new Date().toISOString(),
    htmlPath: cloneWebPath(slug, "index.html"),
    assetsPath: cloneWebPath(slug, "assets"),
    screenshotPath: cloneWebPath(slug, "original.png"),
    clonePath: `/clones/${slug}`,
    cloneScreenshotPath: cloneWebPath(slug, "clone.png"),
    diffPath: null,
    assetCount: 0,
    generationMs: 0,
    status: "failed",
    similarity: null,
  };

  try {
    const scraped = await scrapeAndStore(url, slug);
    base.url = url;
    base.title = scraped.title;
    base.assetCount = scraped.assets.length;

    // Screenshot our own served clone through the running app.
    const cloneShotDisk = path.join(dir, "clone.png");
    let cloneShotOk = false;
    try {
      await screenshotClone(`${opts.origin}/clones/${slug}/index.html`, cloneShotDisk);
      cloneShotOk = true;
    } catch {
      cloneShotOk = false;
    }

    // Compare original vs clone screenshots.
    if (cloneShotOk) {
      try {
        const diffDisk = path.join(dir, "diff.png");
        base.similarity = await compareScreenshots(
          scraped.originalScreenshotDiskPath,
          cloneShotDisk,
          diffDisk
        );
        base.diffPath = cloneWebPath(slug, "diff.png");
      } catch {
        base.similarity = null;
      }
    }

    // Success when our clone rendered and was screenshotted. A page can
    // legitimately have zero external assets (everything inlined), so asset
    // count is not a success criterion. "partial" means the snapshot was
    // captured but we couldn't render/screenshot the served clone.
    base.status = cloneShotOk ? "success" : "partial";
    base.generationMs = Date.now() - started;
    await saveMeta(base);
    return base;
  } catch (err) {
    base.status = "failed";
    base.error = err instanceof Error ? err.message : String(err);
    base.generationMs = Date.now() - started;
    await saveMeta(base);
    return base;
  }
}

async function screenshotClone(pageUrl: string, outPath: string): Promise<void> {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: outPath, fullPage: true });
    await ctx.close();
  } finally {
    await browser.close().catch(() => {});
  }
}
