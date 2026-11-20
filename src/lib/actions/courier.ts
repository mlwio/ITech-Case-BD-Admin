"use server";

import { revalidatePath } from "next/cache";
import { corePrisma, isDatabaseConfigured } from "@/lib/prisma";
import { ordersPrisma } from "@/lib/prisma-orders";
import { getAuthSession } from "@/lib/auth/session";
import { PATHAO_TO_ORDER_STATUS } from "@/lib/constants";
import { stockTransition } from "@/lib/inventory";
import { applyOrderStockMovement } from "@/lib/stock-sync";
import {
  authorize,
  bookSingleOrder,
  type ActionResult,
  type BookingOverrides,
  type BookingResult,
} from "@/lib/couriers/book-single";
import {
  PathaoApiError,
  fetchOrderInfo,
  fetchStores,
  isCredentialConfigured,
  issueToken,
} from "@/lib/couriers/pathao";
import type { OrderStatus, ParcelTrackingEvent, PathaoEnvironment, PathaoStore } from "@/lib/types";

// Booking helpers live in a plain (non-"use server") module so they are not
// directly invocable as public Server Action endpoints. Re-exported here to
// keep the existing import surface stable.
export type { ActionResult, BookingOverrides, BookingResult } from "@/lib/couriers/book-single";

/**
 * Pathao courier server actions.
 *
 * Every action persists to the configured database. Simulated bookings and
 * tracking responses are intentionally disabled.
 */

export interface CredentialInput {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  storeId: string;
  environment: PathaoEnvironment;
  webhookSecret: string;
}

export interface TestConnectionResult extends ActionResult {
  stores?: PathaoStore[];
  expiresAt?: string | null;
}

export interface RefreshStatusResult extends ActionResult {
  status?: string;
  deliveryFee?: number;
  orderStatus?: OrderStatus;
  events?: ParcelTrackingEvent[];
}

function revalidateCourierSurfaces() {
  revalidatePath("/");
  revalidatePath("/orders");
  revalidatePath("/courier");
  revalidatePath("/couriers");
  revalidatePath("/finance");
}

/**
 * Logs the real cause server-side and returns a safe message. Pathao's own
 * validation messages are safe to surface (they describe the request, never our
 * stored secrets); anything else (a raw Prisma/Mongo error, for instance) is
 * swallowed behind a generic, non-leaking message.
 */
function safeActionMessage(context: string, error: unknown, fallback: string): string {
  if (error instanceof PathaoApiError) return error.message;
  console.error(`[courier:${context}]`, error);
  return fallback;
}

async function resolveTenancy(shopId: string) {
  const shop = await corePrisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new Error("No shop configured");
  return { shop };
}

/* -------------------------------------------------------------------------- */
/*  Configuration                                                             */
/* -------------------------------------------------------------------------- */

export async function savePathaoCredentialsAction(input: CredentialInput): Promise<ActionResult> {
  if (!isDatabaseConfigured) {
    return { ok: false, mode: "database", message: "Saving Pathao credentials requires a database connection." };
  }

  const session = await getAuthSession();
  if (!session) return { ok: false, mode: "database", message: "Sign in with an active team account." };
  if (session.role !== "OWNER") {
    return { ok: false, mode: "database", message: "Only the owner can manage Pathao credentials." };
  }

  try {
    const { shop } = await resolveTenancy(session.shopId);
    // Non-secret fields are always written; secret fields are only overwritten
    // when a new value is supplied, so the owner can edit one field without
    // re-typing — and without the browser ever holding — the saved secrets.
    const trimmedClientSecret = input.clientSecret.trim();
    const trimmedWebhookSecret = input.webhookSecret.trim();
    const data = {
      provider: "PATHAO",
      environment: input.environment,
      clientId: input.clientId.trim() || null,
      username: input.username.trim() || null,
      storeId: input.storeId.trim() || null,
      ...(trimmedClientSecret ? { clientSecret: trimmedClientSecret } : {}),
      ...(input.password ? { password: input.password } : {}),
      ...(trimmedWebhookSecret ? { webhookSecret: trimmedWebhookSecret } : {}),
    };

    await corePrisma.courierCredential.upsert({
      where: { shopId: shop.id },
      update: data,
      create: {
        shopId: shop.id,
        provider: "PATHAO",
        environment: input.environment,
        clientId: input.clientId.trim() || null,
        clientSecret: trimmedClientSecret || null,
        username: input.username.trim() || null,
        password: input.password || null,
        storeId: input.storeId.trim() || null,
        webhookSecret: trimmedWebhookSecret || null,
      },
    });

    revalidateCourierSurfaces();
    return { ok: true, mode: "database", message: "Pathao credentials saved" };
  } catch (error) {
    return {
      ok: false,
      mode: "database",
      message: safeActionMessage("save-credentials", error, "Could not save the credentials. Please try again."),
    };
  }
}

