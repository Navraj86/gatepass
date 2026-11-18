import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// In production Nginx sends /api to the API on the same origin. In local
// development Next.js proxies /api so cookies and EventSource stay same-origin.
const apiOrigin = process.env.API_INTERNAL_URL?.split(",")[0] ?? "http://localhost:4000";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.dodopayments.com",
].join("; ");

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  agentRules: false,
  // Compression is Nginx's job; Next must never buffer the SSE proxy in development.
  compress: false,
  async rewrites() {
    return isDev ? [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }] : [];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
