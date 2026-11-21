import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { corePrisma, isDatabaseConfigured } from "@/lib/prisma";
import { ordersPrisma } from "@/lib/prisma-orders";
import { PATHAO_TO_ORDER_STATUS } from "@/lib/constants";
import { stockTransition } from "@/lib/inventory";
import { applyOrderStockMovement } from "@/lib/stock-sync";
import { clearPendingLedger, recordDeliveredLedger, recordReturnedLedger } from "@/lib/ledger";

/**
 * Pathao Courier webhook receiver.
 *
 * Pathao POSTs every parcel lifecycle update here (pickup, hub scans, delivery,
 * returns, settlement). We verify the `X-PATHAO-Signature` HMAC, persist the raw
 * delivery for auditing, then fan the update out onto the order + the immutable
 * parcel tracking timeline that renders inside the Order Drawer.
 *
 * Configure the URL (`https://yourdomain.com/api/webhooks/pathao`) and the
 * shared secret in the Courier API Hub → Webhook section.
 */

export const dynamic = "force-dynamic";

const SIGNATURE_HEADERS = ["x-pathao-signature", "x-pathaosignature", "x-signature"];
const MAX_WEBHOOK_BYTES = 32_000;

interface PathaoWebhookPayload {
  consignment_id?: string | number;
  merchant_order_id?: string | number;
  order_status?: string;
  status?: string;
  delivery_fee?: number | string;
  updated_at?: string;
  event?: string;
  message?: string;
  data?: PathaoWebhookPayload;
}

function readSignature(headers: Headers): string | null {
  for (const name of SIGNATURE_HEADERS) {
    const value = headers.get(name);
    if (value) return value.trim();
  }
  return null;
}

