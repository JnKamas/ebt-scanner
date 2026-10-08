import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: "/ocr/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
    }];
  },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    return config;
  }
};

export default nextConfig;
