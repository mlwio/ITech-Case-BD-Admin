/**
 * Customer CRM intelligence (Phase 4).
 *
 * Derives the fields the `/customers` directory needs — lifetime spend, return
 * risk, favourite iPhone model/colour — directly from the order list so the CRM
 * never disagrees with the orders board.
 */

import { productModel } from "./catalog-meta";
import type { Customer, Order } from "./types";

export type RiskLevel = "low" | "medium" | "high";

export interface CustomerInsight {
  customer: Customer;
  /** Every order for this customer, newest first. */
  orders: Order[];
  totalOrders: number;
  delivered: number;
  returned: number;
  cancelled: number;
  /** Value of delivered (collected) orders. */
  totalSpent: number;
  /** Value still in transit / delivered-but-unsettled. */
  outstanding: number;
  lastOrderAt: string | null;
  /** Delivered ÷ closed orders, as a percentage. */
  deliveryRate: number;
  riskLevel: RiskLevel;
  /** 0–100 delivery-success score (higher = safer). */
  riskScore: number;
  /** Unique iPhone models this customer has bought, most frequent first. */
  models: string[];
  preferredModel: string | null;
  preferredColor: string | null;
}

const CLOSED: Order["status"][] = ["DELIVERED", "RETURNED", "CANCELLED"];

export function buildCustomerInsights(customers: Customer[], orders: Order[]): CustomerInsight[] {
  const byCustomer = new Map<string, Order[]>();
  for (const order of orders) {
    const list = byCustomer.get(order.customerId);
    if (list) list.push(order);
    else byCustomer.set(order.customerId, [order]);
  }

  return customers.map((customer) => {
    const list = (byCustomer.get(customer.id) ?? []).sort(
      (a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime(),
    );

    const delivered = list.filter((order) => order.status === "DELIVERED");
    const returned = list.filter((order) => order.status === "RETURNED").length;
    const cancelled = list.filter((order) => order.status === "CANCELLED").length;
    const closed = list.filter((order) => CLOSED.includes(order.status)).length;

    const totalSpent = delivered.reduce((sum, order) => sum + order.totalAmount, 0);
    const outstanding = list
      .filter((order) => order.status === "IN_TRANSIT" || (order.status === "DELIVERED" && !order.isPaymentSettled))
      .reduce((sum, order) => sum + order.totalAmount, 0);

    // Delivery success ratio across closed parcels (new customers are neutral).
    const riskScore = closed ? Math.round((delivered.length / closed) * 100) : 100;

    const modelCounts = new Map<string, number>();
    const colorCounts = new Map<string, number>();
    for (const order of list) {
      for (const item of order.items) {
        const model = productModel(item.productName);
        if (model) modelCounts.set(model, (modelCounts.get(model) ?? 0) + item.quantity);
        if (item.variantName) {
          colorCounts.set(item.variantName, (colorCounts.get(item.variantName) ?? 0) + item.quantity);
        }
      }
    }

    const preferredModel = topKey(modelCounts);
    const preferredColor = topKey(colorCounts);

    return {
      customer,
      orders: list,
      totalOrders: list.length || customer.totalOrders,
      delivered: delivered.length || customer.deliveredCount,
      returned,
      cancelled,
      totalSpent,
      outstanding,
      lastOrderAt: list[0]?.placedAt ?? null,
      deliveryRate: riskScore,
      riskLevel: riskLevelOf(riskScore, returned, closed),
      riskScore,
      models: [...modelCounts.entries()].sort((a, b) => b[1] - a[1]).map(([model]) => model),
      preferredModel,
      preferredColor,
    } satisfies CustomerInsight;
  });
}

function topKey(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function riskLevelOf(score: number, returned: number, closed: number): RiskLevel {
  if (closed === 0) return "low";
  if (returned >= 2 || score < 55) return "high";
  if (returned >= 1 || score < 80) return "medium";
  return "low";
}

export const RISK_META: Record<RiskLevel, { label: string; className: string }> = {
  low: { label: "Low risk", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30" },
  medium: { label: "Medium risk", className: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30" },
  high: { label: "High risk", className: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30" },
};
