import { corePrisma, isDatabaseConfigured } from "@/lib/prisma";
import { ordersPrisma } from "@/lib/prisma-orders";
import { customersPrisma } from "@/lib/prisma-customers";
import { getAuthSession } from "@/lib/auth/session";
import { PATHAO_DEFAULT_ITEM_WEIGHT } from "@/lib/constants";
import { pathaoItemDescription } from "@/lib/catalog-meta";
import { matchPathaoLocation } from "@/lib/couriers/pathao-locations";
import {
  PathaoApiError,
  createPathaoOrder,
  isCredentialConfigured,
  isValidPhoneBD,
  issueToken,
  normalizePhoneBD,
} from "@/lib/couriers/pathao";
import type { PathaoEnvironment } from "@/lib/types";

/**
 * Internal Pathao booking kernel.
 *
 * This module is deliberately NOT marked `"use server"`. `bookSingleOrder` is a
 * privileged operation, so it lives here as a plain server-only helper and is
 * imported by the public server actions in `@/lib/actions/courier` and
 * `@/lib/actions/orders`. Because it is not an exported server action it can
 * never be invoked on its own as a public Next.js Server Action endpoint — the
 * only way to reach it is through those wrappers, which enforce auth + RBAC,
 * and `bookSingleOrder` re-checks the session itself.
 */

export interface ActionResult {
  ok: boolean;
  mode: "database";
  message: string;
}

/** Manual overrides applied on top of the auto-mapped address. */
export interface BookingOverrides {
  cityId?: number;
  zoneId?: number;
  areaId?: number;
  weight?: number;
  quantity?: number;
  address?: string;
  phone?: string;
  storeId?: string;
}

export interface BookingResult extends ActionResult {
  consignmentId?: string;
  deliveryFee?: number;
  pathaoStatus?: string;
  orderNumber?: string;
  fieldErrors?: Record<string, string[]>;
}

/** Reads the stored credential row and refreshes the access token if needed. */
export async function authorize(shopId: string): Promise<
  | { ok: true; credential: { environment: PathaoEnvironment; storeId: string | null; accessToken: string } }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> }
> {
  const row = await corePrisma.courierCredential.findUnique({ where: { shopId } });
  if (!row || !isCredentialConfigured(row)) {
    return {
      ok: false,
      message: "Pathao is not connected yet — add your Client ID, Secret and merchant login in the Courier API Hub.",
    };
  }

  const environment = row.environment;

  // Reuse the cached token while it is still valid; otherwise issue a fresh one.
  const stillValid =
    row.accessToken &&
    row.accessTokenExpiresAt &&
    row.accessTokenExpiresAt.getTime() - Date.now() > 60_000;

  if (stillValid && row.accessToken) {
    return { ok: true, credential: { environment, storeId: row.storeId, accessToken: row.accessToken } };
  }

  try {
    const tokens = await issueToken(row);
    await corePrisma.courierCredential.update({
      where: { shopId },
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? row.refreshToken,
        accessTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      },
    });
    return { ok: true, credential: { environment, storeId: row.storeId, accessToken: tokens.accessToken } };
  } catch (error) {
    const apiError = error as PathaoApiError;
    return { ok: false, message: apiError.message, fieldErrors: apiError.fieldErrors };
  }
}

/**
 * Books a single order with Pathao and advances it to IN_TRANSIT.
 * Authorization is enforced here as well as in the UI-facing wrappers because
 * this helper is imported by multiple server actions.
 */
