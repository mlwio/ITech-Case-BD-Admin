/** Formatting helpers — BDT currency, dates and Bangladeshi phone numbers. */

const bdtFormatter = new Intl.NumberFormat("en-BD", {
  style: "decimal",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** `৳ 12,450` — the canonical money format used across the app. */
export function formatBDT(amount: number, withDecimals = false): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const formatted = withDecimals
    ? new Intl.NumberFormat("en-BD", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)
    : bdtFormatter.format(Math.round(value));
  return `৳ ${formatted}`;
}

/** Compact money for chart axes & KPI tiles: `৳ 1.2L` / `৳ 3.4k`. */
export function formatBDTCompact(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(value);
  if (abs >= 100000) return `৳ ${(value / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `৳ ${(value / 1000).toFixed(1)}k`;
  return `৳ ${Math.round(value)}`;
}

export function formatNumber(value: number): string {
  return bdtFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(digits)}%`;
}

/** `18 Nov 2026` */
export function formatDate(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** `18 Nov 2026, 4:35 PM` */
export function formatDateTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** `2h ago`, `3d ago` — used by the courier & inbox feeds. */
export function formatRelative(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

/** Normalises local BD numbers to E.164 for Pathao: `01712345678` → `+8801712345678`. */
export function toE164BD(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("880")) return `+${digits}`;
  if (digits.startsWith("0")) return `+880${digits.slice(1)}`;
  return `+880${digits}`;
}

/** `01712-345678` — easier to scan in dense order tables. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^880/, "0");
  if (digits.length !== 11) return phone;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
