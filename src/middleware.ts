/**
 * Edge middleware — the single choke point for authentication & route RBAC.
 *
 * It runs before every matched request, verifies the HTTP-only session cookie
 * (HS256 JWT via `jose`, Edge-safe), then applies the guard table in
 * `lib/auth/route-guards.ts`.
 *
 * Deliberately free of Node-only imports (`bcryptjs`, Prisma) so it stays
 * deployable on the Edge runtime behind both Vercel and a self-hosted VPS.
 */

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { verifySession } from "@/lib/auth/token";
import { LOGIN_PATH, SAFE_LANDING, guardRoute } from "@/lib/auth/route-guards";

/**
 * Defence-in-depth hardening headers. The canonical set is emitted once for
 * every route from `next.config.mjs`; middleware re-asserts the core ones on
 * dynamic responses (including redirects) so they can never be bypassed.
 */
const HARDENED_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function withHardenedHeaders<T extends NextResponse>(response: T): T {
  for (const [key, value] of Object.entries(HARDENED_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * Normalises a request path before it is matched against the guard table so an
 * attacker cannot dodge a rule with encoding tricks. Percent-encoding is
 * decoded, duplicate slashes collapsed and `.`/`..` segments resolved — so
 * `/%6Frders`, `/orders/`, `//orders` and `/orders/../settings` all guard as
 * their real target. Malformed encoding is left as-is (it simply won't match a
 * public rule, so it is never treated as open).
 */
function normalizePathname(pathname: string): string {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Keep the raw value — a decoding failure must never widen access.
  }
  const segments: string[] = [];
  for (const segment of decoded.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const guardPath = normalizePathname(pathname);

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  // 1. No valid session → bounce to the login screen, remembering the target.
  if (!session) {
    const url = new URL(LOGIN_PATH, request.url);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return withHardenedHeaders(NextResponse.redirect(url));
  }

  // 2. Signed in but lacking the role/permission → send to a safe landing.
  const guard = guardRoute(guardPath, session.role, session.permissions);
  if (!guard.allowed) {
    const url = new URL(guard.redirectTo ?? SAFE_LANDING, request.url);
    url.searchParams.set("denied", guardPath);
    return withHardenedHeaders(NextResponse.redirect(url));
  }

  return withHardenedHeaders(NextResponse.next());
}

export const config = {
  /**
   * Guard everything except the public surfaces:
   *   • `/login`                        — the sign-in screen
   *   • `/api/auth/*`                   — rate-limited login JSON endpoints
   *   • `/moderator/accept-invite`      — invite onboarding (no session yet)
   *   • `/api/moderators/*`             — invite registration endpoint
   *   • `/api/webhooks/*`               — called by Pathao's servers, verified
   *                                        by HMAC signature, not a session
   * plus Next.js internals and static assets.
   */
  matcher: [
    "/((?!login|moderator|api/auth|api/moderators|api/webhooks|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff|woff2|ttf)$).*)",
  ],
};
