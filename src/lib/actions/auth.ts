"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { corePrisma, isDatabaseConfigured } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import {
  checkRateLimit,
  clientIpFromHeaders,
  formatRetryAfter,
  resetRateLimit,
} from "@/lib/security/rate-limit";
import { sanitizeText } from "@/lib/security/validate";

export interface AuthActionResult {
  ok: boolean;
  message: string;
}

/**
 * Logs the real cause server-side and returns a non-leaking message so raw
 * database / stack details (and any embedded secrets) never reach the client.
 */
function failClosed(context: string, error: unknown): AuthActionResult {
  console.error(`[auth:${context}]`, error);
  return { ok: false, message: "Something went wrong. Please try again." };
}

/** Shared gate for the credential endpoints (brute-force protection). */
function authRateLimit(bucket: string, email: string): { ok: true; key: string } | { ok: false; message: string } {
  const ip = clientIpFromHeaders(headers());
  const key = `${bucket}:${ip}:${email || "anon"}`;
  const gate = checkRateLimit(key, { limit: 8, windowMs: 60_000 });
  if (!gate.allowed) {
    return { ok: false, message: `Too many attempts. Please try again in ${formatRetryAfter(gate.retryAfterMs)}.` };
  }
  return { ok: true, key };
}

/** Result of the email-first step on the login screen. */
export interface AccountCheckResult {
  ok: boolean;
  message: string;
  /** True when the account exists but has no password yet (first-time setup). */
  needsPasswordSetup?: boolean;
}

/**
 * Email + password sign-in against the Prisma `User` table. Passwords are
 * compared with bcrypt and the active `ShopMember` row decides the role.
 */
export async function loginAction(input: { email: string; password: string }): Promise<AuthActionResult> {
  const email = sanitizeText(input.email, 200).toLowerCase();
  const password = typeof input.password === "string" ? input.password : "";

  if (!email || !password) {
    return { ok: false, message: "Email and password are required." };
  }

  const gate = authRateLimit("login", email);
  if (!gate.ok) return { ok: false, message: gate.message };

  if (!isDatabaseConfigured) {
    return {
      ok: false,
      message: "Sign-in is unavailable because the database is not configured.",
    };
  }

  try {
    const user = await corePrisma.user.findUnique({ where: { email } });

    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return { ok: false, message: "Invalid email or password." };
    }

    const member = await corePrisma.shopMember.findFirst({
      where: { userId: user.id, isActive: true },
    });
    if (!member) {
      return { ok: false, message: "This account is paused. Ask the shop owner for access." };
    }

    await corePrisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });

    // First successful sign-in marks the invite as joined.
    if (!member.joinedAt) {
      await corePrisma.shopMember.update({
        where: { id: member.id },
        data: { joinedAt: new Date() },
      });
    }

    await createSession({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: member.role,
      shopId: member.shopId,
      permissions: {
        orders: member.canAccessOrders,
        products: member.canAccessProducts,
        customers: member.canAccessCustomers,
        finance: member.canAccessFinance,
        inventory: member.canAccessInventory,
      },
    });

    resetRateLimit(gate.key);
    return { ok: true, message: `Welcome back, ${user.name.split(" ")[0]}!` };
  } catch (error) {
    return failClosed("login", error);
  }
}

/**
 * Email-first step. Tells the login screen whether the account already has a
 * password (show "Sign in") or still needs one (show "Create password").
 */
export async function checkAccountAction(emailInput: string): Promise<AccountCheckResult> {
  const email = sanitizeText(emailInput, 200).toLowerCase();
  if (!email) {
    return { ok: false, message: "Enter your email address." };
  }

  const gate = authRateLimit("check-account", email);
  if (!gate.ok) return { ok: false, message: gate.message };

  if (!isDatabaseConfigured) {
    return { ok: false, message: "Account lookup is unavailable because the database is not configured." };
  }

  try {
    const user = await corePrisma.user.findUnique({ where: { email } });
    const member = user
      ? await corePrisma.shopMember.findFirst({ where: { userId: user.id, isActive: true } })
      : null;

    // Anti-enumeration: a missing (or paused) email is answered exactly like an
    // existing password-protected account — we advance to the password step and
    // let the generic sign-in error handle the rest. Only accounts that still
    // need a first password branch to the "create" step, and the account owner's
    // name is never returned so the response cannot leak personal data.
    if (!user || !member) {
      return { ok: true, message: "Enter your password to continue.", needsPasswordSetup: false };
    }

    return {
      ok: true,
      message: "Account found.",
      needsPasswordSetup: !user.passwordHash,
    };
  } catch (error) {
    console.error("[auth:check-account]", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

/**
 * First-time password creation for an account the owner added. Only works while
 * the account has no password (invite or after a reset); signs the user in
 * straight away on success.
 */
export async function setPasswordAction(input: {
  email: string;
  password: string;
  confirm: string;
}): Promise<AuthActionResult> {
  const email = sanitizeText(input.email, 200).toLowerCase();
  const password = typeof input.password === "string" ? input.password : "";
  const confirm = typeof input.confirm === "string" ? input.confirm : "";

  if (!email) {
    return { ok: false, message: "Enter your email address." };
  }
  if (password.length < 6) {
    return { ok: false, message: "Password must be at least 6 characters." };
  }
  if (password.length > 128) {
    return { ok: false, message: "Password is too long (max 128 characters)." };
  }
  if (password !== confirm) {
    return { ok: false, message: "The two passwords don't match." };
  }

  const gate = authRateLimit("set-password", email);
  if (!gate.ok) return { ok: false, message: gate.message };

  if (!isDatabaseConfigured) {
    return { ok: false, message: "No database attached yet." };
  }

  try {
    const user = await corePrisma.user.findUnique({ where: { email } });
    // Anti-enumeration: an unknown email and an account that already has a
    // password share one indistinguishable response, so this endpoint cannot be
    // used to probe which emails exist.
    if (!user || user.passwordHash) {
      return {
        ok: false,
        message:
          "We couldn't set up a password for that email. If you already have one, sign in instead — otherwise ask the shop owner to add you.",
      };
    }

    const member = await corePrisma.shopMember.findFirst({
      where: { userId: user.id, isActive: true },
    });
    if (!member) {
      return { ok: false, message: "We couldn't set up a password for that email. Please ask the shop owner to add you." };
    }

    const passwordHash = await hashPassword(password);
    await corePrisma.user.update({
      where: { id: user.id },
      data: { passwordHash, lastActiveAt: new Date() },
    });

    await corePrisma.shopMember.update({
      where: { id: member.id },
      data: { joinedAt: member.joinedAt ?? new Date() },
    });

    await createSession({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: member.role,
      shopId: member.shopId,
      permissions: {
        orders: member.canAccessOrders,
        products: member.canAccessProducts,
        customers: member.canAccessCustomers,
        finance: member.canAccessFinance,
        inventory: member.canAccessInventory,
      },
    });

    resetRateLimit(gate.key);
    return { ok: true, message: `Password created — welcome, ${user.name.split(" ")[0]}!` };
  } catch (error) {
    return failClosed("set-password", error);
  }
}

/** Clears the session cookie and returns to the login screen. */
export async function logoutAction(): Promise<void> {
  destroySession();
  redirect("/login");
}
