"use server";

import { revalidatePath } from "next/cache";
import { corePrisma, isDatabaseConfigured } from "@/lib/prisma";
import { customersPrisma } from "@/lib/prisma-customers";
import { ordersPrisma } from "@/lib/prisma-orders";
import { getAuthSession } from "@/lib/auth/session";
import { bookSingleOrder } from "@/lib/couriers/book-single";
import { bulkBookPathaoOrdersAction } from "@/lib/actions/courier";
import { stockTransition } from "@/lib/inventory";
import { clearPendingLedger, recordDeliveredLedger, recordReturnedLedger } from "@/lib/ledger";
import {
  isHexObjectId,
  isValidBdPhone,
  normalizeBdPhone,
  sanitizeText,
  toNonNegativeNumber,
} from "@/lib/security/validate";
import type {
  DeliveryZone,
  InventoryMovementReason,
  OrderSource,
  OrderStatus,
} from "@/lib/types";

/**
 * Order server actions.
 *
 * Every mutation requires a configured database and persists before returning
 * success.
 */

export interface ActionResult {
  ok: boolean;
  mode: "database";
  message: string;
  orderNumber?: string;
  id?: string;
  /** True when the parcel auto-booked with Pathao the moment the order saved. */
  booked?: boolean;
  consignmentId?: string;
  /** Set when the order saved (stock deducted) but the auto Pathao booking failed. */
  bookingWarning?: string;
}

/** Thrown for user-fixable input problems so their message can surface safely. */
class OrderValidationError extends Error {}

export interface CreateOrderInput {
  orderNumber: string;
  customerMode: "existing" | "new";
  customerId?: string;
  newCustomer?: { name: string; phone: string; address: string; zone: DeliveryZone };
  items: { variantId: string; quantity: number; unitPrice?: number }[];
  source: OrderSource;
  deliveryZone: DeliveryZone;
  deliveryCharge: number;
  discount: number;
  note?: string;
  isPaymentSettled: boolean;
  createdByName: string;
}

function revalidateOrderSurfaces() {
  revalidatePath("/");
  revalidatePath("/orders");
  revalidatePath("/courier");
  revalidatePath("/finance");
  revalidatePath("/customers");
  revalidatePath("/inventory");
}

async function resolveShop(shopId: string) {
  const shop = await corePrisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new Error("No shop configured");
  return shop;
}

/* -------------------------------------------------------------------------- */
/*  Create order                                                              */
/* -------------------------------------------------------------------------- */

