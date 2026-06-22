export interface CloneMeta {
  url: string;
  slug: string;
  createdAt: string;
  htmlPath: string;        // web path to the served clone HTML, e.g. /clones/example/index.html
  assetsPath: string;      // web path to the assets dir, e.g. /clones/example/assets
  screenshotPath: string;  // web path to the original-page screenshot
  // --- extended metadata used by the preview screen ---
  clonePath: string;       // route that serves the clone, e.g. /clones/example
  cloneScreenshotPath: string; // screenshot of our rendered clone
  diffPath: string | null; // pixel-diff visualization (null if comparison failed)
  assetCount: number;
  generationMs: number;
  status: CloneStatus;
  error?: string;
  similarity: SimilarityResult | null;
  title?: string;
}

export type CloneStatus = "success" | "partial" | "failed";

export interface SimilarityResult {
  /** Structural similarity index (0..1) -> presented as %. */
  ssim: number;
  /** Pixel match similarity (0..1) -> presented as %. */
  pixel: number;
  /** Headline number shown in the UI ("Visual Match"). */
  overall: number;
}

export interface AssetRecord {
  absoluteUrl: string;
  webPath: string;   // /clones/{slug}/assets/...
  diskPath: string;  // absolute path on disk
  bytes: number;
  contentType: string;
  kind: AssetKind;
}

export type AssetKind = "css" | "image" | "font" | "svg" | "script" | "other";
