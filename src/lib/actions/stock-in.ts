"use server";

import { revalidatePath } from "next/cache";
import { corePrisma, isDatabaseConfigured } from "@/lib/prisma";
import { ordersPrisma } from "@/lib/prisma-orders";
import { getAuthSession } from "@/lib/auth/session";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { colorCode, modelCode, productModel, productNameForModel } from "@/lib/catalog-meta";
import { isHexObjectId, sanitizeText, toNonNegativeNumber } from "@/lib/security/validate";
import type { InventoryMovementReason } from "@/lib/types";

/**
 * Stock-In server actions.
 *
 * Back the `/stock-in` cascading manager: pick a series + variant tier, then
 * add / remove silicone colours and top up units inline. Every quantity change
 * writes an `InventoryMovement` (`RESTOCK`) row so the ledger stays authoritative.
 */

export interface VariantPayload {
  id: string;
  productId: string;
  name: string;
  sku: string;
  color: string;
  costPrice: number;
  sellingPrice: number;
  stockQty: number;
  lowStockThreshold: number;
}

export interface StockInActionResult {
  ok: boolean;
  mode: "database";
  message: string;
}

function revalidateInventorySurfaces() {
  revalidatePath("/stock-in");
  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath("/");
}

async function guardInventory(): Promise<
  | { ok: true; shopId: string; performedBy: string }
  | { ok: false; message: string }
> {
  const session = await getAuthSession();
  if (!session) {
    return { ok: false, message: "Sign in with an active team account to manage stock." };
  }
  if (!session.permissions.inventory) {
    return { ok: false, message: "You do not have permission to manage stock." };
  }
  return { ok: true, shopId: session.shopId, performedBy: session.name || "Team member" };
}

