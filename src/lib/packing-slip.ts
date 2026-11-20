/**
 * Packing-slip label helpers (PART 5).
 *
 * Every surface that hands a parcel to the courier — the order detail drawer,
 * the 4×6 / 3×2 thermal stickers and the A4 packing list — renders the same
 * five fields so what the warehouse packs always matches the order:
 *
 *   Order ID : P0001
 *   Merchant Order ID : DA191126...
 *   Model : iPhone 13 Pro
 *   Cover : Silicon
 *   Colour : Gray
 *
 * The Model / Cover / Colour trio repeats once per line item. Kept as a plain
 * module (no server-only imports) so both the client drawer and the server
 * print pages can share it.
 */

import { productModel } from "@/lib/catalog-meta";

/** The shop only moulds silicone cases, so the cover label is a constant. */
export const COVER_LABEL = "Silicon";

export interface PackingSlipItem {
  /** Canonical iPhone model, e.g. "iPhone 13 Pro". */
  model: string;
  cover: string;
  colour: string;
}

export interface PackingSlipInput {
  orderNumber: string;
  /** Pathao consignment id — printed as the "Merchant Order ID". */
  consignmentId: string | null;
  items: PackingSlipItem[];
}

/** Derives the Model / Cover / Colour triple from a stored order line. */
export function slipItemFromOrderItem(item: {
  productName: string;
  variantName: string;
}): PackingSlipItem {
  return {
    model: productModel(item.productName) || item.productName,
    cover: COVER_LABEL,
    colour: item.variantName,
  };
}

/** Builds the exact slip label — one Model / Cover / Colour trio per item. */
export function packingSlipText(input: PackingSlipInput): string {
  const lines = [
    `Order ID : ${input.orderNumber}`,
    `Merchant Order ID : ${input.consignmentId || "Not booked"}`,
  ];
  for (const item of input.items) {
    lines.push(`Model : ${item.model}`);
    lines.push(`Cover : ${item.cover}`);
    lines.push(`Colour : ${item.colour}`);
  }
  return lines.join("\n");
}

/** Convenience wrapper that accepts a full order record. */
export function orderPackingSlipText(order: {
  orderNumber: string;
  consignmentId: string | null;
  items: { productName: string; variantName: string }[];
}): string {
  return packingSlipText({
    orderNumber: order.orderNumber,
    consignmentId: order.consignmentId,
    items: order.items.map(slipItemFromOrderItem),
  });
}
