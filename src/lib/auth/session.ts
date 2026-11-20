/**
 * Cookie-backed session helpers for server components and server actions.
 *
 * `middleware.ts` verifies tokens directly with `verifySession` (Edge-safe);
 * this module adds the `next/headers` cookie plumbing.
 */

import { cookies } from "next/headers";
import { corePrisma, isCoreDatabaseConfigured } from "@/lib/prisma";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "./config";
import { signSession, verifySession, type SessionPayload } from "./token";

export type { SessionPayload };

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
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Clears the session cookie. */
export function destroySession(): void {
  cookies().delete(SESSION_COOKIE);
}
