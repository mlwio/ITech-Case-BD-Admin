/**
 * Edge-safe route guard rules.
 *
 * `middleware.ts` runs on the Edge runtime, where importing the full
 * `constants.ts` (it pulls in `lucide-react`) would bloat the bundle. The
 * guard table therefore lives here as a tiny, dependency-free module.
 *
 * Every rule maps a URL prefix onto either a granular permission or a strict
 * role allow-list. Rules are evaluated top-to-bottom, so put the more specific
 * prefixes first (e.g. `/couriers` before `/courier`).
 */

import type { MemberRole, PermissionKey, Permissions } from "@/lib/types";

export interface RouteRule {
  /** Matched when a path equals the prefix or continues after `prefix/`. */
  prefix: string;
  /** When set, the caller must hold this granular permission. */
  permission?: PermissionKey;
  /** When set, the caller's role must be one of these. */
  roles?: MemberRole[];
}

/** Where an unauthenticated visitor is sent to sign in. */
export const LOGIN_PATH = "/login";

/** Where an authenticated but unauthorised visitor is bounced to. */
export const SAFE_LANDING = "/";

export const ROUTE_RULES: RouteRule[] = [
  // Owner-only surfaces — contain credentials & team control.
  { prefix: "/settings", roles: ["OWNER"] },
  { prefix: "/couriers", roles: ["OWNER"] },
  // Granular permission surfaces.
  { prefix: "/finance", permission: "finance" },
  { prefix: "/customers", permission: "customers" },
  { prefix: "/products", permission: "products" },
  { prefix: "/stock-in", permission: "inventory" },
  { prefix: "/inventory", permission: "inventory" },
  { prefix: "/storefront", permission: "products" },
  { prefix: "/analytics", permission: "orders" },
  { prefix: "/courier", permission: "orders" },
  { prefix: "/orders", permission: "orders" },
];

/** Routes everyone signed in may always open. */
export const PUBLIC_TO_MEMBERS = ["/", "/more", "/print"];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export interface GuardResult {
  allowed: boolean;
  /** Redirect target when `allowed` is false. */
  redirectTo?: string;
}

/** Evaluates a pathname against the guard table for the given identity. */
export function guardRoute(
  pathname: string,
  role: MemberRole,
  permissions: Permissions,
): GuardResult {
  if (PUBLIC_TO_MEMBERS.some((prefix) => matches(pathname, prefix))) {
    return { allowed: true };
  }

  const rule = ROUTE_RULES.find((candidate) => matches(pathname, candidate.prefix));
  if (!rule) return { allowed: true };

  if (rule.roles && !rule.roles.includes(role)) {
    return { allowed: false, redirectTo: SAFE_LANDING };
  }

  if (rule.permission && !permissions[rule.permission]) {
    return { allowed: false, redirectTo: SAFE_LANDING };
  }

  return { allowed: true };
}