async function uniqueSku(model: string, color: string): Promise<string> {
  const base = `${modelCode(model)}-SIL-${colorCode(color)}`;
  let candidate = base;
  let suffix = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await corePrisma.productVariant.findUnique({ where: { sku: candidate } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

/* -------------------------------------------------------------------------- */
/*  Add colour → creates the variant with 0 pcs                               */
/* -------------------------------------------------------------------------- */

export interface CreateVariantInput {
  /** Canonical model, e.g. "iPhone 12 Pro". */
  model: string;
  /** Display colour name, e.g. "Gray". */
  color: string;
  costPrice: number;
  sellingPrice: number;
}

export interface CreateVariantResult extends StockInActionResult {
  productId?: string;
  variant?: VariantPayload;
}

export async function createVariantAction(input: CreateVariantInput): Promise<CreateVariantResult> {
  // Preserve the colour name exactly as typed (only trimmed) — the operator's
  // own label is what should land in the catalog, case and spacing included.
  const color = sanitizeText(input.color, 80);
  if (!color) return { ok: false, mode: "database", message: "Enter a colour name" };

  const model = sanitizeText(input.model, 100);
  if (!model) return { ok: false, mode: "database", message: "Select a product model" };
  const costPrice = toNonNegativeNumber(input.costPrice);
  const sellingPrice = toNonNegativeNumber(input.sellingPrice);

  if (!isDatabaseConfigured) {
    return { ok: false, mode: "database", message: "Stock management requires a database connection." };
  }

  const access = await guardInventory();
  if (!access.ok) return { ok: false, mode: "database", message: access.message };

  try {
    const shop = await corePrisma.shop.findUnique({ where: { id: access.shopId } });
    if (!shop) throw new Error("No shop configured");

    const productName = productNameForModel(model);
    let product = await corePrisma.product.findFirst({ where: { shopId: shop.id, name: productName } });
    if (!product) {
      product = await corePrisma.product.create({
        data: {
          shopId: shop.id,
          name: productName,
          brand: "Apple",
          category: "Silicone Case",
          description: `${model} silicone case`,
          isActive: true,
        },
      });
    }

    // MongoDB + Prisma has no case-insensitive filter mode, so compare in JS.
    const siblings = await corePrisma.productVariant.findMany({ where: { productId: product.id } });
    if (siblings.some((variant) => variant.color.toLowerCase() === color.toLowerCase())) {
      return { ok: false, mode: "database", message: `${color} already exists for ${input.model}` };
    }

    const sku = await uniqueSku(model, color);
    const variant = await corePrisma.productVariant.create({
      data: {
        productId: product.id,
        name: color,
        sku,
        color,
        costPrice,
        sellingPrice,
        stockQty: 0,
        lowStockThreshold: LOW_STOCK_THRESHOLD,
        isActive: true,
      },
    });

    revalidateInventorySurfaces();
    return {
      ok: true,
      mode: "database",
      message: `${color} added to ${input.model} — add the incoming quantity`,
      productId: product.id,
      variant: {
        id: variant.id,
        productId: variant.productId,
        name: variant.name,
        sku: variant.sku,
        color: variant.color,
        costPrice: Number(variant.costPrice),
        sellingPrice: Number(variant.sellingPrice),
        stockQty: variant.stockQty,
        lowStockThreshold: variant.lowStockThreshold,
      },
    };
  } catch (error) {
    // Log the real cause server-side; never leak internals to the client.
    console.error("[stock-in]", error);
    return { ok: false, mode: "database", message: "Could not complete the stock operation. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Remove colour                                                             */
/* -------------------------------------------------------------------------- */

export async function removeVariantAction(variantId: string): Promise<StockInActionResult> {
  if (!variantId) return { ok: false, mode: "database", message: "Missing colour id" };

  if (!isDatabaseConfigured) {
    return { ok: false, mode: "database", message: "Stock management requires a database connection." };
  }

  const access = await guardInventory();
  if (!access.ok) return { ok: false, mode: "database", message: access.message };

  try {
    const variant = await corePrisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true },
    });
    if (!variant) return { ok: false, mode: "database", message: "Colour not found" };
    if (variant.product.shopId !== access.shopId) {
      return { ok: false, mode: "database", message: "Colour not found" };
    }

    // Order lines live in Database 1, so the "is this colour already sold?"
    // guard reads them from `ordersPrisma`.
    const orderItemCount = await ordersPrisma.orderItem.count({ where: { variantId } });

    // OrderItem → ProductVariant is RESTRICT, so a used colour can't be deleted.
    if (orderItemCount > 0) {
      return {
        ok: false,
        mode: "database",
        message: `${variant.name} is on ${orderItemCount} order(s) — set its stock to 0 instead of removing it.`,
      };
    }

    await corePrisma.productVariant.delete({ where: { id: variantId } });
    revalidateInventorySurfaces();
    return {
      ok: true,
      mode: "database",
      message: `${variant.name} removed from ${productModel(variant.product.name)}`,
    };
  } catch (error) {
    // Log the real cause server-side; never leak internals to the client.
    console.error("[stock-in]", error);
    return { ok: false, mode: "database", message: "Could not complete the stock operation. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Stock-In save                                                             */
/* -------------------------------------------------------------------------- */

export interface StockInInput {
  variantId: string;
  /** Units arriving — always added to the current stock. */
  quantity: number;
  /** Optional unit buying cost (৳) — updates the variant when > 0. */
  costPrice?: number;
  note?: string;
  performedBy: string;
}

export interface StockInResult extends StockInActionResult {
  resultingQty?: number;
}

export async function stockInAction(input: StockInInput): Promise<StockInResult> {
  const qty = Math.trunc(Number(input.quantity));
  if (!Number.isSafeInteger(qty) || qty <= 0 || qty > 1_000_000) {
    return { ok: false, mode: "database", message: "Enter a quantity greater than zero" };
  }

  if (!isDatabaseConfigured) {
    return { ok: false, mode: "database", message: "Stock management requires a database connection." };
  }

  const access = await guardInventory();
  if (!access.ok) return { ok: false, mode: "database", message: access.message };

  try {
    const variant = await corePrisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: { product: true },
    });
    if (!variant) return { ok: false, mode: "database", message: "Colour not found" };
    if (variant.product.shopId !== access.shopId) {
      return { ok: false, mode: "database", message: "Colour not found" };
    }

    const costPrice =
      typeof input.costPrice === "number" &&
      Number.isFinite(input.costPrice) &&
      input.costPrice > 0
        ? input.costPrice
        : undefined;

    const resultingQty = await corePrisma.$transaction(async (tx) => {
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { stockQty: { increment: qty }, ...(costPrice !== undefined ? { costPrice } : {}) },
      });
      const updated = await tx.productVariant.findUnique({ where: { id: variant.id } });
      if (!updated) throw new Error("Colour not found");

      await tx.inventoryMovement.create({
        data: {
          shopId: variant.product.shopId,
          variantId: variant.id,
          variantName: variant.name,
          sku: variant.sku,
          delta: qty,
          reason: "RESTOCK" satisfies InventoryMovementReason,
          note:
            sanitizeText(input.note, 1000) ||
            `Stock-In — ${productModel(variant.product.name)} · ${variant.name}`,
          resultingQty: updated.stockQty,
          performedBy: access.performedBy,
        },
      });
      return updated.stockQty;
    });

    revalidateInventorySurfaces();
    return {
      ok: true,
      mode: "database",
      message: `+${qty} — ${variant.name} now ${resultingQty} pcs`,
      resultingQty,
    };
  } catch (error) {
    // Log the real cause server-side; never leak internals to the client.
    console.error("[stock-in]", error);
    return { ok: false, mode: "database", message: "Could not complete the stock operation. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Excel backup → bulk restore                                               */
/* -------------------------------------------------------------------------- */

/** One row parsed from the operator's edited `.xlsx` backup. */
export interface StockRestoreRow {
  variantId: string;
  /** Absolute quantity the variant should be set to (>= 0). */
  stockQty: number;
  costPrice?: number;
  sellingPrice?: number;
}

export interface StockRestoreChange {
  variantId: string;
  sku: string;
  label: string;
  from: number;
  to: number;
}

export interface StockRestoreResult extends StockInActionResult {
  updated?: number;
  skipped?: number;
  changes?: StockRestoreChange[];
}

/** Upper bound on a single restore so a runaway sheet cannot stall the DB. */
const MAX_RESTORE_ROWS = 2_000;
const MAX_RESTORE_QTY = 1_000_000;

/**
 * Bulk-applies an edited Stock-In Excel backup.
 *
 * Every row is re-validated against the database — the `variantId` must be a
 * well-formed ObjectId that belongs to the caller's own shop (IDOR-safe) and
 * the quantity a non-negative integer — then the changed variants are updated
 * in one core transaction with an `InventoryMovement` audit row per change.
 */
export async function importStockRestoreAction(rows: StockRestoreRow[]): Promise<StockRestoreResult> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, mode: "database", message: "The file did not contain any stock rows." };
  }
  if (rows.length > MAX_RESTORE_ROWS) {
    return {
      ok: false,
      mode: "database",
      message: `Too many rows in one file (max ${MAX_RESTORE_ROWS}). Split it and import again.`,
    };
  }

  if (!isDatabaseConfigured) {
    return { ok: false, mode: "database", message: "Stock management requires a database connection." };
  }

  const access = await guardInventory();
  if (!access.ok) return { ok: false, mode: "database", message: access.message };

  // Normalise + validate. Malformed rows are skipped, never written.
  const requested = new Map<string, { stockQty: number; costPrice?: number; sellingPrice?: number }>();
  for (const row of rows) {
    const variantId = typeof row?.variantId === "string" ? row.variantId.trim() : "";
    if (!isHexObjectId(variantId)) continue;

    const stockQty = Math.trunc(Number(row?.stockQty));
    if (!Number.isSafeInteger(stockQty) || stockQty < 0 || stockQty > MAX_RESTORE_QTY) continue;

    const costPrice =
      typeof row?.costPrice === "number" && Number.isFinite(row.costPrice) && row.costPrice >= 0
        ? row.costPrice
        : undefined;
    const sellingPrice =
      typeof row?.sellingPrice === "number" && Number.isFinite(row.sellingPrice) && row.sellingPrice >= 0
        ? row.sellingPrice
        : undefined;

    // Last row wins for a duplicated variant id.
    requested.set(variantId, { stockQty, costPrice, sellingPrice });
  }

  if (requested.size === 0) {
    return {
      ok: false,
      mode: "database",
      message: "No valid rows found — check that the variantId and stock columns are intact.",
    };
  }

  try {
    const variants = await corePrisma.productVariant.findMany({
      where: { id: { in: [...requested.keys()] } },
      include: { product: true },
    });

    // IDOR guard: only touch variants whose product belongs to this shop.
    const owned = new Map(
      variants
        .filter((variant) => variant.product.shopId === access.shopId)
        .map((variant) => [variant.id, variant]),
    );

    const writes: {
      id: string;
      sku: string;
      name: string;
      label: string;
      from: number;
      to: number;
      costPrice?: number;
      sellingPrice?: number;
    }[] = [];

    for (const [variantId, row] of requested) {
      const variant = owned.get(variantId);
      if (!variant) continue;

      const nextCost =
        row.costPrice !== undefined && row.costPrice !== Number(variant.costPrice) ? row.costPrice : undefined;
      const nextSelling =
        row.sellingPrice !== undefined && row.sellingPrice !== Number(variant.sellingPrice)
          ? row.sellingPrice
          : undefined;
      if (row.stockQty === variant.stockQty && nextCost === undefined && nextSelling === undefined) continue;

      writes.push({
        id: variant.id,
        sku: variant.sku,
        name: variant.name,
        label: `${productModel(variant.product.name)} · ${variant.name}`,
        from: variant.stockQty,
        to: row.stockQty,
        costPrice: nextCost,
        sellingPrice: nextSelling,
      });
    }

    const skipped = requested.size - writes.length;
    if (writes.length === 0) {
      return {
        ok: true,
        mode: "database",
        message: "Everything is already up to date — nothing to restore.",
        updated: 0,
        skipped,
        changes: [],
      };
    }

    const changes: StockRestoreChange[] = [];

    await corePrisma.$transaction(
      async (tx) => {
        for (const write of writes) {
          await tx.productVariant.update({
            where: { id: write.id },
            data: {
              stockQty: write.to,
              ...(write.costPrice !== undefined ? { costPrice: write.costPrice } : {}),
              ...(write.sellingPrice !== undefined ? { sellingPrice: write.sellingPrice } : {}),
            },
          });

          // A price-only change keeps the ledger clean — no quantity moved.
          if (write.to === write.from) continue;

          await tx.inventoryMovement.create({
            data: {
              shopId: access.shopId,
              variantId: write.id,
              variantName: write.name,
              sku: write.sku,
              delta: write.to - write.from,
              reason: "MANUAL_ADJUSTMENT" satisfies InventoryMovementReason,
              note: `Bulk Excel restore — ${write.label}`,
              resultingQty: write.to,
              performedBy: access.performedBy,
            },
          });
          changes.push({ variantId: write.id, sku: write.sku, label: write.label, from: write.from, to: write.to });
        }
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    revalidateInventorySurfaces();
    return {
      ok: true,
      mode: "database",
      message: `Restored ${changes.length} stock change${changes.length === 1 ? "" : "s"}${
        skipped ? ` · ${skipped} unchanged` : ""
      }`,
      updated: writes.length,
      skipped,
      changes,
    };
  } catch (error) {
    // Log the real cause server-side; never leak internals to the client.
    console.error("[stock-in:restore]", error);
    return { ok: false, mode: "database", message: "Could not restore the stock backup. Please try again." };
  }
}
