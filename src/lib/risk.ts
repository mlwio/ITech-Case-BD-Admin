/**
 * Local, zero-dependency risk intelligence for the order desk.
 *
 * Everything runs offline against the shop's own order history plus a
 * deterministic "courier check" simulation keyed off the phone number, so the
 * desk gets an instant, stable read on a buyer without any paid API.
 */

import type { OrderStatus } from "./types";

export interface OrderHistoryEntry {
  orderNumber: string;
  phone: string;
  status: OrderStatus;
  placedAt: string;
}

export type RiskLevel = "safe" | "watch" | "risk" | "new";

export interface RiskAssessment {
  level: RiskLevel;
  /** Short badge text, e.g. "Safe buyer" / "High risk" / "First-time buyer". */
  label: string;
  totalParcels: number;
  delivered: number;
  returned: number;
  cancelled: number;
  successRate: number;
  tone: "success" | "warning" | "destructive" | "muted";
}

export interface DuplicateHit {
  orderNumber: string;
  status: OrderStatus;
  placedAt: string;
  hoursAgo: number;
}

/** Reduce any BD number variant to the canonical `01XXXXXXXXX`. */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("88")) digits = digits.slice(2);
  if (digits.startsWith("1")) digits = `0${digits}`;
  return digits;
}

const CLOSED_STATUSES: OrderStatus[] = ["DELIVERED", "RETURNED", "CANCELLED"];

/**
 * Returns `null` when the phone is empty / too short to judge.
 *
 * The read-out is always computed from this shop's real order history — no
 * fabricated numbers. A brand-new number therefore reports zero history rather
 * than an invented success rate.
 */
export function assessRisk(
  phone: string,
  history: OrderHistoryEntry[],
): RiskAssessment | null {
  const normalized = normalizePhone(phone);
  if (normalized.length < 6) return null;

  const relevant = history.filter((entry) => normalizePhone(entry.phone) === normalized);
  const delivered = relevant.filter((entry) => entry.status === "DELIVERED").length;
  const returned = relevant.filter((entry) => entry.status === "RETURNED").length;
  const cancelled = relevant.filter((entry) => entry.status === "CANCELLED").length;
  const closed = delivered + returned + cancelled;

  if (relevant.length === 0) {
    return {
      level: "new",
      label: "First-time buyer",
      totalParcels: 0,
      delivered: 0,
      returned: 0,
      cancelled: 0,
      successRate: 0,
      tone: "muted",
    };
  }

  const successRate = closed ? Math.round((delivered / closed) * 100) : 0;
  const level: RiskLevel =
    closed === 0 ? "new" : successRate >= 85 ? "safe" : successRate >= 60 ? "watch" : "risk";

  const label =
    closed === 0
      ? "No completed delivery yet"
      : level === "risk"
        ? "High risk"
        : level === "safe"
          ? "Safe buyer"
          : "Watch";

  return {
    level,
    label,
    totalParcels: relevant.length,
    delivered,
    returned,
    cancelled,
    successRate,
    tone:
      level === "safe" ? "success" : level === "watch" ? "warning" : level === "risk" ? "destructive" : "muted",
  };
}

/**
 * Pathao-style delivery breakdown for the phone currently on the form.
 *
 * "Received" = delivered; "Not received" = returned + cancelled; the remaining
 * statuses are split into in-transit and still-pending. Returns `null` until the
 * number is long enough to look up, so the panel stays hidden while typing.
 */
export interface DeliveryStats {
  total: number;
  delivered: number;
  notReceived: number;
  returned: number;
  cancelled: number;
  inTransit: number;
  pending: number;
  successRate: number;
}

export function deliveryStats(
  phone: string,
  history: OrderHistoryEntry[],
): DeliveryStats | null {
  const normalized = normalizePhone(phone);
  if (normalized.length < 6) return null;

  const relevant = history.filter((entry) => normalizePhone(entry.phone) === normalized);
  const count = (status: OrderStatus) =>
    relevant.filter((entry) => entry.status === status).length;

  const delivered = count("DELIVERED");
  const returned = count("RETURNED");
  const cancelled = count("CANCELLED");
  const inTransit = count("IN_TRANSIT");
  const pending = count("PLACED") + count("CONFIRMED") + count("HOLD");
  const closed = delivered + returned + cancelled;

  return {
    total: relevant.length,
    delivered,
    returned,
    cancelled,
    inTransit,
    pending,
    notReceived: returned + cancelled,
    successRate: closed ? Math.round((delivered / closed) * 100) : 0,
  };
}

/** Orders from the same number placed within the last `withinHours`. */
export function findDuplicateOrders(
  phone: string,
  history: OrderHistoryEntry[],
  withinHours = 72,
  excludeOrderNumber?: string,
): DuplicateHit[] {
  const normalized = normalizePhone(phone);
  if (normalized.length < 6) return [];

  const cutoff = Date.now() - withinHours * 3_600_000;

  return history
    .filter((entry) => normalizePhone(entry.phone) === normalized)
    .filter((entry) => entry.orderNumber !== excludeOrderNumber)
    .filter((entry) => new Date(entry.placedAt).getTime() >= cutoff)
    .map((entry) => ({
      orderNumber: entry.orderNumber,
      status: entry.status,
      placedAt: entry.placedAt,
      hoursAgo: Math.max(1, Math.round((Date.now() - new Date(entry.placedAt).getTime()) / 3_600_000)),
    }))
    .sort((a, b) => a.hoursAgo - b.hoursAgo);
}

export { CLOSED_STATUSES };
