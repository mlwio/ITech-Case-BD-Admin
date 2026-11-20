/**
 * Analytics helpers.
 *
 * All figures are derived from the order list so the dashboard, finance and
 * analytics screens never disagree with each other.
 */

import { ORDER_STATUS_META } from "./constants";
import type {
  Customer,
  ExpenseLog,
  Order,
  OrderSource,
  OrderStatus,
  Product,
  ProductVariant,
} from "./types";

const MS_PER_DAY = 86_400_000;

export interface Kpis {
  totalOrders: number;
  todayOrders: number;
  pendingOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  cancelledOrders: number;
  grossRevenue: number;
  deliveredRevenue: number;
  todayRevenue: number;
  collectedRevenue: number;
  outstandingRevenue: number;
  avgOrderValue: number;
  deliveryRate: number;
  returnRate: number;
  cancellationRate: number;
  totalUnits: number;
  cogs: number;
  courierCost: number;
  grossProfit: number;
}

/** Statuses whose value is booked as revenue (money expected or collected). */
const REVENUE_STATUSES: OrderStatus[] = ["CONFIRMED", "IN_TRANSIT", "DELIVERED"];

export function isRevenueOrder(order: Order): boolean {
  return REVENUE_STATUSES.includes(order.status);
}

export function revenueOrders(orders: Order[]): Order[] {
  return orders.filter(isRevenueOrder);
}

