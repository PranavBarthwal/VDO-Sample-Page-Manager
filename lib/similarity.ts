import fs from "node:fs/promises";
import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { SimilarityResult } from "./types";

/** Common canvas the two screenshots are normalized to before comparison. */
const COMPARE_WIDTH = 1000;
const COMPARE_HEIGHT = 1400;

/**
 * Compare the original screenshot with the clone screenshot.
 * Produces a pixel-match similarity, a (grayscale) SSIM, a blended headline
 * score, and writes a diff visualization PNG to `diffOutPath`.
 */
export async function compareScreenshots(
  originalPath: string,
  clonePath: string,
  diffOutPath: string
): Promise<SimilarityResult> {
  const [a, b] = await Promise.all([
    normalize(originalPath),
    normalize(clonePath),
  ]);

  const { width, height } = a.info;
  const diff = new PNG({ width, height });

  const mismatched = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: 0.1,
    includeAA: false,
  });

  await fs.writeFile(diffOutPath, PNG.sync.write(diff));

  const totalPixels = width * height;
  const pixel = 1 - mismatched / totalPixels;
  const ssim = grayscaleSSIM(a.data, b.data, width, height);

  // Headline blends both; SSIM tends to track perceived structure better.
  const overall = 0.5 * pixel + 0.5 * ssim;

  return {
    pixel: clamp01(pixel),
    ssim: clamp01(ssim),
    overall: clamp01(overall),
  };
}

async function normalize(
  imgPath: string
): Promise<{ data: Buffer; info: { width: number; height: number } }> {
  // Fit onto a white canvas of fixed size so both images share dimensions.
  const buf = await sharp(imgPath)
    .resize(COMPARE_WIDTH, COMPARE_HEIGHT, {
      fit: "contain",
      position: "top",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer();
  return { data: buf, info: { width: COMPARE_WIDTH, height: COMPARE_HEIGHT } };
}

/**
 * Mean SSIM over 8x8 windows on a grayscale projection of the two images.
 * Operates on RGBA raw buffers of identical dimensions.
 */
function grayscaleSSIM(
  a: Buffer,
  b: Buffer,
  width: number,
  height: number
): number {
  const grayA = toGray(a, width, height);
  const grayB = toGray(b, width, height);

  const win = 8;
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;

  let total = 0;
  let count = 0;

  for (let y = 0; y + win <= height; y += win) {
    for (let x = 0; x + win <= width; x += win) {
      let sumA = 0,
        sumB = 0,
        sumAA = 0,
        sumBB = 0,
        sumAB = 0;
      const n = win * win;
      for (let j = 0; j < win; j++) {
        for (let i = 0; i < win; i++) {
          const idx = (y + j) * width + (x + i);
          const va = grayA[idx];
          const vb = grayB[idx];
          sumA += va;
          sumB += vb;
          sumAA += va * va;
          sumBB += vb * vb;
          sumAB += va * vb;
        }
      }
      const meanA = sumA / n;
      const meanB = sumB / n;
      const varA = sumAA / n - meanA * meanA;
      const varB = sumBB / n - meanB * meanB;
      const covAB = sumAB / n - meanA * meanB;

      const ssim =
        ((2 * meanA * meanB + C1) * (2 * covAB + C2)) /
        ((meanA * meanA + meanB * meanB + C1) * (varA + varB + C2));
      total += ssim;
      count++;
    }
  }
  return count ? total / count : 1;
}

function toGray(rgba: Buffer, width: number, height: number): Float64Array {
  const out = new Float64Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const o = p * 4;
    // Rec. 601 luma
    out[p] = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
  }
  return out;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
