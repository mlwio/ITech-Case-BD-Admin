/**
 * Cross-database stock movement engine.
 *
 * Order line items live in Database 1 (`ordersPrisma`); the live stock they
 * touch lives in Database 3 (`corePrisma`). MongoDB cannot transact across the
 * two, so this module sequences the write and appends the immutable
 * `InventoryMovement` ledger row in the same core transaction.
 *
 * Semantics are best-effort: a line whose deduction would go negative is
 * skipped rather than thrown, because the caller is a status sync (webhook ack
 * / live refresh) that must never fail on stock. The manual dashboard status
 * change keeps its own stricter, throwing variant so a stock-out can block the
 * transition.
 */

import { corePrisma } from "@/lib/prisma";
import { ordersPrisma } from "@/lib/prisma-orders";
import type { StockTransition } from "@/lib/inventory";

export async function applyOrderStockMovement(
  order: { id: string; shopId: string; orderNumber: string },
  transition: StockTransition,
  performedBy: string,
  note: string,
): Promise<void> {
  const items = await ordersPrisma.orderItem.findMany({ where: { orderId: order.id } });

  await corePrisma.$transaction(async (tx) => {
    for (const item of items) {
      const delta = transition.direction === "deduct" ? -item.quantity : item.quantity;
      const changed = await tx.productVariant.updateMany({
        where: {
          id: item.variantId,
          ...(transition.direction === "deduct" ? { stockQty: { gte: item.quantity } } : {}),
        },
        data: { stockQty: { increment: delta } },
      });
      if (changed.count !== 1) continue;

      const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
      if (!variant) continue;

      await tx.inventoryMovement.create({
        data: {
          shopId: order.shopId,
          variantId: variant.id,
          variantName: variant.name,
          sku: variant.sku,
          delta,
          reason: transition.reason,
          note,
          resultingQty: variant.stockQty,
          performedBy,
        },
      });
    }
  });
}
