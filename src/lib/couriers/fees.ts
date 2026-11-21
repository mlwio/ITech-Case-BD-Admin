/**
 * Pathao fee policy.
 *
 * Pathao does not charge only the delivery fee: it also keeps a COD collection
 * fee out of the cash it collects, and bills a return charge when a parcel comes
 * back. Both rates differ per merchant plan and zone, so they live here as
 * configuration (with Pathao's published defaults) and the ledger always books
 * what the policy resolves to.
 *
 *   PATHAO_COD_FEE_PERCENT     % of the collected COD Pathao keeps (default 1)
 *   PATHAO_RETURN_FEE_PERCENT  % of the delivery charge billed on a return
 *                              (default 50 — Pathao's published return charge)
 */

export interface PathaoFeePolicy {
  codFeePercent: number;
  returnFeePercent: number;
}

const DEFAULT_COD_FEE_PERCENT = 1;
const DEFAULT_RETURN_FEE_PERCENT = 50;

/** Accepts 0–100; anything else (blank, junk, out of range) falls back. */
function readPercent(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) return fallback;
  return value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function resolvePathaoFeePolicy(
  env: Record<string, string | undefined> = process.env,
): PathaoFeePolicy {
  return {
    codFeePercent: readPercent(env.PATHAO_COD_FEE_PERCENT, DEFAULT_COD_FEE_PERCENT),
    returnFeePercent: readPercent(env.PATHAO_RETURN_FEE_PERCENT, DEFAULT_RETURN_FEE_PERCENT),
  };
}

/** The COD collection fee Pathao deducts from the cash it hands over. */
export function computeCodFee(
  collectedAmount: number,
  policy: PathaoFeePolicy = resolvePathaoFeePolicy(),
): number {
  const amount = Number(collectedAmount) || 0;
  if (amount <= 0 || policy.codFeePercent <= 0) return 0;
  return round2((amount * policy.codFeePercent) / 100);
}

/**
 * The charge Pathao bills for a returned parcel, applied to the fee it reported
 * for that consignment (the order's own delivery charge when Pathao never
 * reported one).
 */
export function computeReturnFee(
  baseFee: number,
  policy: PathaoFeePolicy = resolvePathaoFeePolicy(),
): number {
  const base = Number(baseFee) || 0;
  if (base <= 0) return 0;
  return round2((base * policy.returnFeePercent) / 100);
}
