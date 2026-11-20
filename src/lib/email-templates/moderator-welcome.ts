/**
 * Email #2 — Registration Successful & Credentials Confirmation.
 *
 * Sent immediately after a moderator finishes registration (name + phone +
 * password). It restates their account details — including the password they
 * just chose — so they keep a record in their inbox, and links to the panel.
 */

import {
  FACEBOOK_PAGE_URL,
  GOLD,
  NAVY,
  brandName,
  escapeHtml,
  type RenderedEmail,
} from "./shared";

export interface ModeratorWelcomeEmailInput {
  name: string;
  email: string;
  phone: string;
  /** The plaintext password submitted during setup (shown once). */
  password: string;
  /** Absolute link to the admin panel sign-in page. */
  loginUrl: string;
  /** Store/website name; defaults to "ITech Case BD". */
  storeName?: string | null;
}

export function moderatorWelcomeEmail(input: ModeratorWelcomeEmailInput): RenderedEmail {
  const store = brandName(input.storeName);
  const safeStore = escapeHtml(store);
  const safeName = escapeHtml(input.name || "there");
  const safeEmail = escapeHtml(input.email);
  const safePhone = escapeHtml(input.phone);
  const safePassword = escapeHtml(input.password);
  const safeLoginUrl = escapeHtml(input.loginUrl);

  const subject = "Registration Successful - Welcome to ITech Case BD Admin Panel";

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
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="background:${NAVY};padding:28px 28px 24px;">
                <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:0.5px;color:#ffffff;">${safeStore}</p>
                <p style="margin:6px 0 0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${GOLD};">Admin Panel</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 14px;font-size:15px;font-weight:600;color:#111827;">Dear ${safeName},</p>
                <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#374151;">
                  অভিনন্দন! আপনি সফলভাবে ${safeStore} Admin Panel-এ <strong>Moderator</strong> হিসেবে রেজিস্ট্রেশন সম্পন্ন
                  করেছেন। এখন থেকে নিচের তথ্য ব্যবহার করে আপনি যেকোনো সময় Admin Panel-এ লগইন করতে পারবেন:
                </p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #eef0f3;border-radius:12px;padding:6px 16px;margin-bottom:20px;">
${row("Name", safeName)}${row("Email", safeEmail)}${row("Phone", safePhone)}${row("Password", safePassword)}${row("Admin Panel", `<a href="${safeLoginUrl}" style="color:#0f1427;">${safeLoginUrl}</a>`)}
                </table>

                <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 18px;">
                  <tr>
                    <td style="border-radius:10px;background:${NAVY};">
                      <a href="${safeLoginUrl}" style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Login to Admin Panel</a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 18px;font-size:12px;line-height:1.6;color:#9ca3af;text-align:center;">
                  নিরাপত্তার জন্য এই পাসওয়ার্ডটি গোপন রাখুন এবং প্রথম লগইনের পর পরিবর্তন করে নিন।
                </p>

                <p style="margin:0;font-size:13px;line-height:1.7;color:#4b5563;">
                  আমাদের অফিশিয়াল পেজ: <a href="${FACEBOOK_PAGE_URL}" style="color:#4b5563;font-weight:600;">facebook.com/itechcasebd/</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px;background:#fafafa;border-top:1px solid #f0f1f3;">
                <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">Best Regards,</p>
                <p style="margin:0;font-size:13px;font-weight:700;color:#111827;">${safeStore}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Dear ${input.name || "there"},`,
    "",
    `অভিনন্দন! আপনি সফলভাবে ${store} Admin Panel-এ Moderator হিসেবে রেজিস্ট্রেশন সম্পন্ন করেছেন।`,
    "এখন থেকে নিচের তথ্য ব্যবহার করে আপনি যেকোনো সময় Admin Panel-এ লগইন করতে পারবেন:",
    "",
    `  Name:        ${input.name}`,
    `  Email:       ${input.email}`,
    `  Phone:       ${input.phone}`,
    `  Password:    ${input.password}`,
    `  Admin Panel: ${input.loginUrl}`,
    "",
    "নিরাপত্তার জন্য এই পাসওয়ার্ডটি গোপন রাখুন এবং প্রথম লগইনের পর পরিবর্তন করে নিন।",
    "",
    `Official page: ${FACEBOOK_PAGE_URL}`,
    "",
    "Best Regards,",
    store,
  ].join("\n");

  return { subject, html, text };
}
