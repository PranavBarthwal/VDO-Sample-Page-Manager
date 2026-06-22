/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow a separate build dir (e.g. .next-prod) so `next start` and `next dev`
  // can run concurrently without clobbering each other's `.next` output.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Playwright + sharp are heavy native deps; keep them external to the server bundle.
  experimental: {
    serverComponentsExternalPackages: ["playwright", "sharp", "pngjs", "pixelmatch"],
  },
};

export default nextConfig;
