/**
 * Server-only transactional email utility (nodemailer).
 *
 * Gmail SMTP by default: set `SMTP_USER` (the full Gmail address) and `SMTP_PASS`
 * (a 16-character Google "App Password" — NOT your normal account password) to
 * enable sending. Any other SMTP host also works by overriding the host/port.
 *
 *   SMTP_HOST      default "smtp.gmail.com"
 *   SMTP_PORT      default 465 (implicit TLS)
 *   SMTP_SECURE    "true" for 465 (auto-true on port 465)
 *   SMTP_USER      mailbox address used to authenticate & send from
 *   SMTP_PASS      mailbox password / app password
 *   MAIL_FROM      From address (defaults to SMTP_USER)
 *   MAIL_FROM_NAME friendly sender name — default "ITech Case BD"
 *
 * Email is a side-effect of onboarding, so a missing config or a slow provider
 * must never crash a sign-in. `sendMail` never throws; callers treat a failure
 * as non-fatal.
 */

import nodemailer, { type Transporter } from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
const SMTP_USER = process.env.SMTP_USER?.trim();
// Google app passwords are shown grouped as "xxxx xxxx xxxx xxxx"; SMTP auth
// expects the 16 characters without spaces, so normalise whatever is pasted in.
const SMTP_PASS = process.env.SMTP_PASS?.replace(/\s+/g, "");
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 465) || 465;
const SMTP_SECURE =
  (process.env.SMTP_SECURE ?? "").toLowerCase() === "true" || SMTP_PORT === 465;

const MAIL_FROM_EMAIL = (process.env.MAIL_FROM || SMTP_USER || "").trim();
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME?.trim() || "ITech Case BD";

/** True when enough SMTP settings are present to attempt a send. */
export const isMailConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && MAIL_FROM_EMAIL);

let cachedTransport: Transporter | null = null;

function getTransport(): Transporter | null {
  if (!isMailConfigured) return null;
  if (cachedTransport) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Fail fast instead of hanging a server action when the host is unreachable.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return cachedTransport;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendMailResult {
  ok: boolean;
  /** Machine-readable failure reason; never surfaced raw to end users. */
  error?: "not-configured" | "send-failed";
}

/**
 * Sends one transactional email. Never throws — returns a result object so
 * onboarding can continue even when mail delivery fails.
 */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const transport = getTransport();
  if (!transport) {
    console.warn(
      "[email] SMTP is not configured — skipping send. Set SMTP_USER/SMTP_PASS in .env to enable email.",
    );
    return { ok: false, error: "not-configured" };
  }

  try {
    await transport.sendMail({
      from: `"${MAIL_FROM_NAME}" <${MAIL_FROM_EMAIL}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { ok: true };
  } catch (error) {
    // Log server-side only; the raw provider error can contain host details.
    console.error("[email] send failed:", error);
    return { ok: false, error: "send-failed" };
  }
}
