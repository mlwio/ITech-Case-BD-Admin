/**
 * Edge-safe authentication configuration.
 *
 * Nothing in this module touches Node-only APIs (no `fs`, no Prisma), so it can
 * be imported from `middleware.ts`, which runs on the Edge runtime.
 */

/** Name of the HTTP-only session cookie. */
export const SESSION_COOKIE = "itech_session";

/** Session lifetime in seconds (7 days). */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/** JWT `iss` claim — pins tokens to this app. */
export const SESSION_ISSUER = "itech-case-bd";

/**
 * HMAC key used to sign session tokens.
 *
 * Fail closed in *every* environment: a missing or weak `AUTH_SECRET` throws
 * rather than silently falling back to a hardcoded (publicly known) key, which
 * would let anyone forge a session cookie. Callers already treat a throw as
 * "no session" (`verifySession` catches and returns null; `signSession` is
 * wrapped by the auth actions), so an unset secret locks the app down instead
 * of opening it up.
 */
export function authSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set to a strong value of at least 32 characters. Refusing to sign or verify sessions with a weak or missing secret.",
    );
  }
  return new TextEncoder().encode(secret);
}