export async function createOrderAction(input: CreateOrderInput): Promise<ActionResult> {
  if (!isDatabaseConfigured) {
    return {
      ok: false,
      mode: "database",
      message: "Order creation is unavailable because the database is not configured.",
    };
  }
  const session = await getAuthSession();
  if (!session) {
    return { ok: false, mode: "database", message: "Sign in with an active team account to create orders." };
  }
  if (!session.permissions.orders) {
    return { ok: false, mode: "database", message: "You do not have permission to create orders." };
  }

  try {
    const shop = await resolveShop(session.shopId);
    const performedBy = session.name || "Team member";

    const orderNumber = sanitizeText(input.orderNumber, 40);
    if (!orderNumber) throw new OrderValidationError("Order number is required.");

    // Treat every field as untrusted: coerce ids, quantities and money.
    const requested = input.items
      .map((item) => ({
        variantId: sanitizeText(item.variantId, 64),
        quantity: Number(item.quantity),
        unitPrice: item.unitPrice,
      }));
    if (requested.length === 0) {
      throw new OrderValidationError("Add at least one product to the order.");
    }
    if (
      requested.some(
        (item) =>
          !isHexObjectId(item.variantId) ||
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > 1000,
      )
    ) {
      throw new OrderValidationError("Order items contain an invalid product or quantity.");
    }
    if (new Set(requested.map((item) => item.variantId)).size !== requested.length) {
      throw new OrderValidationError("Add each product variant once and update its quantity.");
    }

    const variants = await corePrisma.productVariant.findMany({
      where: { id: { in: requested.map((item) => item.variantId) } },
      include: { product: true },
    });
    if (variants.length !== requested.length || variants.some((variant) => variant.product.shopId !== shop.id)) {
      throw new OrderValidationError("One or more selected products are no longer available.");
    }

    const lines: {
      variantId: string;
      productName: string;
      variantName: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      unitCostPrice: number;
    }[] = [];

    for (const item of requested) {
      const variant = variants.find((row) => row.id === item.variantId);
      if (!variant) continue;
      // Stock-out guard — never oversell, block before anything is written.
      if (variant.stockQty < item.quantity) {
        throw new OrderValidationError(
          `${variant.product.name} · ${variant.name} — only ${variant.stockQty} pcs left (need ${item.quantity}).`,
        );
      }
      lines.push({
        variantId: variant.id,
        productName: variant.product.name,
        variantName: variant.name,
        sku: variant.sku,
        quantity: item.quantity,
        // The calculator sends the (possibly bundle-tiered) unit price; the
        // catalog's selling price is only the fallback.
        unitPrice:
          typeof item.unitPrice === "number" &&
          Number.isFinite(item.unitPrice) &&
          item.unitPrice >= 0
            ? Math.min(item.unitPrice, Number(variant.sellingPrice))
            : Number(variant.sellingPrice),
        unitCostPrice: Number(variant.costPrice),
      });
    }
    if (lines.length === 0) {
      throw new OrderValidationError("None of the selected products could be found.");
    }

    const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    // The discount comes off the cover price only — clamp it to the subtotal so
    // it can never spill over and reduce the delivery charge.
    const discount = Math.max(0, Math.min(toNonNegativeNumber(input.discount), subtotal));
    const deliveryCharge = toNonNegativeNumber(input.deliveryCharge);
    const totalAmount = Math.max(0, subtotal - discount + deliveryCharge);

    const customer = await resolveCustomer(shop.id, input);

    // MongoDB cannot transact across three databases, so the write is sequenced
    // with best-effort compensation: the order lands in Database 1, then
    // Database 3 deducts stock. If the deduction fails the order is removed, so
    // an order can never exist without its stock deducted.
    const order = await ordersPrisma.order.create({
      data: {
        shopId: shop.id,
        orderNumber,
        customerId: customer.id,
        // Orders are confirmed the moment they are saved so they can book
        // with Pathao immediately.
        status: "CONFIRMED",
        source: input.source,
        deliveryZone: input.deliveryZone,
        deliveryCharge,
        discount,
        subtotal,
        totalAmount,
        courierName: "Pathao",
        isPaymentSettled: Boolean(input.isPaymentSettled),
        note: sanitizeText(input.note ?? "", 1000) || null,
        createdById: session.userId,
        items: { create: lines },
      },
    });

    try {
      // Stock deduction + inventory ledger both live in Database 3, so they
      // commit together.
      await corePrisma.$transaction(async (tx) => {
        for (const line of lines) {
          const variant = variants.find((row) => row.id === line.variantId)!;
          const deducted = await tx.productVariant.updateMany({
            where: { id: variant.id, stockQty: { gte: line.quantity } },
            data: { stockQty: { decrement: line.quantity } },
          });
          if (deducted.count !== 1) {
            throw new OrderValidationError(
              `${variant.product.name} · ${variant.name} no longer has enough stock.`,
            );
          }
          const updatedVariant = await tx.productVariant.findUnique({ where: { id: variant.id } });
          const resultingQty = updatedVariant?.stockQty ?? 0;

          await tx.inventoryMovement.create({
            data: {
              shopId: shop.id,
              variantId: variant.id,
              variantName: variant.name,
              sku: variant.sku,
              delta: -line.quantity,
              reason: "ORDER_CONFIRMED",
              note: `Auto-deducted — ${order.orderNumber} created`,
              resultingQty,
              performedBy,
            },
          });
        }
      });
    } catch (stockError) {
      // Roll the order back so it can never exist without its stock deducted.
      await ordersPrisma.order.delete({ where: { id: order.id } }).catch((error) => {
        console.error("[orders:rollback]", error);
      });
      throw stockError;
    }

    // Customer order counter — Database 2, best-effort (never blocks the order).
    await customersPrisma.customer
      .update({ where: { id: customer.id }, data: { totalOrders: { increment: 1 } } })
      .catch((error) => console.error("[orders:customer-counter]", error));

    // Success audit trail — Database 1, best-effort.
    await ordersPrisma.orderAuditLog
      .create({
        data: {
          shopId: shop.id,
          orderId: order.id,
          action: "ORDER_CREATED",
          details: `${order.orderNumber} created from ${input.source} for ${customer.name} — stock deducted`,
          performedBy,
        },
      })
      .catch((error) => console.error("[orders:audit]", error));

    // Instant fulfilment: book the parcel with Pathao the moment the order saves.
    // `bookSingleOrder` also writes the PATHAO_CONSIGNMENT_CREATED audit entry.
    const booking = await bookSingleOrder(order.id, performedBy);

    revalidateOrderSurfaces();

    if (!booking.ok) {
      // The order is safely saved with stock deducted — surface the retry path.
      return {
        ok: true,
        mode: "database",
        message: `${order.orderNumber} created — Pathao booking needs a retry`,
        orderNumber: order.orderNumber,
        id: order.id,
        booked: false,
        bookingWarning: booking.message,
      };
    }

    return {
      ok: true,
      mode: "database",
      message: `${order.orderNumber} created & booked — ${booking.consignmentId}`,
      orderNumber: order.orderNumber,
      id: order.id,
      booked: true,
      consignmentId: booking.consignmentId,
    };
  } catch (error) {
    if (error instanceof OrderValidationError) {
      return { ok: false, mode: "database", message: error.message };
    }
    // Log the real cause server-side; never leak internals to the client.
    console.error("[orders:create]", error);
    return { ok: false, mode: "database", message: "Could not create the order. Please try again." };
  }
}

