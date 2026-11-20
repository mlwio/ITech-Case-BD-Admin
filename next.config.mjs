/** @type {import('next').NextConfig} */
const isProduction = process.env.NODE_ENV === "production";

/**
 * Strict Content-Security-Policy applied to every response.
 *
 * `script-src` needs `'unsafe-inline'` for the dependency-free theme-init
 * snippet in the root layout (no nonce plumbing) and Next's hydration payload.
 * `'unsafe-eval'` is only added in development where the dev overlay needs it —
 * it is dropped from production bundles. Everything else is locked down:
 * no frames, no objects, no base-uri hijacking.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

/** Hardening headers sent on every route (pages, API, static assets). */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
];

const nextConfig = {
  reactStrictMode: true,
  // Do not advertise the framework version.
  poweredByHeader: false,
  // Anti-inspect: never ship original TypeScript/React source in the browser.
  productionBrowserSourceMaps: false,
  // Anti-inspect: strip console/debugger output from the production bundle.
  compiler: {
    removeConsole: isProduction ? { exclude: ["error"] } : false,
  },
  // Keeps the Prisma engine out of the client bundle and lets the same build
  // run on Vercel (serverless) and a self-hosted Linux VPS (long-running node).
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "coresg-normal.trae.ai" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
