/**
 * Emails sent by the app. Plain-string HTML so they render everywhere
 * (Gmail, Outlook, mobile) without any template engine dependency.
 *
 * The palette mirrors the brand mark: deep navy #0f1427 with a gold accent.
 */

const NAVY = "#0f1427";
const GOLD = "#c9a24a";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
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
 * Sent right after an invited teammate finishes onboarding (password + phone).
 * Confirms the account is active and links back to the sign-in screen.
 */
export function welcomeEmail({ name, email }: { name: string; email: string }): RenderedEmail {
  const safeName = escapeHtml(name || "there");
  const safeEmail = escapeHtml(email);
  const loginUrl = `${appUrl()}/login`;

  const subject = "Your ITech Case BD account is ready";

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
                <p style="margin:6px 0 0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${GOLD};">Order Management</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 14px;font-size:16px;font-weight:600;color:#111827;">Welcome, ${safeName}!</p>
                <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#4b5563;">
                  Your ITech Case BD account is now active. You can sign in any time with
                  <strong style="color:#111827;">${safeEmail}</strong> and the password you just created.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px;background:${NAVY};">
                      <a href="${loginUrl}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Go to sign in</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">
                  Didn't expect this email? You can safely ignore it, or reply and let us know.
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
    `Welcome, ${name || "there"}!`,
    "",
    "Your ITech Case BD account is now active.",
    `Sign in with: ${email}`,
    "",
    `Sign in here: ${loginUrl}`,
    "",
    "ITech Case BD — Admin Workspace",
  ].join("\n");

  return { subject, html, text };
}
