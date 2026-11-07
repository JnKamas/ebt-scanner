export function contentSecurityPolicy(nonce: string, development = false) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    // The scanner positions its guide and OCR boxes with inline styles.
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' https://photon.komoot.io${development ? " ws: wss:" : ""}`,
    "img-src 'self' data: blob: https://eurobilltracker.com https://*.eurobilltracker.com",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');
}
