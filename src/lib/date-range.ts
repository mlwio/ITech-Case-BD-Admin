/**
 * Date-range presets shared by the dashboard filters and the server page.
 *
 * Everything is computed from the order's `placedAt` ISO string so the client
 * filter (which only writes URL params) and the server (which reads them) always
 * agree on the window.
 */

export const ORDER_RANGE_KEYS = [
  "TODAY",
  "YESTERDAY",
  "LAST_7",
  "THIS_MONTH",
  "CUSTOM",
] as const;

export type RangeKey = (typeof ORDER_RANGE_KEYS)[number];

export interface RangePreset {
  key: RangeKey;
  label: string;
}

export const ORDER_RANGE_PRESETS: RangePreset[] = [
  { key: "TODAY", label: "Today" },
  { key: "YESTERDAY", label: "Yesterday" },
  { key: "LAST_7", label: "Last 7 Days" },
  { key: "THIS_MONTH", label: "This Month" },
  { key: "CUSTOM", label: "Custom" },
];

export const DEFAULT_RANGE: RangeKey = "THIS_MONTH";

export interface ResolvedRange {
  key: RangeKey;
  label: string;
  /** Inclusive lower bound (ms epoch). */
  start: number;
  /** Inclusive upper bound (ms epoch). */
  end: number;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function parseYmd(value: string | undefined): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Turn the raw URL params into a concrete window. */
export function resolveRange(
  key: string | undefined,
  from?: string,
  to?: string,
): ResolvedRange {
  const now = new Date();
  const normalizedKey = (ORDER_RANGE_KEYS as readonly string[]).includes(key ?? "")
    ? (key as RangeKey)
    : DEFAULT_RANGE;

  switch (normalizedKey) {
    case "TODAY":
      return { key: "TODAY", label: "Today", start: startOfDay(now).getTime(), end: now.getTime() };
    case "YESTERDAY": {
      const yesterday = new Date(now.getTime() - 86_400_000);
      return {
        key: "YESTERDAY",
        label: "Yesterday",
        start: startOfDay(yesterday).getTime(),
        end: endOfDay(yesterday).getTime(),
      };
    }
    case "LAST_7": {
      const from7 = new Date(now.getTime() - 6 * 86_400_000);
      return { key: "LAST_7", label: "Last 7 Days", start: startOfDay(from7).getTime(), end: now.getTime() };
    }
    case "CUSTOM": {
      const start = parseYmd(from) ?? startOfDay(now);
      const end = parseYmd(to) ?? now;
      const [lo, hi] = start.getTime() <= end.getTime() ? [start, end] : [end, start];
      return {
        key: "CUSTOM",
        label: "Custom range",
        start: startOfDay(lo).getTime(),
        end: endOfDay(hi).getTime(),
      };
    }
    case "THIS_MONTH":
    default:
      return {
        key: "THIS_MONTH",
        label: "This Month",
        start: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)).getTime(),
        end: now.getTime(),
      };
  }
}

/** Keep only orders whose `placedAt` falls inside the window. */
export function filterByRange<T extends { placedAt: string }>(
  orders: T[],
  range: ResolvedRange,
): T[] {
  return orders.filter((order) => {
    const time = new Date(order.placedAt).getTime();
    return time >= range.start && time <= range.end;
  });
}
