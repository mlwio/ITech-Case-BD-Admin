import { corePrisma, isCoreDatabaseConfigured } from "@/lib/prisma";
import { createSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { authSecret } from "@/lib/auth/config";
import {
  checkRateLimit,
  clientIpFromHeaders,
  formatRetryAfter,
  resetRateLimit,
} from "@/lib/security/rate-limit";
import { sanitizeText } from "@/lib/security/validate";

export interface LoginServiceBody {
  ok: boolean;
  message: string;
}

export interface AccountCheckBody extends LoginServiceBody {
  needsPasswordSetup?: boolean;
  notFound?: boolean;
}

export interface LoginServiceResult<T extends LoginServiceBody> {
  status: number;
  body: T;
}

type RequestHeaders = Pick<Headers, "get">;

function denied<T extends LoginServiceBody>(
  status: number,
  message: string,
): LoginServiceResult<T> {
  return { status, body: { ok: false, message } as T };
}

function rateLimit(bucket: string, email: string, requestHeaders: RequestHeaders) {
  const key = `${bucket}:${clientIpFromHeaders(requestHeaders)}:${email || "anon"}`;
  const result = checkRateLimit(key, { limit: 8, windowMs: 60_000 });
  return result.allowed
    ? ({ ok: true, key } as const)
    : ({
        ok: false,
        message: `Too many attempts. Please try again in ${formatRetryAfter(result.retryAfterMs)}.`,
      } as const);
}

export async function checkLoginAccount(
  emailInput: unknown,
  requestHeaders: RequestHeaders,
): Promise<LoginServiceResult<AccountCheckBody>> {
  const email = sanitizeText(emailInput, 200).toLowerCase();
  if (!email) return denied(400, "Enter your email address.");

  const gate = rateLimit("check-account", email, requestHeaders);
  if (!gate.ok) return denied(429, gate.message);
  if (!isCoreDatabaseConfigured) {
    return denied(503, "Account lookup is unavailable because the core database is not configured.");
  }

  try {
    const user = await corePrisma.user.findUnique({ where: { email } });
    const member = user
      ? await corePrisma.shopMember.findFirst({ where: { userId: user.id, isActive: true } })
      : null;

    if (!user || !member) {
      return {
        status: 200,
        body: { ok: true, message: "No account found for that email.", notFound: true },
      };
    }

    return {
      status: 200,
      body: {
        ok: true,
        message: "Account found.",
        needsPasswordSetup: !user.passwordHash,
      },
    };
  } catch (error) {
    console.error("[auth:check-account] request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return denied(500, "Account lookup failed because the core database is unavailable.");
  }
}

export async function loginWithPassword(
  input: { email?: unknown; password?: unknown },
  requestHeaders: RequestHeaders,
): Promise<LoginServiceResult<LoginServiceBody>> {
  const email = sanitizeText(input.email, 200).toLowerCase();
  const password = typeof input.password === "string" ? input.password : "";
  if (!email || !password) return denied(400, "Email and password are required.");

  const gate = rateLimit("login", email, requestHeaders);
  if (!gate.ok) return denied(429, gate.message);
  if (!isCoreDatabaseConfigured) {
    return denied(503, "Sign-in is unavailable because the core database is not configured.");
  }

  try {
    authSecret();
    const user = await corePrisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return denied(401, "Invalid email or password.");
    }

    const member = await corePrisma.shopMember.findFirst({
      where: { userId: user.id, isActive: true },
    });
    if (!member) return denied(403, "This account is paused. Ask the shop owner for access.");

    await corePrisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

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
    return { status: 200, body: { ok: true, message: `Welcome back, ${user.name.split(" ")[0]}!` } };
  } catch (error) {
    const authMisconfigured =
      error instanceof Error && error.message.startsWith("AUTH_SECRET must be set");
    console.error("[auth:login] request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      authMisconfigured,
    });
    return denied(
      500,
      authMisconfigured
        ? "Authentication is not configured correctly on the server."
        : "Sign-in failed because the core database or authentication service is unavailable.",
    );
  }
}
