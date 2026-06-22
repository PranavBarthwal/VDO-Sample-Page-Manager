/** @type {import('next').NextConfig} */
const nextConfig = {
  // Playwright + sharp are heavy native deps; keep them external to the server bundle.
  experimental: {
    serverComponentsExternalPackages: ["playwright", "sharp", "pngjs", "pixelmatch"],
  },
};

export default nextConfig;