function verifySignature(rawBody: string, secret: string, provided: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided.replace(/^sha256=/, "").trim(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Flattens Pathao's occasional `{ data: {...} }` envelope. */
function unwrap(payload: PathaoWebhookPayload): PathaoWebhookPayload {
  return payload.data && typeof payload.data === "object" ? { ...payload, ...payload.data } : payload;
}

export async function GET() {
  if (!isDatabaseConfigured) {
    return NextResponse.json(
      { ok: false, message: "Pathao webhook is unavailable because the database is not configured." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    endpoint: "/api/webhooks/pathao",
    message: "Pathao courier webhook is live. POST lifecycle updates here.",
  });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured) {
    return NextResponse.json(
      { ok: false, message: "Pathao webhook is unavailable because the database is not configured." },
      { status: 503 },
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ ok: false, message: "Webhook payload is too large" }, { status: 413 });
  }

  const rawBody = await request.text();
  const signature = readSignature(request.headers);
  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ ok: false, message: "Webhook payload is too large" }, { status: 413 });
  }

  let secret: string | null = null;
  try {
    const credential = await corePrisma.courierCredential.findFirst({
      select: { webhookSecret: true },
    });
    secret = credential?.webhookSecret?.trim() || process.env.PATHAO_WEBHOOK_SECRET?.trim() || null;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Webhook authentication is temporarily unavailable" },
      { status: 503 },
    );
  }

  // Fail closed: without a configured secret we cannot authenticate the caller,
  // so reject the payload instead of trusting it.
  if (!secret) {
    return NextResponse.json(
      { ok: false, message: "Pathao webhook signature verification is not configured" },
      { status: 401 },
    );
  }

  if (!signature || !verifySignature(rawBody, secret, signature)) {
    return NextResponse.json(
      { ok: false, message: "Invalid Pathao webhook signature" },
      { status: 401 },
    );
  }

  let payload: PathaoWebhookPayload;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as PathaoWebhookPayload) : {};
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const event = unwrap(payload);
  const consignmentId = event.consignment_id ? String(event.consignment_id).slice(0, 120) : null;
  const merchantOrderId = event.merchant_order_id ? String(event.merchant_order_id).slice(0, 120) : null;
  const status = (event.order_status ?? event.status ?? null)?.slice(0, 80) ?? null;
  const message = typeof event.message === "string" ? event.message.slice(0, 1000) : null;

  try {
    // Only authenticated payloads are retained for audit/replay.
    await ordersPrisma.pathaoWebhookEvent.create({
      data: {
        consignmentId,
        orderId: merchantOrderId,
        status,
        signatureValid: true,
        payload: rawBody,
      },
    });

    if (!consignmentId && !merchantOrderId) {
      return NextResponse.json({ ok: true, message: "No consignment reference in payload" });
    }

    const order = await ordersPrisma.order.findFirst({
      where: {
        OR: [
          ...(consignmentId ? [{ consignmentId }] : []),
          ...(merchantOrderId ? [{ orderNumber: merchantOrderId }] : []),
        ],
      },
    });

    if (!order) {
      return NextResponse.json({ ok: true, message: "No matching order for this event" });
    }

    const occurredAt = event.updated_at ? new Date(event.updated_at) : new Date();
    const nextOrderStatus = status ? PATHAO_TO_ORDER_STATUS[status] : undefined;
    const rawFee = event.delivery_fee === undefined ? undefined : Number(event.delivery_fee);
    const deliveryFee = rawFee !== undefined && Number.isFinite(rawFee) && rawFee >= 0 ? rawFee : undefined;

    await ordersPrisma.order.update({
      where: { id: order.id },
      data: {
        ...(consignmentId ? { consignmentId } : {}),
        ...(status ? { pathaoStatus: status } : {}),
        ...(deliveryFee !== undefined ? { courierFee: deliveryFee } : {}),
        ...(nextOrderStatus ? { status: nextOrderStatus } : {}),
        ...(nextOrderStatus === "DELIVERED" ? { isPaymentSettled: true } : {}),
      },
    });

    // Only record a timeline/audit entry when the status actually changes, so
    // Pathao's at-least-once retries (a replayed duplicate payload) can never
    // spam the immutable tracking timeline. The ledger + stock effects below are
    // likewise keyed off the status transition and use idempotent upserts.
    if (status && status !== order.pathaoStatus) {
      await ordersPrisma.parcelTrackingEvent.create({
        data: {
          shopId: order.shopId,
          orderId: order.id,
          consignmentId: consignmentId ?? order.consignmentId,
          status,
          message,
          source: "PATHAO",
          occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
        },
      });

      await ordersPrisma.orderAuditLog.create({
        data: {
          shopId: order.shopId,
          orderId: order.id,
          action: "PATHAO_STATUS_SYNCED",
          details: `Pathao webhook → ${status}${message ? ` (${message})` : ""}`,
          performedBy: "Pathao Webhook",
        },
      });
    }

    // Stock + financial ledger effects implied by the new status. These are
    // best-effort: a ledger or stock hiccup must never break the webhook ack so
    // Pathao does not retry an already-persisted event.
    if (nextOrderStatus) {
      const effectiveFee = deliveryFee !== undefined ? deliveryFee : Number(order.courierFee);
      try {
        const transition = stockTransition(order.status, nextOrderStatus);
        if (transition) {
          await applyOrderStockMovement(
            order,
            transition,
            "Pathao Webhook",
            `Pathao webhook — ${order.orderNumber} ${transition.direction === "deduct" ? "deducted" : "restocked"}`,
          );
        }

        if (nextOrderStatus === "DELIVERED") {
          const items = await ordersPrisma.orderItem.findMany({
            where: { orderId: order.id },
            select: { unitCostPrice: true, quantity: true },
          });
          await recordDeliveredLedger({
            shopId: order.shopId,
            orderId: order.id,
            orderNumber: order.orderNumber,
            consignmentId: consignmentId ?? order.consignmentId,
            subtotal: Number(order.subtotal),
            discount: Number(order.discount),
            totalAmount: Number(order.totalAmount),
            courierFee: effectiveFee,
            deliveryCharge: Number(order.deliveryCharge),
            isPaymentSettled: true,
            items,
            performedBy: "Pathao Webhook",
          });
        } else if (nextOrderStatus === "RETURNED") {
          await recordReturnedLedger({
            shopId: order.shopId,
            orderId: order.id,
            orderNumber: order.orderNumber,
            consignmentId: consignmentId ?? order.consignmentId,
            courierFee: effectiveFee,
            deliveryCharge: Number(order.deliveryCharge),
            performedBy: "Pathao Webhook",
          });
        } else if (nextOrderStatus === "CANCELLED") {
          await clearPendingLedger(order.id);
        }
      } catch (ledgerError) {
        console.error("[pathao:webhook:ledger]", ledgerError);
      }
    }

    return NextResponse.json({ ok: true, orderNumber: order.orderNumber, status });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Webhook could not be persisted; Pathao can retry delivery" },
      { status: 503 },
    );
  }
}
