import { corePrisma } from "@/lib/prisma";
import { computeCodFee, computeReturnFee, resolvePathaoFeePolicy } from "@/lib/couriers/fees";

/**
 * Automatic profit / loss ledger engine (Database 3).
 *
 * Every delivered order books an `ORDER_PROFIT` row (revenue, COGS, delivery
 * fee, Pathao's COD collection fee and net profit) and every returned parcel
 * books a `RETURN_DELIVERY_LOSS` row (the courier's return charge is the loss).
 * Cancelled orders never keep a pending row, so they never pollute profit or
 * loss.
 *
 * These helpers are deliberately plain (no `"use server"`) and always swallow
 * their own errors at the call site so a ledger hiccup can never block an order
 * status change.
 */

export interface LedgerLineInput {
  unitCostPrice: number;
  quantity: number;
}

/** Σ(item.unitCostPrice × item.quantity) — the true buying cost of the parcel. */
export function computeProductCost(items: LedgerLineInput[]): number {
  return items.reduce((sum, item) => sum + Number(item.unitCostPrice ?? 0) * Number(item.quantity ?? 0), 0);
}

/**
 * The fee Pathao actually charges for the shipment. Falls back to the order's
 * own delivery charge when the courier has not reported a fee yet.
 */
export function resolveActualDeliveryFee(courierFee: number, deliveryCharge: number): number {
  return courierFee > 0 ? courierFee : deliveryCharge;
}

export interface DeliveredLedgerInput {
  shopId: string;
  orderId: string;
  orderNumber: string;
  consignmentId?: string | null;
  subtotal: number;
  discount: number;
  totalAmount: number;
  courierFee: number;
  deliveryCharge: number;
  isPaymentSettled: boolean;
  items: LedgerLineInput[];
  performedBy?: string | null;
}

/**
 * Books (or refreshes) the profit row for a delivered order.
 *
 *   productRevenue = subtotal − discount
 *   productCost    = Σ(unitCostPrice × quantity)
 *   deliveryFee    = courierFee > 0 ? courierFee : deliveryCharge
 *   codFee         = totalAmount × PATHAO_COD_FEE_PERCENT% (Pathao's cut)
 *   netProfit      = totalAmount − deliveryFee − codFee − productCost
 */
export async function recordDeliveredLedger(input: DeliveredLedgerInput): Promise<void> {
  const productRevenue = Number(input.subtotal ?? 0) - Number(input.discount ?? 0);
  const productCost = computeProductCost(input.items);
  const deliveryCharge = resolveActualDeliveryFee(Number(input.courierFee ?? 0), Number(input.deliveryCharge ?? 0));
  const totalAmount = Number(input.totalAmount ?? 0);
  const policy = resolvePathaoFeePolicy();
  const codFee = computeCodFee(totalAmount, policy);
  const netProfit = totalAmount - deliveryCharge - codFee - productCost;
  const collectionStatus: "COLLECTED" | "PENDING" = input.isPaymentSettled ? "COLLECTED" : "PENDING";
  const collectedAt = input.isPaymentSettled ? new Date() : null;

  const data = {
    shopId: input.shopId,
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    consignmentId: input.consignmentId ?? null,
    type: "ORDER_PROFIT" as const,
    collectionStatus,
    collectedAmount: totalAmount,
    productRevenue,
    productCost,
    deliveryCharge,
    codFee,
    netProfit,
    collectedAt,
    collectedBy: input.isPaymentSettled ? input.performedBy ?? null : null,
  };

  await corePrisma.financialLedger.upsert({
    where: { orderId: input.orderId },
    update: data,
    create: {
      ...data,
      note: `Delivered — COD booked to profit (Pathao fees: delivery ৳${deliveryCharge}, COD ${policy.codFeePercent}% → ৳${codFee})`,
    },
  });
}

export interface ReturnedLedgerInput {
  shopId: string;
  orderId: string;
  orderNumber: string;
  consignmentId?: string | null;
  courierFee: number;
  deliveryCharge: number;
  performedBy?: string | null;
}

/**
 * Books the loss row for a returned parcel — the courier still charges for the
 * failed delivery, and no product revenue is collected.
 *
 *   returnFee = (courierFee else deliveryCharge) × PATHAO_RETURN_FEE_PERCENT%
 *   netProfit = −returnFee
 */
export async function recordReturnedLedger(input: ReturnedLedgerInput): Promise<void> {
  const policy = resolvePathaoFeePolicy();
  const billedFee = resolveActualDeliveryFee(Number(input.courierFee ?? 0), Number(input.deliveryCharge ?? 0));
  const returnFee = computeReturnFee(billedFee, policy);

  const data = {
    shopId: input.shopId,
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    consignmentId: input.consignmentId ?? null,
    type: "RETURN_DELIVERY_LOSS" as const,
    collectionStatus: "WAIVED_OR_LOST" as const,
    collectedAmount: 0,
    productRevenue: 0,
    productCost: 0,
    codFee: 0,
    deliveryCharge: returnFee,
    netProfit: -returnFee,
    note: `Parcel returned — Pathao return charge ${policy.returnFeePercent}% of the ৳${billedFee} delivery fee`,
    collectedAt: null,
    collectedBy: null,
  };

  await corePrisma.financialLedger.upsert({
    where: { orderId: input.orderId },
    update: data,
    create: data,
  });
}

/**
 * Drops any *pending* ledger row for an order so a cancelled order can never
 * count toward profit or loss. Collected history is left untouched.
 */
export async function clearPendingLedger(orderId: string): Promise<void> {
  await corePrisma.financialLedger.deleteMany({
    where: { orderId, collectionStatus: "PENDING" },
  });
}