function sameDay(iso: string, reference: Date): boolean {
  const date = new Date(iso);
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

export function computeKpis(orders: Order[]): Kpis {
  const now = new Date();
  const revenue = revenueOrders(orders);
  const delivered = orders.filter((order) => order.status === "DELIVERED");
  const pending = orders.filter((order) =>
    (["PLACED", "CONFIRMED", "HOLD"] as OrderStatus[]).includes(order.status),
  );
  const returned = orders.filter((order) => order.status === "RETURNED");
  const cancelled = orders.filter((order) => order.status === "CANCELLED");

  const grossRevenue = revenue.reduce((sum, order) => sum + order.totalAmount, 0);
  const deliveredRevenue = delivered.reduce((sum, order) => sum + order.totalAmount, 0);
  const collectedRevenue = orders
    .filter((order) => order.isPaymentSettled)
    .reduce((sum, order) => sum + order.totalAmount, 0);
  const todayOrdersList = orders.filter((order) => sameDay(order.placedAt, now));

  const cogs = revenue.reduce(
    (sum, order) =>
      sum + order.items.reduce((itemSum, item) => itemSum + item.unitCostPrice * item.quantity, 0),
    0,
  );
  const courierCost = revenue.reduce((sum, order) => sum + order.courierFee, 0);
  const totalUnits = orders.reduce(
    (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  );

  const closedForRate = delivered.length + returned.length + cancelled.length;

  return {
    totalOrders: orders.length,
    todayOrders: todayOrdersList.length,
    pendingOrders: pending.length,
    deliveredOrders: delivered.length,
    returnedOrders: returned.length,
    cancelledOrders: cancelled.length,
    grossRevenue,
    deliveredRevenue,
    todayRevenue: todayOrdersList
      .filter(isRevenueOrder)
      .reduce((sum, order) => sum + order.totalAmount, 0),
    collectedRevenue,
    outstandingRevenue: Math.max(0, grossRevenue - collectedRevenue),
    avgOrderValue: revenue.length ? grossRevenue / revenue.length : 0,
    deliveryRate: closedForRate ? (delivered.length / closedForRate) * 100 : 0,
    returnRate: closedForRate ? (returned.length / closedForRate) * 100 : 0,
    cancellationRate: closedForRate ? (cancelled.length / closedForRate) * 100 : 0,
    totalUnits,
    cogs,
    courierCost,
    grossProfit: grossRevenue - cogs - courierCost,
  };
}

export function countByStatus(orders: Order[]): Record<OrderStatus, number> {
  const counts = {
    PLACED: 0,
    CONFIRMED: 0,
    HOLD: 0,
    CANCELLED: 0,
    IN_TRANSIT: 0,
    DELIVERED: 0,
    RETURNED: 0,
  } satisfies Record<OrderStatus, number>;

  for (const order of orders) counts[order.status] += 1;
  return counts;
}

export interface TrendPoint {
  date: string;
  label: string;
  orders: number;
  revenue: number;
}

/** Daily order count + revenue for the last `days` days (oldest → newest). */
export function revenueTrend(orders: Order[], days = 14): TrendPoint[] {
  const now = new Date();
  const points: TrendPoint[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(now.getTime() - offset * MS_PER_DAY);
    const dayOrders = orders.filter((order) => sameDay(order.placedAt, day));
    points.push({
      date: day.toISOString(),
      label: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(day),
      orders: dayOrders.length,
      revenue: dayOrders
        .filter(isRevenueOrder)
        .reduce((sum, order) => sum + order.totalAmount, 0),
    });
  }

  return points;
}

export interface SourceStat {
  source: OrderSource;
  orders: number;
  revenue: number;
  share: number;
}

export function sourceBreakdown(orders: Order[]): SourceStat[] {
  const grouped = new Map<OrderSource, { orders: number; revenue: number }>();

  for (const order of orders) {
    const current = grouped.get(order.source) ?? { orders: 0, revenue: 0 };
    current.orders += 1;
    if (isRevenueOrder(order)) current.revenue += order.totalAmount;
    grouped.set(order.source, current);
  }

  const total = orders.length || 1;
  return Array.from(grouped.entries())
    .map(([source, value]) => ({
      source,
      orders: value.orders,
      revenue: value.revenue,
      share: (value.orders / total) * 100,
    }))
    .sort((a, b) => b.orders - a.orders);
}

export interface ZoneStat {
  zone: "DHAKA" | "OTHER";
  orders: number;
  revenue: number;
}

export function zoneBreakdown(orders: Order[]): ZoneStat[] {
  const grouped = new Map<ZoneStat["zone"], { orders: number; revenue: number }>();

  for (const order of orders) {
    const zone = order.deliveryZone === "DHAKA" ? "DHAKA" : "OTHER";
    const current = grouped.get(zone) ?? { orders: 0, revenue: 0 };
    current.orders += 1;
    if (isRevenueOrder(order)) current.revenue += order.totalAmount;
    grouped.set(zone, current);
  }

  return Array.from(grouped.entries())
    .map(([zone, value]) => ({ zone, ...value }))
    .sort((a, b) => b.orders - a.orders);
}

export interface ProductStat {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  units: number;
  revenue: number;
  profit: number;
}

export function topProducts(orders: Order[], limit = 6): ProductStat[] {
  const grouped = new Map<string, ProductStat>();

  for (const order of orders) {
    if (!isRevenueOrder(order)) continue;
    for (const item of order.items) {
      const current = grouped.get(item.variantId) ?? {
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        units: 0,
        revenue: 0,
        profit: 0,
      };
      current.units += item.quantity;
      current.revenue += item.unitPrice * item.quantity;
      current.profit += (item.unitPrice - item.unitCostPrice) * item.quantity;
      grouped.set(item.variantId, current);
    }
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export interface InventoryStat {
  totalVariants: number;
  totalUnits: number;
  stockValue: number;
  retailValue: number;
  lowStock: (ProductVariant & { productName: string })[];
  outOfStock: (ProductVariant & { productName: string })[];
}

export function inventoryStats(products: Product[]): InventoryStat {
  const variants = products.flatMap((product) =>
    product.variants.map((variant) => ({ ...variant, productName: product.name })),
  );

  return {
    totalVariants: variants.length,
    totalUnits: variants.reduce((sum, variant) => sum + variant.stockQty, 0),
    stockValue: variants.reduce((sum, variant) => sum + variant.stockQty * variant.costPrice, 0),
    retailValue: variants.reduce((sum, variant) => sum + variant.stockQty * variant.sellingPrice, 0),
    lowStock: variants
      .filter((variant) => variant.stockQty > 0 && variant.stockQty <= variant.lowStockThreshold)
      .sort((a, b) => a.stockQty - b.stockQty),
    outOfStock: variants.filter((variant) => variant.stockQty <= 0),
  };
}

export interface FinanceSummary {
  revenue: number;
  cogs: number;
  courierCost: number;
  expenses: number;
  adSpend: number;
  packaging: number;
  salary: number;
  otherExpense: number;
  grossProfit: number;
  netProfit: number;
  margin: number;
  roas: number;
  expenseByCategory: { category: ExpenseLog["category"]; amount: number }[];
}

export function financeSummary(orders: Order[], expenses: ExpenseLog[]): FinanceSummary {
  const kpis = computeKpis(orders);

  const adSpend = sumCategory(expenses, "AD_SPEND");
  const packaging = sumCategory(expenses, "PACKAGING");
  const salary = sumCategory(expenses, "SALARY");
  const otherExpense = sumCategory(expenses, "OTHER");
  const totalExpenses = adSpend + packaging + salary + otherExpense;

  const grossProfit = kpis.grossRevenue - kpis.cogs;
  const netProfit = grossProfit - kpis.courierCost - totalExpenses;

  return {
    revenue: kpis.grossRevenue,
    cogs: kpis.cogs,
    courierCost: kpis.courierCost,
    expenses: totalExpenses,
    adSpend,
    packaging,
    salary,
    otherExpense,
    grossProfit,
    netProfit,
    margin: kpis.grossRevenue ? (netProfit / kpis.grossRevenue) * 100 : 0,
    roas: adSpend ? kpis.grossRevenue / adSpend : 0,
    expenseByCategory: [
      { category: "AD_SPEND", amount: adSpend },
      { category: "PACKAGING", amount: packaging },
      { category: "SALARY", amount: salary },
      { category: "OTHER", amount: otherExpense },
    ],
  };
}

function sumCategory(expenses: ExpenseLog[], category: ExpenseLog["category"]): number {
  return expenses
    .filter((expense) => expense.category === category)
    .reduce((sum, expense) => sum + expense.amountBdt, 0);
}

export function statusLabel(status: OrderStatus): string {
  return ORDER_STATUS_META[status].label;
}

/* -------------------------------------------------------------------------- */
/*  Pathao COD settlement reconciliation (Phase 4)                            */
/* -------------------------------------------------------------------------- */

export interface CodSettlement {
  /** Cash sitting with Pathao — parcels still in transit. */
  pendingCod: number;
  pendingCount: number;
  /** Delivered parcels Pathao has not yet paid out. */
  deliveredUnsettled: number;
  deliveredUnsettledCount: number;
  /** Money already paid out / reconciled. */
  settled: number;
  settledCount: number;
  /** Sum of the three buckets. */
  totalCod: number;
  /** Share of collectable COD that has landed in the bank. */
  settlementRate: number;
}

/**
 * Buckets every COD order into the three reconciliation states the merchant
 * needs to match against a Pathao payment invoice:
 *   In Transit → Pending · Delivered (unsettled) · Settled / Paid.
 */
export function codSettlement(orders: Order[]): CodSettlement {
  const inTransit = orders.filter((order) => order.status === "IN_TRANSIT" && !order.isPaymentSettled);
  const deliveredUnsettledOrders = orders.filter(
    (order) => order.status === "DELIVERED" && !order.isPaymentSettled,
  );
  const settledOrders = orders.filter((order) => order.isPaymentSettled);

  const sum = (list: Order[]) => list.reduce((total, order) => total + order.totalAmount, 0);

  const pendingCod = sum(inTransit);
  const deliveredUnsettled = sum(deliveredUnsettledOrders);
  const settled = sum(settledOrders);
  const totalCod = pendingCod + deliveredUnsettled + settled;

  return {
    pendingCod,
    pendingCount: inTransit.length,
    deliveredUnsettled,
    deliveredUnsettledCount: deliveredUnsettledOrders.length,
    settled,
    settledCount: settledOrders.length,
    totalCod,
    settlementRate: totalCod ? (settled / totalCod) * 100 : 0,
  };
}

/** Best customers by delivered order count — used on the analytics screen. */
export function topCustomers(customers: Customer[], limit = 5): Customer[] {
  return [...customers]
    .sort((a, b) => b.deliveredCount - a.deliveredCount || b.totalOrders - a.totalOrders)
    .slice(0, limit);
}

/** Group orders into counts per weekday for the "busy days" chart. */
export function weekdayLoad(orders: Order[]): { day: string; orders: number }[] {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const counts = new Array(7).fill(0) as number[];
  for (const order of orders) counts[new Date(order.placedAt).getDay()] += 1;
  return labels.map((day, index) => ({ day, orders: counts[index] }));
}

/** Confirmed orders ÷ total orders, as a percentage. */
export function confirmationRate(orders: Order[]): number {
  if (!orders.length) return 0;
  const confirmed = orders.filter((order) =>
    (["CONFIRMED", "IN_TRANSIT", "DELIVERED"] as OrderStatus[]).includes(order.status),
  ).length;
  return (confirmed / orders.length) * 100;
}

export interface ModeratorStat {
  name: string;
  /** Orders this moderator keyed in. */
  placed: number;
  /** Of those, how many are confirmed or past confirmation. */
  confirmed: number;
  cancelled: number;
  conversion: number;
  revenue: number;
}

/** Per-staff intake vs confirmation — powers the dashboard leaderboard. */
export function moderatorLeaderboard(orders: Order[]): ModeratorStat[] {
  const grouped = new Map<string, ModeratorStat>();

  for (const order of orders) {
    const name = order.createdByName || "Unassigned";
    const current = grouped.get(name) ?? {
      name,
      placed: 0,
      confirmed: 0,
      cancelled: 0,
      conversion: 0,
      revenue: 0,
    };
    current.placed += 1;
    if ((["CONFIRMED", "IN_TRANSIT", "DELIVERED"] as OrderStatus[]).includes(order.status)) {
      current.confirmed += 1;
      current.revenue += order.totalAmount;
    }
    if (order.status === "CANCELLED") current.cancelled += 1;
    grouped.set(name, current);
  }

  return Array.from(grouped.values())
    .map((stat) => ({
      ...stat,
      conversion: stat.placed ? (stat.confirmed / stat.placed) * 100 : 0,
    }))
    .sort((a, b) => b.confirmed - a.confirmed || b.conversion - a.conversion);
}

/**
 * Daily order + revenue trend bucketed across an explicit window (oldest →
 * newest). Used by the dashboard so the chart tracks the active date filter.
 */
export function revenueTrendBetween(
  orders: Order[],
  startMs: number,
  endMs: number,
  maxBuckets = 32,
): TrendPoint[] {
  const startDay = new Date(startMs);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(endMs);
  endDay.setHours(0, 0, 0, 0);

  const totalDays = Math.max(1, Math.round((endDay.getTime() - startDay.getTime()) / MS_PER_DAY) + 1);
  const step = Math.max(1, Math.ceil(totalDays / maxBuckets));
  const bucketCount = Math.ceil(totalDays / step);

  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    date: new Date(startDay.getTime() + index * step * MS_PER_DAY),
    orders: 0,
    revenue: 0,
  }));

  for (const order of orders) {
    const placed = new Date(order.placedAt);
    placed.setHours(0, 0, 0, 0);
    const dayIndex = Math.round((placed.getTime() - startDay.getTime()) / MS_PER_DAY);
    const bucket = Math.floor(dayIndex / step);
    if (bucket < 0 || bucket >= buckets.length) continue;
    buckets[bucket].orders += 1;
    if (isRevenueOrder(order)) buckets[bucket].revenue += order.totalAmount;
  }

  return buckets.map((bucket) => ({
    date: bucket.date.toISOString(),
    label: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(bucket.date),
    orders: bucket.orders,
    revenue: bucket.revenue,
  }));
}
