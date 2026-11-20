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
const SMTP_PASS = process.env.SMTP_PASS;
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

// ---------------------------------------------------------------------------
// Templates
//
// Plain-string HTML so they render everywhere (Gmail, Outlook, mobile) without
// a template engine. The palette mirrors the brand mark: navy + gold accent.
// ---------------------------------------------------------------------------

const NAVY = "#0f1427";
const GOLD = "#c9a24a";

/** Where moderators sign in from the confirmation email. */
const ADMIN_PANEL_URL = "https://tsf-oder.mlwio.com/login";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Escapes user-supplied values before they are interpolated into HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sent right after an invited moderator finishes onboarding (name + phone +
 * password). Re-states their account details — including the password they
 * just created — so they keep a record in their inbox, and links to the panel.
 */
export function accountConfirmationEmail(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
}): RenderedEmail {
  const name = input.name || "there";
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(input.email);
  const safePhone = escapeHtml(input.phone);
  const safePassword = escapeHtml(input.password);

  const subject = "Welcome to ITech Case BD Admin — your account is ready";

  const row = (label: string, value: string) => `
                    <tr>
                      <td style="padding:9px 0;font-size:12px;letter-spacing:0.4px;text-transform:uppercase;color:#9ca3af;width:130px;vertical-align:top;">${label}</td>
                      <td style="padding:9px 0;font-size:14px;font-weight:600;color:#111827;word-break:break-word;">${value}</td>
                    </tr>`;

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="background:${NAVY};padding:28px 28px 24px;">
                <p style="margin:0;font-size:18px;font-weight:700;letter-spacing:0.5px;color:#ffffff;">ITech Case BD</p>
                <p style="margin:6px 0 0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${GOLD};">Admin Workspace</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 14px;font-size:16px;font-weight:600;color:#111827;">Welcome to ITech Case BD Admin, ${safeName}!</p>
                <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#4b5563;">
                  Your moderator account is now active. Below are your saved sign-in
                  details — keep this email somewhere safe.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #eef0f3;border-radius:12px;padding:6px 16px;margin-bottom:20px;">
${row("Name", safeName)}${row("Phone Number", safePhone)}${row("Login Email", safeEmail)}${row("Password", safePassword)}
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px;background:${NAVY};">
                      <a href="${ADMIN_PANEL_URL}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Open Admin Panel</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">
                  Or open this link: <a href="${ADMIN_PANEL_URL}" style="color:#4b5563;">${ADMIN_PANEL_URL}</a>
                </p>
                <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">
                  For your safety, change this password after your first sign-in.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#fafafa;border-top:1px solid #f0f1f3;">
                <p style="margin:0;font-size:11px;color:#9ca3af;">ITech Case BD — Admin Workspace</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Welcome to ITech Case BD Admin, ${name}!`,
    "",
    "Your moderator account is now active. Save these sign-in details:",
    `  Name:         ${input.name}`,
    `  Phone Number: ${input.phone}`,
    `  Login Email:  ${input.email}`,
    `  Password:     ${input.password}`,
    "",
    `Admin Panel: ${ADMIN_PANEL_URL}`,
    "",
    "For your safety, change this password after your first sign-in.",
    "",
    "ITech Case BD — Admin Workspace",
  ].join("\n");

  return { subject, html, text };
}
