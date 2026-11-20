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
import { isValidBdPhone, normalizeBdPhone, sanitizeText } from "@/lib/security/validate";
import { accountConfirmationEmail, sendMail } from "@/lib/mailer";

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
  /** True when no active account matches the email — the screen offers a way to request access. */
  notFound?: boolean;
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

    // Unknown email (or paused account) → the login screen shows a "request
    // access" panel with the Facebook contact button, so nobody is left stuck
    // guessing. Only accounts that still need a first password branch to the
    // "create" step; the owner's name is never returned here.
    if (!user || !member) {
      return { ok: true, message: "No account found for that email.", notFound: true };
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
 * First-time onboarding for an account the owner added (invite, where
 * `passwordHash` is still null): captures the moderator's name, phone and a
 * fresh password in a single step, persists them, signs them straight into the
 * dashboard, then fires the automatic confirmation email. A mail failure is
 * logged but never blocks sign-in.
 */
export async function setPasswordAction(input: {
  email: string;
  name: string;
  phone: string;
  password: string;
  confirm: string;
}): Promise<AuthActionResult> {
  const email = sanitizeText(input.email, 200).toLowerCase();
  const name = sanitizeText(input.name, 120);
  const phone = normalizeBdPhone(input.phone);
  const password = typeof input.password === "string" ? input.password : "";
  const confirm = typeof input.confirm === "string" ? input.confirm : "";

  if (!email) {
    return { ok: false, message: "Enter your email address." };
  }
  if (!name) {
    return { ok: false, message: "Please enter your full name." };
  }
  if (!isValidBdPhone(phone)) {
    return { ok: false, message: "Enter a valid Bangladeshi number, e.g. 01712345678." };
  }
  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
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
          "We couldn't set up your account for that email. If you already have a password, sign in instead — otherwise ask the shop owner to add you.",
      };
    }

    const member = await corePrisma.shopMember.findFirst({
      where: { userId: user.id, isActive: true },
    });
    if (!member) {
      return { ok: false, message: "We couldn't set up your account for that email. Please ask the shop owner to add you." };
    }

    const passwordHash = await hashPassword(password);
    const updated = await corePrisma.user.update({
      where: { id: user.id },
      data: { name, phone, passwordHash, lastActiveAt: new Date() },
    });

    await corePrisma.shopMember.update({
      where: { id: member.id },
      data: { joinedAt: member.joinedAt ?? new Date() },
    });

    await createSession({
      userId: updated.id,
      name: updated.name,
      email: updated.email,
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

    // Confirmation email is a side-effect — never let it block the sign-in.
    try {
      const mail = accountConfirmationEmail({
        name: updated.name,
        email: updated.email,
        phone,
        password,
      });
      const sent = await sendMail({
        to: updated.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      if (!sent.ok) {
        console.warn(`[auth:set-password] confirmation email not delivered (${sent.error})`);
      }
    } catch (error) {
      console.warn("[auth:set-password] confirmation email threw", error);
    }

    return { ok: true, message: `All set — welcome, ${updated.name.split(" ")[0]}!` };
  } catch (error) {
    return failClosed("set-password", error);
  }
}

/** Clears the session cookie and returns to the login screen. */
export async function logoutAction(): Promise<void> {
  destroySession();
  redirect("/login");
}
