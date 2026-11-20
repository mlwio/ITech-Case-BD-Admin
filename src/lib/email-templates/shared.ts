/**
 * Shared building blocks for the transactional emails.
 *
 * Plain-string HTML (no template engine) so the mails render identically in
 * Gmail, Outlook and mobile clients. The palette mirrors the brand mark:
 * navy + gold accent.
 */

export const BRAND_FALLBACK_NAME = "ITech Case BD";
export const FACEBOOK_PAGE_URL = "https://www.facebook.com/itechcasebd/";

export const NAVY = "#0f1427";
export const GOLD = "#c9a24a";

/** Shape returned by every template builder; fed straight into `sendMail`. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Escapes user-supplied values before they are interpolated into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Resolves the store/brand name, defaulting to the ITech Case BD brand. */
export function brandName(name?: string | null): string {
  const trimmed = (name ?? "").trim();
  return trimmed || BRAND_FALLBACK_NAME;
}
