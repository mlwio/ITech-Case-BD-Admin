/**
 * Email #1 — Moderator Invitation.
 *
 * Sent the moment an owner adds a moderator's email. It welcomes them to the
 * team and links to the public onboarding page
 * (`/moderator/accept-invite?token=...`) where they set their name, phone and
 * password. `inviteUrl` is resolved at send time from the live request host, so
 * the link always matches the domain the admin panel is served from.
 */

import {
  BRAND_FALLBACK_NAME,
  FACEBOOK_PAGE_URL,
  GOLD,
  NAVY,
  brandName,
  escapeHtml,
  type RenderedEmail,
} from "./shared";

export interface ModeratorInviteEmailInput {
  /** Recipient email — becomes their login ID. */
  email: string;
  /** Absolute onboarding link including the invite token. */
  inviteUrl: string;
  /** Store/website name; defaults to "ITech Case BD". */
  storeName?: string | null;
}

export function moderatorInviteEmail(input: ModeratorInviteEmailInput): RenderedEmail {
  const store = brandName(input.storeName);
  const safeStore = escapeHtml(store);
  const safeEmail = escapeHtml(input.email);
  const safeInviteUrl = escapeHtml(input.inviteUrl);

  const subject = "Invitation to Join ITech Case BD Admin Panel as a Moderator";

  const step = (index: number, title: string, body: string) => `
                    <tr>
                      <td style="padding:0 0 14px;vertical-align:top;width:30px;">
                        <span style="display:inline-block;width:22px;height:22px;border-radius:11px;background:${NAVY};color:#ffffff;font-size:12px;font-weight:700;line-height:22px;text-align:center;">${index}</span>
                      </td>
                      <td style="padding:0 0 14px;vertical-align:top;">
                        <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${title}</p>
                        <p style="margin:2px 0 0;font-size:13px;line-height:1.6;color:#4b5563;">${body}</p>
                      </td>
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
                <p style="margin:6px 0 0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${GOLD};">Admin Panel Invitation</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 14px;font-size:15px;font-weight:600;color:#111827;">Dear Sir/Madam,</p>
                <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#374151;">
                  আপনাকে ${safeStore}-এর অফিশিয়াল টিমে <strong>Moderator</strong> হিসেবে নিয়োগ করা হয়েছে এবং আমাদের
                  Admin Panel-এ যুক্ত হওয়ার জন্য আমন্ত্রণ (Invite) জানানো হয়েছে।<br/>
                  <span style="color:#6b7280;">You have been appointed and invited to join the ${safeStore} Admin Panel as a Moderator.</span>
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 10px;">
                  <tr>
                    <td style="border-radius:10px;background:${NAVY};">
                      <a href="${safeInviteUrl}" style="display:inline-block;padding:14px 40px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Click Here</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:#9ca3af;text-align:center;word-break:break-all;">
                  If the button doesn&apos;t work, open this link:<br/>
                  <a href="${safeInviteUrl}" style="color:#4b5563;">${safeInviteUrl}</a>
                </p>

                <p style="margin:0 0 16px;font-size:13px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;color:#9ca3af;">How to get started</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${step(1, "Verify Your Email", `এই ইমেইল অ্যাড্রেসটি (<strong>${safeEmail}</strong>) আপনার লগইন আইডি হিসেবে ব্যবহৃত হবে।`)}
${step(2, "Open Registration Link", `উপরের <strong>"Click Here"</strong> বাটনে ক্লিক করে Moderator Registration পেজে প্রবেশ করুন।`)}
${step(3, "Complete Your Profile", "ফর্মে আপনার <strong>পূর্ণ নাম (Full Name)</strong>, <strong>মোবাইল নম্বর (Phone Number)</strong> এবং একটি শক্তিশালী <strong>পাসওয়ার্ড (Password)</strong> সেট করে রেজিস্ট্রেশন সম্পন্ন করুন।")}
${step(4, "Access Admin Panel", "রেজিস্ট্রেশন সম্পন্ন হলেই আপনি সরাসরি Moderator হিসেবে Admin Panel-এ লগইন করে অর্ডার ও কাস্টমার ম্যানেজমেন্ট শুরু করতে পারবেন।")}
                </table>

                <p style="margin:8px 0 0;font-size:13px;line-height:1.7;color:#4b5563;">
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
    `Dear Sir/Madam,`,
    "",
    `আপনাকে ${store}-এর অফিশিয়াল টিমে Moderator হিসেবে নিয়োগ করা হয়েছে এবং আমাদের Admin Panel-এ যুক্ত হওয়ার জন্য আমন্ত্রণ (Invite) জানানো হয়েছে।`,
    `You have been appointed and invited to join the ${store} Admin Panel as a Moderator.`,
    "",
    `Accept your invitation: ${input.inviteUrl}`,
    "",
    "How to get started:",
    `  1. Verify Your Email: this address (${input.email}) becomes your login ID.`,
    "  2. Open Registration Link: click the \"Click Here\" button above.",
    "  3. Complete Your Profile: set your full name, phone number and a strong password.",
    "  4. Access Admin Panel: sign in and start managing orders and customers.",
    "",
    `Official page: ${FACEBOOK_PAGE_URL}`,
    "",
    "Best Regards,",
    store,
  ].join("\n");

  return { subject, html, text };
}

export { BRAND_FALLBACK_NAME };
