/**
 * Transactional email — provider-agnostic SMTP transport (nodemailer).
 *
 * Any standard SMTP host works (cPanel, Hostinger, Zoho, Google Workspace,
 * Mailgun SMTP, …). Configure it entirely through environment variables so no
 * credentials are ever hard-coded:
 *
 *   SMTP_HOST      e.g. smtp.hostinger.com / mail.itechcasebd.com
 *   SMTP_PORT      465 (implicit TLS) or 587 (STARTTLS)  — default 587
 *   SMTP_SECURE    "true" for port 465; auto-detected from the port otherwise
 *   SMTP_USER      full mailbox address used to authenticate
 *   SMTP_PASS      mailbox password (or app password)
 *   MAIL_FROM      From address (defaults to SMTP_USER)
 *   MAIL_FROM_NAME friendly sender name  — default "ITech Case BD"
 *
 * The transport is created lazily and cached for the process. Email is a
 * side-effect of onboarding, so a missing config or a slow provider must never
 * crash a sign-in — callers treat a failure as non-fatal.
 */

import nodemailer, { type Transporter } from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST?.trim();
const SMTP_USER = process.env.SMTP_USER?.trim();
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587) || 587;
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
      "[email] SMTP is not configured — skipping send. Set SMTP_HOST/SMTP_USER/SMTP_PASS in .env to enable email.",
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
