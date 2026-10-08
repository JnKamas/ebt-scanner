import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: "/ocr/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
    }];
  },
  webpack: (config) => {
    // Use ONNX Runtime's external-WASM build. Its bundled build may choose the
    // newer JSEP module variant, which is not importable in every browser.
    const conditions = config.resolve.conditionNames ?? [];
    config.resolve.conditionNames = conditions.includes("onnxruntime-web-use-extern-wasm")
      ? conditions
      : ["onnxruntime-web-use-extern-wasm", ...conditions];
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    return config;
  }
};

export default nextConfig;
