/**
 * POST /api/moderators/complete-registration
 *
 * Public endpoint behind the invite link. Validates the single-use invite
 * token, captures the moderator's name + phone + password, activates the
 * account, signs them in, and fires Email #2 (registration confirmation).
 *
 * Lives outside the auth middleware matcher — the caller has no session yet.
 */

import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { completeNativeInvite } from "@/lib/auth/native-core-mongo";
import { isNativeMongoConfigured } from "@/lib/mongo-native";
import { isValidBdPhone, normalizeBdPhone, sanitizeText } from "@/lib/security/validate";
import { sendMail } from "@/lib/mailer";
import { moderatorWelcomeEmail } from "@/lib/email-templates/moderator-welcome";
import { resolveAppBaseUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

interface Body {
  token?: unknown;
  name?: unknown;
  phone?: unknown;
  password?: unknown;
  confirm?: unknown;
}

/** Non-leaking JSON error response. */
function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return fail("Invalid request.");
  }

  const token = sanitizeText(body.token, 200);
  const name = sanitizeText(body.name, 120);
  const phone = normalizeBdPhone(body.phone);
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";

  if (!token) return fail("This invitation link is invalid.");
  if (!name) return fail("Please enter your full name.");
  if (!isValidBdPhone(phone)) return fail("Enter a valid Bangladeshi number, e.g. 01712345678.");
  if (password.length < 8) return fail("Password must be at least 8 characters.");
  if (password.length > 128) return fail("Password is too long (max 128 characters).");
  if (password !== confirm) return fail("The two passwords don't match.");

  if (!isNativeMongoConfigured("core")) {
    return fail("Registration is unavailable because the database is not configured.", 503);
  }

  try {
    const completion = await completeNativeInvite(token, {
      name,
      phone,
      passwordHash: await hashPassword(password),
    });
    if (completion.kind === "invalid") {
      return fail(
        "This invitation link is invalid or has expired. Please ask the shop owner to send a new invite.",
        410,
      );
    }
    if (completion.kind === "revoked" || !completion.account.member) {
      return fail("Your access has been revoked. Please contact the shop owner.", 403);
    }

    const { user: updated, member } = completion.account;

    // Sign the moderator straight in so the redirect lands on the dashboard.
    await createSession({
      userId: updated.id,
      name: updated.name,
      email: updated.email,
      role: member.role,
      shopId: member.shopId,
      permissions: member.permissions,
    });

    // Email #2 — confirmation with credentials. Best-effort: the account is
    // already active, so a mail failure must not fail the registration.
    try {
      const mail = moderatorWelcomeEmail({
        name: updated.name,
        email: updated.email,
        phone,
        password,
        loginUrl: `${resolveAppBaseUrl()}/login`,
      });
      const sent = await sendMail({
        to: updated.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      if (!sent.ok) {
        console.warn(`[moderator:complete-registration] confirmation email not delivered (${sent.error})`);
      }
    } catch (error) {
      console.warn("[moderator:complete-registration] confirmation email threw", error);
    }

    return NextResponse.json({
      ok: true,
      message: "Registration complete! Your credentials have been sent to your email.",
    });
  } catch (error) {
    console.error("[moderator:complete-registration]", error);
    return fail("Something went wrong. Please try again.", 500);
  }
}
