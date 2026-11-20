import type { OrderStatus } from "@/lib/types";

/**
 * Chart palette.
 *
 * Kept in a plain (non-"use client") module so server components can read the
 * values without pulling them through the React Client Manifest.
 */

export const CHART_COLORS = {
  primary: "#4f46e5",
  violet: "#7c3aed",
  sky: "#0ea5e9",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  orange: "#f97316",
  slate: "#64748b",
};

export const STATUS_CHART_COLORS: Record<OrderStatus, string> = {
  PLACED: "#3b82f6",
  CONFIRMED: "#22c55e",
  HOLD: "#f59e0b",
  CANCELLED: "#ef4444",
  IN_TRANSIT: "#6366f1",
  DELIVERED: "#10b981",
  RETURNED: "#f43f5e",
};