async function resolveCustomer(
  shopId: string,
  input: CreateOrderInput,
): Promise<{ id: string; name: string }> {
  if (input.customerMode === "existing" && isHexObjectId(input.customerId)) {
    const existing = await customersPrisma.customer.findFirst({
      where: { id: input.customerId, shopId },
    });
    if (existing) return { id: existing.id, name: existing.name };
  }

  const fresh = input.newCustomer;
  if (!fresh) throw new OrderValidationError("Customer details are required");

  const name = sanitizeText(fresh.name, 160);
  const phone = normalizeBdPhone(fresh.phone);
  const address = sanitizeText(fresh.address, 500);

  if (!name) throw new OrderValidationError("Enter the customer name.");
  if (!isValidBdPhone(phone)) {
    throw new OrderValidationError("Enter a valid 11-digit mobile number (01XXXXXXXXX).");
  }
  if (!address) throw new OrderValidationError("Enter the delivery address.");

  const upserted = await customersPrisma.customer.upsert({
    where: { shopId_phone: { shopId, phone } },
    update: { name, address, zone: fresh.zone },
    create: {
      shopId,
      name,
      phone,
      address,
      zone: fresh.zone,
    },
  });
  return { id: upserted.id, name: upserted.name };
}

/* -------------------------------------------------------------------------- */
/*  Status updates                                                            */
/* -------------------------------------------------------------------------- */

