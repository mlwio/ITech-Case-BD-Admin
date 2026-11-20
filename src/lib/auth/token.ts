/**
 * Session token signing & verification (HS256 JWT via `jose`).
 *
 * Kept free of Node-only imports so the same helpers run inside
 * `middleware.ts` (Edge runtime) and in server components / actions.
 */

import { SignJWT, jwtVerify } from "jose";
import { authSecret, SESSION_ISSUER, SESSION_MAX_AGE } from "./config";
import type { MemberRole, Permissions } from "@/lib/types";

/** Claims carried inside the session cookie. */
export interface SessionPayload {
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  shopId: string;
  permissions: Permissions;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(SESSION_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(authSecret());
}

/** Returns the decoded claims, or `null` when the token is missing/invalid. */
export async function verifySession(token: string | null | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret(), { issuer: SESSION_ISSUER });
    if (!payload.userId || !payload.role) return null;
    return {
      userId: String(payload.userId),
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
      role: payload.role as MemberRole,
      shopId: String(payload.shopId ?? ""),
      permissions: (payload.permissions ?? {}) as Permissions,
    };
  } catch {
    return null;
  }
}
