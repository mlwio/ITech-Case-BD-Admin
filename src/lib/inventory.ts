/**
 * Inventory domain helpers.
 *
 * Plain module (no "use client") shared by:
 *   - the order status engine (auto stock deduct / restock),
 *   - the `/inventory` matrix view,
 *   - the quick stock adjustment server action.
 */

import { IPHONE_MODELS, SILICONE_COLORS, productModel, sortIphoneModels } from "./catalog-meta";
import type {
  InventoryMovementReason,
  OrderStatus,
  Product,
  ProductVariant,
} from "./types";

/* -------------------------------------------------------------------------- */
/*  Auto stock movement on status change                                      */
/* -------------------------------------------------------------------------- */

/**
 * Orders in these statuses have physically taken their units out of sellable
 * stock. Moving into one of them deducts; leaving one restocks.
 */
export const STOCK_HOLDING_STATUSES: OrderStatus[] = ["CONFIRMED", "IN_TRANSIT", "DELIVERED"];

export function holdsStock(status: OrderStatus): boolean {
  return STOCK_HOLDING_STATUSES.includes(status);
}

export interface StockTransition {
  direction: "deduct" | "restock";
  reason: InventoryMovementReason;
}

/**
 * Which stock movement (if any) a status change implies.
 *
 *   PLACED/HOLD ─▶ CONFIRMED/IN_TRANSIT/DELIVERED   → deduct (order confirmed)
 *   CONFIRMED/… ─▶ CANCELLED                         → restock (cancelled)
 *   CONFIRMED/… ─▶ RETURNED                          → restock (returned)
 */
export function stockTransition(prev: OrderStatus, next: OrderStatus): StockTransition | null {
  const wasHolding = holdsStock(prev);
  const willHold = holdsStock(next);
  if (!wasHolding && willHold) return { direction: "deduct", reason: "ORDER_CONFIRMED" };
  if (wasHolding && !willHold) {
    return {
      direction: "restock",
      reason: next === "RETURNED" ? "ORDER_RETURNED" : "ORDER_CANCELLED",
    };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Matrix builder                                                            */
/* -------------------------------------------------------------------------- */

export interface InventoryCellVariant extends ProductVariant {
  productId: string;
  productName: string;
  model: string;
}

export interface InventoryMatrixRow {
  model: string;
  productId: string | null;
  productName: string;
  /** Variants keyed by silicone colour. */
  variants: Record<string, InventoryCellVariant>;
  totalUnits: number;
}

export interface InventoryMatrix {
  colors: string[];
  rows: InventoryMatrixRow[];
  allVariants: InventoryCellVariant[];
}

/** Pivot the catalog into an iPhone-model × silicone-colour matrix. */
export function buildInventoryMatrix(products: Product[]): InventoryMatrix {
  const productByModel = new Map<string, Product>();
  for (const product of products) productByModel.set(productModel(product.name), product);

  const models = sortIphoneModels(Array.from(productByModel.keys()));

  const seenColors = new Set(products.flatMap((product) => product.variants.map((variant) => variant.color)));
  const colors = [
    ...(SILICONE_COLORS as readonly string[]).filter((color) => seenColors.has(color)),
    ...Array.from(seenColors).filter(
      (color) => !(SILICONE_COLORS as readonly string[]).includes(color),
    ),
  ];

  const rows: InventoryMatrixRow[] = models.map((model) => {
    const product = productByModel.get(model);
    const variants: Record<string, InventoryCellVariant> = {};
    if (product) {
      for (const variant of product.variants) {
        variants[variant.color] = {
          ...variant,
          productId: product.id,
          productName: product.name,
          model,
        };
      }
    }
    return {
      model,
      productId: product?.id ?? null,
      productName: product?.name ?? `${model} Silicone Case`,
      variants,
      totalUnits: Object.values(variants).reduce((sum, variant) => sum + variant.stockQty, 0),
    };
  });

  return {
    colors,
    rows,
    allVariants: rows.flatMap((row) => Object.values(row.variants)),
  };
}

/** Catalog order for the model filter chips. */
export const IPHONE_MODEL_ORDER = IPHONE_MODELS;