export async function updateOrderStatusAction(
  orderId: string,
  status: OrderStatus,
  performedBy: string,
  note?: string,
): Promise<ActionResult> {
  if (!isDatabaseConfigured) {
    return { ok: false, mode: "database", message: "Order updates require a database connection." };
  }
  const session = await getAuthSession();
  if (!session) {
    return { ok: false, mode: "database", message: "Sign in with an active team account to update orders." };
  }
  if (!session.permissions.orders) {
    return { ok: false, mode: "database", message: "You do not have permission to update orders." };
  }

  try {
    const order = await ordersPrisma.order.findFirst({
      where: { id: orderId, shopId: session.shopId },
    });
    if (!order) return { ok: false, mode: "database", message: "Order not found" };
    if (order.consignmentId && status !== order.status) {
      return {
        ok: false,
        mode: "database",
        message: "This order is synced with Pathao; update its status from the courier timeline.",
      };
    }

    // Auto stock engine: deduct when an order is confirmed/booked, restock on
    // cancel/return. Order, stock and ledger update together.
    const transition = stockTransition(order.status, status);
    const actor = session.name || "Team member";
    const detail = sanitizeText(note, 1000) || `Status moved ${order.status} → ${status}`;

    // Stock first (Database 3) so a stock-out failure blocks the status change;
    // the order itself flips in Database 1 only once the stock move succeeded.
    if (transition) {
      await applyOrderStockMovement(
        order,
        transition.direction,
        transition.reason,
        actor,
        `Auto-${transition.direction === "deduct" ? "deducted" : "restocked"} — ${order.orderNumber} → ${status}`,
      );
    }

    const changed = await ordersPrisma.order.updateMany({
      where: { id: order.id, shopId: session.shopId, status: order.status },
      data: {
        status,
        ...(status === "DELIVERED" ? { isPaymentSettled: true } : {}),
      },
    });
    if (changed.count !== 1) {
      // The order moved in another session — undo the stock movement we applied.
      if (transition) {
        await applyOrderStockMovement(
          order,
          transition.direction === "deduct" ? "restock" : "deduct",
          transition.reason,
          actor,
          `Auto-reverted — ${order.orderNumber} status conflict`,
        ).catch((error) => console.error("[orders:stock-revert]", error));
      }
      throw new OrderValidationError("This order changed in another session. Refresh and retry.");
    }

    await ordersPrisma.orderAuditLog
      .create({
        data: {
          shopId: order.shopId,
          orderId,
          action: "STATUS_CHANGED",
          details: detail,
          performedBy: actor,
        },
      })
      .catch((error) => console.error("[orders:audit]", error));

    // Financial ledger (Database 3): book profit on delivery, a delivery-charge
    // loss on return, and drop any pending row when an order is cancelled. Wrapped
    // so a ledger hiccup can never block the status change itself.
    try {
      if (status === "DELIVERED") {
        const items = await ordersPrisma.orderItem.findMany({
          where: { orderId: order.id },
          select: { unitCostPrice: true, quantity: true },
        });
        await recordDeliveredLedger({
          shopId: order.shopId,
          orderId: order.id,
          orderNumber: order.orderNumber,
          consignmentId: order.consignmentId,
          subtotal: Number(order.subtotal),
          discount: Number(order.discount),
          totalAmount: Number(order.totalAmount),
          courierFee: Number(order.courierFee),
          deliveryCharge: Number(order.deliveryCharge),
          isPaymentSettled: true,
          items,
          performedBy: actor,
        });
      } else if (status === "RETURNED") {
        await recordReturnedLedger({
          shopId: order.shopId,
          orderId: order.id,
          orderNumber: order.orderNumber,
          consignmentId: order.consignmentId,
          courierFee: Number(order.courierFee),
          deliveryCharge: Number(order.deliveryCharge),
          performedBy: actor,
        });
      } else if (status === "CANCELLED") {
        await clearPendingLedger(order.id);
      }
    } catch (ledgerError) {
      console.error("[orders:ledger]", ledgerError);
    }

    revalidateOrderSurfaces();
    return { ok: true, mode: "database", message: `Status updated to ${status}`, orderNumber: order.orderNumber };
  } catch (error) {
    return {
      ok: false,
      mode: "database",
      message: error instanceof OrderValidationError ? error.message : "Could not update the order. Please try again.",
    };
  }
}

/** Applies a signed stock change to every line item and logs an inventory movement. */
async function applyOrderStockMovement(
  order: { id: string; shopId: string; orderNumber: string },
  direction: "deduct" | "restock",
  reason: InventoryMovementReason,
  performedBy: string,
  note: string,
): Promise<void> {
  // Order items live in Database 1; the stock they touch lives in Database 3.
  const items = await ordersPrisma.orderItem.findMany({ where: { orderId: order.id } });

  await corePrisma.$transaction(async (tx) => {
    for (const item of items) {
      const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
      if (!variant) throw new OrderValidationError("An order product is no longer available.");

      const delta = direction === "deduct" ? -item.quantity : item.quantity;
      const changed = await tx.productVariant.updateMany({
        where: {
          id: variant.id,
          ...(direction === "deduct" ? { stockQty: { gte: item.quantity } } : {}),
        },
        data: { stockQty: { increment: delta } },
      });
      if (changed.count !== 1) {
        throw new OrderValidationError(`${variant.name} no longer has enough stock.`);
      }
      const updatedVariant = await tx.productVariant.findUnique({ where: { id: variant.id } });
      if (!updatedVariant) throw new OrderValidationError("An order product is no longer available.");

      await tx.inventoryMovement.create({
        data: {
          shopId: order.shopId,
          variantId: variant.id,
          variantName: variant.name,
          sku: variant.sku,
          delta,
          reason,
          note,
          resultingQty: updatedVariant.stockQty,
          performedBy,
        },
      });
    }
  });
}

