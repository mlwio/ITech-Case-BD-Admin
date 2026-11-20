/**
 * Cookie-backed session helpers for server components and server actions.
 *
 * `middleware.ts` verifies tokens directly with `verifySession` (Edge-safe);
 * this module adds the `next/headers` cookie plumbing.
 */

import { cookies, headers } from "next/headers";
import { corePrisma, isCoreDatabaseConfigured } from "@/lib/prisma";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "./config";
import { signSession, verifySession, type SessionPayload } from "./token";

export type { SessionPayload };

/**
 * Whether the session cookie should carry the `Secure` flag.
 *
 * Tying this to `NODE_ENV` alone breaks a production build served over plain
 * HTTP (`next start` on http://localhost or a LAN IP): browsers silently drop
 * a `Secure` cookie delivered over http, so the sign-in "succeeds" yet the
 * cookie never sticks and the user bounces straight back to /login. We instead
 * ask the request what scheme it actually used — an https proxy wins, then the
 * configured public app URL, and only then NODE_ENV as a last resort.
 */
function shouldUseSecureCookie(): boolean {
  try {
    const proto = headers().get("x-forwarded-proto");
    if (proto) return proto.split(",")[0].trim() === "https";
  } catch {
    // Not in a request scope — fall through to the static checks.
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) return appUrl.startsWith("https://");
  return process.env.NODE_ENV === "production";
}

/** Reads the session and refreshes its role from the active database membership. */
export async function getAuthSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session || !isCoreDatabaseConfigured) return null;

  try {
    const member = await corePrisma.shopMember.findFirst({
      where: { userId: session.userId, shopId: session.shopId, isActive: true },
    });
    if (!member) return null;

    const user = await corePrisma.user.findUnique({ where: { id: session.userId } });
    if (!user?.passwordHash) return null;

    return {
      ...session,
      name: user.name,
      email: user.email,
      role: member.role,
      permissions: {
        orders: member.canAccessOrders,
        products: member.canAccessProducts,
        customers: member.canAccessCustomers,
        finance: member.canAccessFinance,
        inventory: member.canAccessInventory,
      },
    };
  } catch {
    // Preserve access during a transient database outage; membership changes
    // take effect as soon as the database is reachable again.
    return session;
  }
}

/** Issues a fresh session cookie (HTTP-only, SameSite=Lax). */
export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Clears the session cookie. */
export function destroySession(): void {
  cookies().delete(SESSION_COOKIE);
}
