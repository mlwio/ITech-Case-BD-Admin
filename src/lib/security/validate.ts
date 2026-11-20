/**
 * Server-side input validation & sanitisation helpers.
 *
 * Every server action and API route treats its arguments as untrusted. These
 * pure helpers normalise strings, clamp numbers and validate Bangladeshi phone
 * numbers so malformed or hostile payloads never reach Prisma.
 */

/** Strips control characters and trims, then clips to `maxLength`. */
export function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  // Remove C0/C1 control characters (except newline/tab) that poison logs/UI.
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return cleaned.slice(0, maxLength);
}

/** True when the sanitised string has content. */
export function isNonEmptyText(value: unknown, maxLength = 200): boolean {
  return sanitizeText(value, maxLength).length > 0;
}

/** Coerces to a finite number, falling back when the input is garbage. */
export function toFiniteNumber(value: unknown, fallback = 0): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/** Coerces to a finite, non-negative number. */
export function toNonNegativeNumber(value: unknown, fallback = 0): number {
  return Math.max(0, toFiniteNumber(value, fallback));
}

/** Coerces to a positive integer (used for quantities). */
export function toPositiveInt(value: unknown, fallback = 1): number {
  const num = Math.trunc(toFiniteNumber(value, fallback));
  return num > 0 ? num : fallback;
}

/** Normalises any BD phone input to the 11-digit local form (`01XXXXXXXXX`). */
export function normalizeBdPhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "").replace(/^880/, "");
  if (digits.length === 10 && digits.startsWith("1")) return `0${digits}`;
  return digits;
}

/** Pathao expects the 11-digit local format — reject anything else up front. */
export function isValidBdPhone(value: unknown): boolean {
  return /^01[3-9]\d{8}$/.test(normalizeBdPhone(value));
}

/** Ensures an id-like string is a safe, non-empty ObjectId-shaped token. */
export function isHexObjectId(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
}