/* -------------------------------------------------------------------------- */
/*  Quick stock adjustment / restock (Phase 4)                                */
/* -------------------------------------------------------------------------- */

export interface StockAdjustmentInput {
  variantId: string;
  /** Signed change: positive = restock, negative = correction / damage. */
  delta: number;
  reason: InventoryMovementReason;
  note?: string;
  performedBy: string;
}

export interface StockAdjustmentResult extends ActionResult {
  resultingQty?: number;
  variantName?: string;
  sku?: string;
}

export async function adjustStockAction(input: StockAdjustmentInput): Promise<StockAdjustmentResult> {
  const delta = Math.trunc(input.delta);
  if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000) {
    return { ok: false, mode: "database", message: "Enter a non-zero quantity" };
  }

  if (!isDatabaseConfigured) {
    return {
      ok: false,
      mode: "database",
      message: "Stock adjustments require a database connection.",
    };
  }
  const session = await getAuthSession();
  if (!session) {
    return { ok: false, mode: "database", message: "Sign in with an active team account to adjust stock." };
  }
  if (!session.permissions.inventory) {
    return { ok: false, mode: "database", message: "You do not have permission to adjust stock." };
  }

  try {
    // Reject malformed ids before they reach Prisma (a bad ObjectId throws).
    if (!isHexObjectId(input.variantId)) {
      return { ok: false, mode: "database", message: "Variant not found" };
    }
    const variant = await corePrisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: { product: true },
    });
    if (!variant) return { ok: false, mode: "database", message: "Variant not found" };
    if (variant.product.shopId !== session.shopId) {
      return { ok: false, mode: "database", message: "Variant not found" };
    }

    const updated = await corePrisma.$transaction(async (tx) => {
      const changed = await tx.productVariant.updateMany({
        where: {
          id: variant.id,
          ...(delta < 0 ? { stockQty: { gte: Math.abs(delta) } } : {}),
        },
        data: { stockQty: { increment: delta } },
      });
      if (changed.count !== 1) {
        throw new OrderValidationError("Stock cannot be reduced below zero.");
      }
      const current = await tx.productVariant.findUnique({ where: { id: variant.id } });
      if (!current) throw new OrderValidationError("Variant not found");
      const resultingQty = current.stockQty;

      await tx.inventoryMovement.create({
        data: {
          shopId: variant.product.shopId,
          variantId: variant.id,
          variantName: variant.name,
          sku: variant.sku,
          delta,
          reason: input.reason,
          note: sanitizeText(input.note, 1000) || null,
          resultingQty,
          performedBy: session.name || "Team member",
        },
      });
      return resultingQty;
    });

    revalidateOrderSurfaces();
    return {
      ok: true,
      mode: "database",
      message: `${variant.name} stock is now ${updated}`,
      resultingQty: updated,
      variantName: variant.name,
      sku: variant.sku,
    };
  } catch (error) {
    if (error instanceof OrderValidationError) {
      return { ok: false, mode: "database", message: error.message };
    }
    console.error("[orders:adjust-stock]", error);
    return { ok: false, mode: "database", message: "Could not adjust the stock. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Bulk Pathao booking                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Delegates to the Phase 3 Pathao fulfillment engine so orders booked from the
 * Orders board and the Courier desk share one code path (and one validation).
 */
export async function bulkSendToPathaoAction(
  orderIds: string[],
  performedBy: string,
): Promise<ActionResult> {
  if (orderIds.length === 0) {
    return { ok: false, mode: "database", message: "No orders selected" };
  }
  return bulkBookPathaoOrdersAction(orderIds, performedBy);
}
