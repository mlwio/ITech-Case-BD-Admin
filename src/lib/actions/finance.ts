"use server";

import { revalidatePath } from "next/cache";
import { corePrisma, isDatabaseConfigured } from "@/lib/prisma";
import { ordersPrisma } from "@/lib/prisma-orders";
import { getAuthSession } from "@/lib/auth/session";
import { isHexObjectId } from "@/lib/security/validate";
import type { ExpenseCategory } from "@/lib/types";

/**
 * Finance server actions.
 *
 * Expenses and the COD/financial ledger live in Database 3 (`corePrisma`);
 * marking an entry collected also flips `isPaymentSettled` on the order, which
 * lives in Database 1 (`ordersPrisma`).
 */

export interface ExpenseActionResult {
  ok: boolean;
  mode: "database";
  message: string;
  id?: string;
}

export interface LedgerActionResult {
  ok: boolean;
  mode: "database";
  message: string;
  /** Number of ledger rows updated. */
  updated?: number;
}

export interface CreateExpenseInput {
  category: ExpenseCategory;
  amountBdt: number;
  note: string;
}

function revalidateFinance() {
  revalidatePath("/finance");
  revalidatePath("/");
}

function revalidateSettlement() {
  revalidatePath("/finance");
  revalidatePath("/orders");
  revalidatePath("/");
}

/** Owner or a moderator with the finance permission. */
async function requireFinanceSession() {
  const session = await getAuthSession();
  if (!session) return null;
  if (session.role !== "OWNER" && !session.permissions.finance) return null;
  return session;
}

export async function createExpenseAction(input: CreateExpenseInput): Promise<ExpenseActionResult> {
  if (!Number.isFinite(input.amountBdt) || input.amountBdt <= 0) {
    return { ok: false, mode: "database", message: "Enter a valid amount" };
  }

  if (!isDatabaseConfigured) {
    return {
      ok: false,
      mode: "database",
      message: "Expense recording requires a database connection.",
    };
  }

  try {
    const session = await requireFinanceSession();
    if (!session) {
      return { ok: false, mode: "database", message: "You do not have permission to record expenses." };
    }

    const shop = await corePrisma.shop.findUnique({ where: { id: session.shopId } });
    if (!shop) {
      return { ok: false, mode: "database", message: "No shop configured" };
    }

    const row = await corePrisma.expense.create({
      data: {
        shopId: shop.id,
        category: input.category,
        amountBdt: input.amountBdt,
        note: input.note,
        createdById: session.userId,
      },
    });

    revalidateFinance();
    return { ok: true, mode: "database", message: "Expense recorded", id: row.id };
  } catch (error) {
    // Log the real cause server-side; never leak internals to the client.
    console.error("[finance]", error);
    return { ok: false, mode: "database", message: "Could not complete the finance operation. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  COD settlement — mark courier cash as received                            */
/* -------------------------------------------------------------------------- */

/**
 * Marks a single financial-ledger row as `COLLECTED`, stamping who received the
 * cash and when, then syncs `isPaymentSettled` back onto the order.
 */
export async function markLedgerCollectedAction(
  ledgerId: string,
  performedBy: string,
): Promise<LedgerActionResult> {
  if (!isHexObjectId(ledgerId)) {
    return { ok: false, mode: "database", message: "Invalid ledger entry." };
  }
  if (!isDatabaseConfigured) {
    return { ok: false, mode: "database", message: "COD settlement requires a database connection." };
  }

  const session = await requireFinanceSession();
  if (!session) {
    return { ok: false, mode: "database", message: "You do not have permission to settle COD." };
  }

  try {
    const entry = await corePrisma.financialLedger.findFirst({
      where: { id: ledgerId, shopId: session.shopId },
    });
    if (!entry) {
      return { ok: false, mode: "database", message: "Ledger entry not found." };
    }

    const actor = session.name || performedBy || "Team member";
    await corePrisma.financialLedger.update({
      where: { id: entry.id },
      data: { collectionStatus: "COLLECTED", collectedAt: new Date(), collectedBy: actor },
    });

    if (entry.orderId && isHexObjectId(entry.orderId)) {
      await ordersPrisma.order.updateMany({
        where: { id: entry.orderId, shopId: session.shopId },
        data: { isPaymentSettled: true },
      });
    }

    revalidateSettlement();
    return { ok: true, mode: "database", message: "COD marked as collected.", updated: 1 };
  } catch (error) {
    // Log the real cause server-side; never leak internals to the client.
    console.error("[finance]", error);
    return { ok: false, mode: "database", message: "Could not complete the finance operation. Please try again." };
  }
}

/**
 * Marks every supplied *pending* ledger row as `COLLECTED` in one shot — the
 * "settle today's courier cash" batch action.
 */
export async function bulkMarkCollectedAction(
  ledgerIds: string[],
  performedBy: string,
): Promise<LedgerActionResult> {
  const ids = ledgerIds.filter(isHexObjectId);
  if (ids.length === 0) {
    return { ok: false, mode: "database", message: "Select at least one pending COD entry." };
  }
  if (!isDatabaseConfigured) {
    return { ok: false, mode: "database", message: "COD settlement requires a database connection." };
  }

  const session = await requireFinanceSession();
  if (!session) {
    return { ok: false, mode: "database", message: "You do not have permission to settle COD." };
  }

  try {
    const entries = await corePrisma.financialLedger.findMany({
      where: { id: { in: ids }, shopId: session.shopId, collectionStatus: "PENDING" },
    });
    if (entries.length === 0) {
      return { ok: false, mode: "database", message: "No pending COD entries matched." };
    }

    const actor = session.name || performedBy || "Team member";
    await corePrisma.financialLedger.updateMany({
      where: { id: { in: entries.map((entry) => entry.id) } },
      data: { collectionStatus: "COLLECTED", collectedAt: new Date(), collectedBy: actor },
    });

    const orderIds = entries
      .map((entry) => entry.orderId)
      .filter((id): id is string => Boolean(id) && isHexObjectId(id));
    if (orderIds.length > 0) {
      await ordersPrisma.order.updateMany({
        where: { id: { in: orderIds }, shopId: session.shopId },
        data: { isPaymentSettled: true },
      });
    }

    revalidateSettlement();
    return {
      ok: true,
      mode: "database",
      message: `${entries.length} COD ${entries.length === 1 ? "entry" : "entries"} marked collected.`,
      updated: entries.length,
    };
  } catch (error) {
    // Log the real cause server-side; never leak internals to the client.
    console.error("[finance]", error);
    return { ok: false, mode: "database", message: "Could not complete the finance operation. Please try again." };
  }
}
