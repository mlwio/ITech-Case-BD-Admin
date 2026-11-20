import { createSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { authSecret } from "@/lib/auth/config";
import { findNativeAuthAccount, updateNativeAuthActivity } from "@/lib/auth/native-core-mongo";
import { isNativeMongoConfigured } from "@/lib/mongo-native";
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
  if (!isNativeMongoConfigured("core")) {
    return denied(503, "Account lookup is unavailable because the core database is not configured.");
  }

  try {
    const account = await findNativeAuthAccount(email);
    if (!account?.member) {
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
        needsPasswordSetup: !account.user.passwordHash,
      },
    };
  } catch (error) {
    console.error("[auth:check-account] native MongoDB request failed", {
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
  if (!isNativeMongoConfigured("core")) {
    return denied(503, "Sign-in is unavailable because the core database is not configured.");
  }

  try {
    authSecret();
  } catch (error) {
    console.error("[auth:login] session signing configuration failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return denied(500, "Authentication is not configured correctly on the server.");
  }

  try {
    const account = await findNativeAuthAccount(email);
    if (
      !account?.user.passwordHash ||
      !(await verifyPassword(password, account.user.passwordHash))
    ) {
      return denied(401, "Invalid email or password.");
    }
    if (!account.member) {
      return denied(403, "This account is paused. Ask the shop owner for access.");
    }

    await updateNativeAuthActivity(
      account.user.id,
      account.member.id,
      Boolean(account.member.joinedAt),
    );

    await createSession({
      userId: account.user.id,
      name: account.user.name,
      email: account.user.email,
      role: account.member.role,
      shopId: account.member.shopId,
      permissions: account.member.permissions,
    });

    resetRateLimit(gate.key);
    return {
      status: 200,
      body: { ok: true, message: `Welcome back, ${account.user.name.split(" ")[0]}!` },
    };
  } catch (error) {
    console.error("[auth:login] native MongoDB request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return denied(
      500,
      "Sign-in failed because the core database or authentication service is unavailable.",
    );
  }
}