export async function bookSingleOrder(
  orderId: string,
  _performedBy: string,
  overrides: BookingOverrides = {},
): Promise<BookingResult> {
  if (!isDatabaseConfigured) {
    return { ok: false, mode: "database", message: "Pathao booking requires a database connection." };
  }

  const session = await getAuthSession();
  if (!session || !session.permissions.orders) {
    return { ok: false, mode: "database", message: "You do not have permission to book orders." };
  }

  let order;
  try {
    order = await ordersPrisma.order.findUnique({ where: { id: orderId } });
  } catch {
    return { ok: false, mode: "database", message: "Could not load this order for Pathao booking." };
  }
  if (!order) return { ok: false, mode: "database", message: "Order not found" };

  let items;
  let customer;
  try {
    [items, customer] = await Promise.all([
      ordersPrisma.orderItem.findMany({ where: { orderId: order.id } }),
      order.customerId
        ? customersPrisma.customer.findUnique({ where: { id: order.customerId } })
        : Promise.resolve(null),
    ]);
  } catch {
    return { ok: false, mode: "database", message: "Could not load this order for Pathao booking." };
  }
  if (!customer) return { ok: false, mode: "database", message: "Order not found" };
  if (order.shopId !== session.shopId) {
    return { ok: false, mode: "database", message: "Order not found" };
  }
  if (order.consignmentId) {
    return {
      ok: false,
      mode: "database",
      message: `${order.orderNumber} is already booked (${order.consignmentId})`,
      orderNumber: order.orderNumber,
    };
  }
  if (order.status !== "CONFIRMED") {
    return {
      ok: false,
      mode: "database",
      message: `${order.orderNumber} must be Confirmed before booking`,
      orderNumber: order.orderNumber,
    };
  }

  let auth;
  try {
    auth = await authorize(order.shopId);
  } catch {
    return { ok: false, mode: "database", message: "Could not load Pathao credentials. Please retry." };
  }
  if (!auth.ok) return { ok: false, mode: "database", message: auth.message, fieldErrors: auth.fieldErrors };

  const storeId = overrides.storeId ?? auth.credential.storeId;
  if (!storeId) {
    return {
      ok: false,
      mode: "database",
      message: "No pickup store selected. Choose your store in the Courier API Hub.",
    };
  }

  const phone = normalizePhoneBD(overrides.phone ?? customer.phone);
  if (!isValidPhoneBD(phone)) {
    return {
      ok: false,
      mode: "database",
      message: `“${customer.phone}” is not a valid mobile number. Pathao expects 11 digits (01XXXXXXXXX).`,
      orderNumber: order.orderNumber,
      fieldErrors: { recipient_phone: ["Invalid phone format — use 01XXXXXXXXX"] },
    };
  }

  const address = overrides.address?.trim() || customer.address;
  const match = matchPathaoLocation(address, order.deliveryZone);
  const cityId = overrides.cityId ?? match.cityId;
  const zoneId = overrides.zoneId ?? match.zoneId;

  if (!cityId || !zoneId) {
    return {
      ok: false,
      mode: "database",
      message: "Could not map the delivery city/zone. Pick them manually and retry.",
      orderNumber: order.orderNumber,
    };
  }

  const quantity =
    overrides.quantity ??
    (items.reduce((sum, item) => sum + item.quantity, 0) || 1);

  try {
    const booking = await createPathaoOrder(auth.credential.environment, auth.credential.accessToken, {
      storeId,
      merchantOrderId: order.orderNumber,
      recipientName: customer.name,
      recipientPhone: phone,
      recipientAddress: address,
      recipientCity: cityId,
      recipientZone: zoneId,
      itemQuantity: quantity,
      itemWeight: overrides.weight ?? PATHAO_DEFAULT_ITEM_WEIGHT,
      amountToCollect: Math.round(Number(order.totalAmount)),
      itemDescription: pathaoItemDescription(items),
      specialInstruction: order.note ?? undefined,
    });

    await ordersPrisma.order.update({
      where: { id: order.id },
      data: {
        status: "IN_TRANSIT",
        consignmentId: booking.consignmentId,
        pathaoStatus: booking.pathaoStatus,
        courierFee: booking.deliveryFee,
      },
    });

    await ordersPrisma.parcelTrackingEvent.create({
      data: {
        shopId: order.shopId,
        orderId: order.id,
        consignmentId: booking.consignmentId,
        status: booking.pathaoStatus,
        message: `Booked via Pathao (${match.cityName} · ${match.zoneName})`,
        source: "MERCHANT",
      },
    });

    await ordersPrisma.orderAuditLog.create({
      data: {
        shopId: order.shopId,
        orderId: order.id,
        action: "PATHAO_CONSIGNMENT_CREATED",
        details: `Consignment ${booking.consignmentId} booked with Pathao — ${match.cityName}/${match.zoneName}, fee ৳${booking.deliveryFee}`,
        performedBy: session.name || "Team member",
      },
    });

    return {
      ok: true,
      mode: "database",
      message: `${order.orderNumber} booked — consignment ${booking.consignmentId}`,
      consignmentId: booking.consignmentId,
      deliveryFee: booking.deliveryFee,
      pathaoStatus: booking.pathaoStatus,
      orderNumber: order.orderNumber,
    };
  } catch (error) {
    const apiError = error as PathaoApiError;
    return {
      ok: false,
      mode: "database",
      message: apiError.message,
      orderNumber: order.orderNumber,
      fieldErrors: apiError.fieldErrors,
    };
  }
}
