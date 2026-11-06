import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      ],
    }, {
      source: "/ocr/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
    }];
  },
  webpack: (config) => {
    // Use ONNX Runtime's WASM-only export. Its default bundle may choose the
    // JSEP module variant, which is not importable in every mobile browser.
    config.resolve.alias = {
      ...config.resolve.alias,
      "onnxruntime-web$": "onnxruntime-web/wasm"
    };
    const conditions = config.resolve.conditionNames ?? [];
    config.resolve.conditionNames = conditions.includes("onnxruntime-web-use-extern-wasm")
      ? conditions
      : ["onnxruntime-web-use-extern-wasm", ...conditions];
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    return config;
  }
};

export default nextConfig;
