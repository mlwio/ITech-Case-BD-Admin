/**
 * Cookie-backed session helpers for server components and server actions.
 *
 * `middleware.ts` verifies tokens directly with `verifySession` (Edge-safe);
 * this module adds the `next/headers` cookie plumbing.
 */

import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "./config";
import { signSession, verifySession, type SessionPayload } from "./token";
import { findNativeSessionAccount } from "./native-core-mongo";
import { isNativeMongoConfigured } from "@/lib/mongo-native";

export type { SessionPayload };

/**
 * Whether the session cookie should carry the `Secure` flag.
 *
 * Production deployments always require Secure cookies. In development, use
 * the request or configured app URL so HTTPS tunnels still receive Secure
 * cookies without breaking plain-HTTP localhost.
 */
function shouldUseSecureCookie(): boolean {
  if (process.env.NODE_ENV === "production") return true;

  try {
    const proto = headers().get("x-forwarded-proto");
    if (proto) return proto.split(",")[0].trim() === "https";
  } catch {
    // Not in a request scope — fall through to the static checks.
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) return appUrl.startsWith("https://");
  return false;
}

/** Reads the session and refreshes its role from the active database membership. */
export async function getAuthSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session || !isNativeMongoConfigured("core")) return null;

  try {
    const account = await findNativeSessionAccount(session.userId, session.shopId);
    if (!account?.member || !account.user.passwordHash) return null;

    return {
      ...session,
      name: account.user.name,
      email: account.user.email,
      role: account.member.role,
      permissions: account.member.permissions,
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
