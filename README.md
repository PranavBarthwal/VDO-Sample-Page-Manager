# VDO Sample Page Manager

Enter any public webpage URL → the app renders it headlessly, captures the
final DOM + CSS + images + fonts + SVGs, stores them locally, rewrites every
asset reference to a local path, and serves a faithful clone at a generated
route `/clones/{slug}`. A side-by-side preview compares the original and the
clone with a Visual Match score (SSIM + pixel similarity).

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Playwright** (Chromium) — rendering, asset capture, screenshots
- **cheerio** — HTML reference rewriting
- **sharp** + **pixelmatch** + **pngjs** — screenshot comparison

## Getting started

```bash
npm install        # also runs `playwright install chromium`
npm run dev        # http://localhost:3000
```

If the Chromium download is skipped/blocked, run it manually:

```bash
npx playwright install chromium
```

## How it works

| Step | Where |
| --- | --- |
| Render page, wait for network idle, auto-scroll for lazy assets | `lib/scraper.ts` |
| Capture CSS / images / fonts / SVGs from network responses | `lib/scraper.ts` |
| Download assets, preserve folder structure, rewrite URLs (HTML + CSS) | `lib/scraper.ts`, `lib/paths.ts` |
| Screenshot original + served clone, compute SSIM & pixel diff | `lib/clone.ts`, `lib/similarity.ts` |
| Persist metadata JSON | `lib/storage.ts` → `data/clones/{slug}.json` |
| Serve clone in a full-viewport iframe | `app/clones/[slug]/page.tsx` |
| Serve stored clone files (HTML/assets/screenshots) from disk | `app/clones/[slug]/[...path]/route.ts` |
| Dashboard (clone / history / delete / regenerate) | `app/page.tsx` |
| Side-by-side preview + stats | `app/preview/[slug]/page.tsx` |

### Storage layout

Clone files live in `clone-store/` (not `public/`) and are served through a
route handler — `next start` only serves `public/` files that existed at build
time, so runtime-written files there would 404.

```
clone-store/{slug}/
  index.html        # rewritten, self-contained snapshot
  assets/{host}/…   # downloaded assets, folder structure preserved
  original.png      # original-page screenshot
  clone.png         # served-clone screenshot
  diff.png          # pixel-diff visualization
data/clones/{slug}.json   # metadata
```

`/clones/{slug}/*` (e.g. `index.html`, `assets/…`, `*.png`) is served by
`app/clones/[slug]/[...path]/route.ts`, which streams files from
`clone-store/{slug}` with the correct content-type and a path-traversal guard.

### Metadata shape

```json
{
  "url": "https://example.com",
  "slug": "example",
  "createdAt": "2026-06-19T00:00:00.000Z",
  "htmlPath": "/clones/example/index.html",
  "assetsPath": "/clones/example/assets",
  "screenshotPath": "/clones/example/original.png",
  "clonePath": "/clones/example",
  "cloneScreenshotPath": "/clones/example/clone.png",
  "diffPath": "/clones/example/diff.png",
  "assetCount": 0,
  "generationMs": 0,
  "status": "success",
  "similarity": { "ssim": 0.0, "pixel": 0.0, "overall": 0.0 }
}
```

## Notes & limitations

- Scripts are stripped from the clone on purpose — the captured DOM is already
  fully rendered, so the snapshot stays inert and won't redirect or re-fetch
  from the origin.
- Highly dynamic pages, lazy content behind interaction, and cross-origin
  framing protections on the *original* can reduce fidelity.
- Clone routing serves the snapshot in an iframe to isolate its styles from the
  app shell.
- Clone these only for pages you're authorized to copy.