/** Issues a token, lists pickup stores and caches the tokens on success. */
export async function testPathaoConnectionAction(): Promise<TestConnectionResult> {
  if (!isDatabaseConfigured) {
    return {
      ok: false,
      mode: "database",
      message: "Testing Pathao requires a database connection.",
    };
  }

  const session = await getAuthSession();
  if (!session) return { ok: false, mode: "database", message: "Sign in with an active team account." };
  if (session.role !== "OWNER") {
    return { ok: false, mode: "database", message: "Only the owner can test Pathao credentials." };
  }

  try {
    const { shop } = await resolveTenancy(session.shopId);
    const row = await corePrisma.courierCredential.findUnique({ where: { shopId: shop.id } });

    if (!row || !isCredentialConfigured(row)) {
      return {
        ok: false,
        mode: "database",
        message: "Add your Client ID, Client Secret, merchant email and password first.",
      };
    }

    const tokens = await issueToken(row);
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

    await corePrisma.courierCredential.update({
      where: { shopId: shop.id },
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? row.refreshToken,
        accessTokenExpiresAt: expiresAt,
        lastTestedAt: new Date(),
        lastTestStatus: "SUCCESS",
        lastTestMessage: "Token issued and pickup stores synced",
      },
    });

    const stores = await fetchStores(row.environment, tokens.accessToken);

    revalidateCourierSurfaces();
    return {
      ok: true,
      mode: "database",
      message: `Connected to Pathao (${row.environment.toLowerCase()}). ${stores.length} pickup store(s) synced.`,
      stores,
      expiresAt: expiresAt.toISOString(),
    };
  } catch (error) {
    const message =
      error instanceof PathaoApiError
        ? error.message
        : "Could not reach Pathao. Check the credentials and try again.";
    if (!(error instanceof PathaoApiError)) console.error("[courier:test-connection]", error);
    if (isDatabaseConfigured) {
      const shop = await corePrisma.shop.findUnique({ where: { id: session.shopId } });
      if (shop) {
        await corePrisma.courierCredential
          .update({
            where: { shopId: shop.id },
            data: {
              lastTestedAt: new Date(),
              lastTestStatus: "FAILED",
              lastTestMessage: message,
            },
          })
          .catch(() => undefined);
      }
    }
    return { ok: false, mode: "database", message };
  }
}

