import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { optimizePackageImports: ["tesseract.js"] }
};

export default nextConfig;
