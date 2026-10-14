/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Separate build folders let several local dev servers run side by side (NEXT_DIST_DIR=.next-a). Vercel uses the default.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["pg"],
  },
};

module.exports = nextConfig;