export async function selectPickupStoreAction(storeId: string, storeName: string): Promise<ActionResult> {
  if (!isDatabaseConfigured) {
    return { ok: false, mode: "database", message: "Selecting a pickup store requires a database connection." };
  }

  const session = await getAuthSession();
  if (!session) return { ok: false, mode: "database", message: "Sign in with an active team account." };
  if (session.role !== "OWNER") {
    return { ok: false, mode: "database", message: "Only the owner can select a Pathao pickup store." };
  }

  try {
    const { shop } = await resolveTenancy(session.shopId);
    await corePrisma.courierCredential.update({
      where: { shopId: shop.id },
      data: { storeId, pickupStoreId: storeId, pickupStoreName: storeName || storeId },
    });
    revalidateCourierSurfaces();
    return { ok: true, mode: "database", message: `${storeName || storeId} is now your active pickup store` };
  } catch (error) {
    return {
      ok: false,
      mode: "database",
      message: safeActionMessage("select-store", error, "Could not select the pickup store. Please try again."),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Booking                                                                   */
/* -------------------------------------------------------------------------- */

export async function bookPathaoOrderAction(
  orderId: string,
  performedBy: string,
  overrides: BookingOverrides = {},
): Promise<BookingResult> {
  if (!isDatabaseConfigured) {
    return {
      ok: false,
      mode: "database",
      message: "Pathao booking requires a database connection.",
    };
  }

  const session = await getAuthSession();
  if (!session) return { ok: false, mode: "database", message: "Sign in with an active team account." };
  if (!session.permissions.orders) {
    return { ok: false, mode: "database", message: "You do not have permission to book orders." };
  }

  const result = await bookSingleOrder(orderId, performedBy, overrides);
  if (result.ok || result.orderNumber) revalidateCourierSurfaces();
  return result;
}

export async function bulkBookPathaoOrdersAction(
  orderIds: string[],
  performedBy: string,
): Promise<BookingResult> {
  if (orderIds.length === 0) return { ok: false, mode: "database", message: "No orders selected" };

  if (!isDatabaseConfigured) {
    return {
      ok: false,
      mode: "database",
      message: "Pathao booking requires a database connection.",
    };
  }

  const session = await getAuthSession();
  if (!session) return { ok: false, mode: "database", message: "Sign in with an active team account." };
  if (!session.permissions.orders) {
    return { ok: false, mode: "database", message: "You do not have permission to book orders." };
  }

  let booked = 0;
  const failures: string[] = [];

  for (const orderId of orderIds) {
    const result = await bookSingleOrder(orderId, performedBy);
    if (result.ok) booked += 1;
    else failures.push(result.orderNumber ? `${result.orderNumber}: ${result.message}` : result.message);
  }

  revalidateCourierSurfaces();

  if (booked === 0) {
    return { ok: false, mode: "database", message: failures[0] ?? "No consignments could be booked" };
  }

  return {
    ok: failures.length === 0,
    mode: "database",
    message:
      failures.length === 0
        ? `${booked} consignment(s) booked with Pathao`
        : `${booked} booked, ${failures.length} failed — ${failures[0]}`,
    pathaoStatus: "Pickup_Requested",
  };
}

/* -------------------------------------------------------------------------- */
/*  Live status                                                               */
/* -------------------------------------------------------------------------- */

export async function refreshPathaoStatusAction(
  orderId: string,
  performedBy: string,
  _currentStatus?: string,
): Promise<RefreshStatusResult> {
  if (!isDatabaseConfigured) {
    return { ok: false, mode: "database", message: "Refreshing parcel status requires a database connection." };
  }

  const session = await getAuthSession();
  if (!session) return { ok: false, mode: "database", message: "Sign in with an active team account." };
  if (!session.permissions.orders) {
    return { ok: false, mode: "database", message: "You do not have permission to refresh parcel status." };
  }

  try {
    const order = await ordersPrisma.order.findUnique({ where: { id: orderId } });
    if (!order) return { ok: false, mode: "database", message: "Order not found" };
    if (order.shopId !== session.shopId) {
      return { ok: false, mode: "database", message: "Order not found" };
    }
    if (!order.consignmentId) {
      return { ok: false, mode: "database", message: `${order.orderNumber} has no consignment yet` };
    }

    const auth = await authorize(order.shopId);
    if (!auth.ok) return { ok: false, mode: "database", message: auth.message };

    const info = await fetchOrderInfo(auth.credential.environment, auth.credential.accessToken, order.consignmentId);
    const nextOrderStatus = PATHAO_TO_ORDER_STATUS[info.status] ?? order.status;
    const isSettled = nextOrderStatus === "DELIVERED";
    const transition = stockTransition(order.status, nextOrderStatus);

    // Claim the status transition with a conditional write: it only succeeds
    // while the order is still in the status we just read, so a repeated
    // refresh (or a webhook racing it) can never apply the stock move twice.
    const claimed = await ordersPrisma.order.updateMany({
      where: { id: order.id, shopId: session.shopId, status: order.status },
      data: {
        pathaoStatus: info.status,
        ...(info.deliveryFee > 0 ? { courierFee: info.deliveryFee } : {}),
        status: nextOrderStatus,
        ...(isSettled ? { isPaymentSettled: true } : {}),
      },
    });

    // Auto stock engine: restock on a return/cancel, deduct on confirm/transit.
    // Only when we won the claim — so an already-RETURNED order never
    // double-adds stock, no matter how many times the sync is clicked.
    if (claimed.count === 1 && transition) {
      try {
        await applyOrderStockMovement(
          order,
          transition,
          performedBy,
          `Pathao sync — ${order.orderNumber} ${transition.direction === "deduct" ? "deducted" : "restocked"}`,
        );
      } catch (stockError) {
        console.error("[courier:stock-sync]", stockError);
      }
    }

    if (info.status !== order.pathaoStatus) {
      await ordersPrisma.parcelTrackingEvent.create({
        data: {
          shopId: order.shopId,
          orderId: order.id,
          consignmentId: order.consignmentId,
          status: info.status,
          message: "Pulled from Pathao on demand",
          source: "MANUAL_SYNC",
        },
      });

      await ordersPrisma.orderAuditLog.create({
        data: {
          shopId: order.shopId,
          orderId: order.id,
          action: "PATHAO_STATUS_SYNCED",
          details: `Pathao status synced → ${info.status}`,
          performedBy,
        },
      });
    }

    const events = await ordersPrisma.parcelTrackingEvent.findMany({
      where: { orderId: order.id },
      orderBy: { occurredAt: "asc" },
    });

    revalidateCourierSurfaces();
    return {
      ok: true,
      mode: "database",
      message: `Live status: ${info.status.replace(/_/g, " ")}`,
      status: info.status,
      deliveryFee: info.deliveryFee,
      orderStatus: nextOrderStatus,
      events: events.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        consignmentId: row.consignmentId,
        status: row.status,
        message: row.message,
        source: row.source,
        occurredAt: row.occurredAt.toISOString(),
      })),
    };
  } catch (error) {
    return {
      ok: false,
      mode: "database",
      message: safeActionMessage("refresh-status", error, "Could not refresh the parcel status. Please try again."),
    };
  }
}
