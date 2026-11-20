/**
 * Resolves the live application base URL so links inside emails always point
 * at whatever domain the admin panel is actually served from.
 *
 * Order of precedence:
 *   1. The incoming request's own host (`x-forwarded-host` → `host`), so the
 *      link matches the domain the owner is using — even behind a proxy or on
 *      a custom domain that differs from the configured public URL.
 *   2. `NEXT_PUBLIC_APP_URL` (the deployment's canonical URL).
 *   3. An empty string — callers should tolerate a relative link.
 *
 * Server-only: reads `next/headers`, so never import from a client component.
 */

import { headers } from "next/headers";

/**
 * Hosts served directly (no proxy) — `next dev` / `next start`. A direct
 * request carries no `x-forwarded-proto`, so assuming https here would emit a
 * dead `https://localhost:3000/...` link in the invite email.
 */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)(:\d+)?$/i;

/** Strips any trailing slash so callers can safely append `"/path"`. */
function clean(url: string): string {
  return url.replace(/\/+$/, "");
}

export function resolveAppBaseUrl(): string {
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const forwardedProto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim();
      // Behind a proxy the header is authoritative; otherwise settle on a
      // scheme ourselves: http for a local host, https everywhere else.
      const proto = forwardedProto || (LOCAL_HOST.test(host) ? "http" : "https");
      return clean(`${proto}://${host}`);
    }
  } catch {
    // Not in a request scope — fall through to the configured URL.
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return configured ? clean(configured) : "";
}
