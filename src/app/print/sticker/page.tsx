import type { Metadata } from "next";
import Link from "next/link";
import { Printer } from "lucide-react";
import { Barcode } from "@/components/courier/barcode";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { deliveryZoneLabel } from "@/lib/constants";
import { getOrders, getShop } from "@/lib/data";
import { formatBDT, formatDate, formatPhone } from "@/lib/format";
import { orderPackingSlipText } from "@/lib/packing-slip";
import type { Order } from "@/lib/types";

export const metadata: Metadata = { title: "Thermal Shipping Stickers" };
export const dynamic = "force-dynamic";

const STICKER_SIZES = [
  { value: "4x6", label: "4 × 6 in" },
  { value: "3x2", label: "3 × 2 in" },
] as const;

type StickerSize = (typeof STICKER_SIZES)[number]["value"];

const PAGE_SIZE: Record<StickerSize, string> = {
  "4x6": "4in 6in",
  "3x2": "3in 2in",
};

function parseIds(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : value ?? "";
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export default async function StickerPrintPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const ids = parseIds(searchParams.ids);
  const size: StickerSize = searchParams.size === "3x2" ? "3x2" : "4x6";
  const autoprint = searchParams.autoprint === "1";

  const [ordersResult, shopResult] = await Promise.all([getOrders(), getShop()]);
  const byId = new Map(ordersResult.data.map((order) => [order.id, order]));
  const orders = ids.map((id) => byId.get(id)).filter((order): order is Order => Boolean(order));
  const shopName = shopResult.data.name || "ITech Case BD";

  const sizeHref = (next: string) => {
    const query = new URLSearchParams();
    if (ids.length) query.set("ids", ids.join(","));
    query.set("size", next);
    return `/print/sticker?${query.toString()}`;
  };

  // Prebuilt hrefs — plain data, since `PrintToolbar` is a client component.
  const sizeHrefs = Object.fromEntries(STICKER_SIZES.map((option) => [option.value, sizeHref(option.value)]));

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: `@page { size: ${PAGE_SIZE[size]}; margin: 0; }` }} />

      <PrintToolbar
        title={`Thermal stickers · ${orders.length}`}
        backHref="/courier"
        sizes={STICKER_SIZES.map((option) => ({ value: option.value, label: option.label }))}
        activeSize={size}
        sizeHrefs={sizeHrefs}
        autoprint={autoprint}
      />

      {orders.length === 0 ? (
        <div className="no-print mx-auto max-w-md p-10 text-center">
          <Printer className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-base font-semibold">No parcels to print</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick consignments from the courier desk and hit “Print stickers”.
          </p>
          <Link
            href="/courier"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            Back to Pathao Courier
          </Link>
        </div>
      ) : (
        <div className={size === "4x6" ? "space-y-4 p-4" : "space-y-3 p-4"}>
          {orders.map((order) =>
            size === "4x6" ? (
              <StickerLarge key={order.id} order={order} shopName={shopName} />
            ) : (
              <StickerCompact key={order.id} order={order} shopName={shopName} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function consignmentOf(order: Order): string {
  return order.consignmentId ?? `PA-${order.orderNumber}`;
}

function zoneLabelOf(order: Order): string {
  return deliveryZoneLabel(order.deliveryZone, order.deliveryCharge);
}

/** 4 × 6 in thermal label — the full-fidelity warehouse sticker. */
function StickerLarge({ order, shopName }: { order: Order; shopName: string }) {
  const consignment = consignmentOf(order);
  const totalQty = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="sticker-page print-surface mx-auto flex h-[6in] w-[4in] flex-col gap-2 border border-neutral-300 bg-white p-3 text-black">
      <header className="flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <p className="text-xl font-extrabold leading-none tracking-tight">{shopName}</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-600">
            Pathao Courier · COD Parcel
          </p>
        </div>
        <div className="text-right text-[10px] leading-tight">
          <p className="font-bold">{order.orderNumber}</p>
          <p className="text-neutral-500">{formatDate(order.placedAt)}</p>
        </div>
      </header>

      <div className="py-1">
        <Barcode value={consignment} height={70} showValue={false} />
        <p className="mt-1.5 text-center font-mono text-base font-bold tracking-[0.22em]">{consignment}</p>
      </div>

      <div className="flex items-center justify-between rounded-md border-2 border-black px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wide">Cash on Delivery</span>
        <span className="text-2xl font-extrabold tabular">{formatBDT(order.totalAmount)}</span>
      </div>

      <div className="flex-1 space-y-1 border-t border-dashed border-neutral-400 pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Deliver To</p>
        <p className="text-lg font-bold leading-tight">{order.customer.name}</p>
        <p className="text-base font-semibold">{formatPhone(order.customer.phone)}</p>
        <p className="text-sm leading-snug">{order.customer.address}</p>
        <p className="text-[11px] font-medium text-neutral-600">{zoneLabelOf(order)}</p>
      </div>

      <div className="border-t border-dashed border-neutral-400 pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Packing slip · {totalQty} item{totalQty > 1 ? "s" : ""}
        </p>
        <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] leading-snug">
          {orderPackingSlipText(order)}
        </pre>
      </div>

      <footer className="flex items-center justify-between border-t-2 border-black pt-1.5 text-[10px] text-neutral-600">
        <span>Weight 0.5 kg · Item type 2</span>
        <span className="font-medium">Pathao pickup label</span>
      </footer>
    </div>
  );
}

/** 3 × 2 in roll label — the compact sticker for high-volume packing. */
function StickerCompact({ order, shopName }: { order: Order; shopName: string }) {
  const consignment = consignmentOf(order);
  const totalQty = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="sticker-page print-surface mx-auto flex h-[2in] w-[3in] flex-col justify-between border border-neutral-300 bg-white px-2 py-1 text-black">
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-[11px] font-extrabold tracking-tight">{shopName}</span>
        <span className="shrink-0 rounded border border-black px-1 text-[10px] font-extrabold tabular">
          COD {formatBDT(order.totalAmount)} · ×{totalQty}
        </span>
      </div>

      <Barcode value={consignment} height={26} showValue={false} />
      <p className="-mt-1 text-center font-mono text-[9px] font-bold tracking-[0.16em]">{consignment}</p>

      <div className="text-[8px] leading-tight">
        <p className="text-[10px] font-bold">
          {order.customer.name} · {formatPhone(order.customer.phone)}
        </p>
        <p className="line-clamp-1 text-neutral-700">{order.customer.address}</p>
        <pre className="mt-0.5 whitespace-pre-wrap font-mono text-[7px] leading-[1.15] text-neutral-800">
          {orderPackingSlipText(order)}
        </pre>
      </div>
    </div>
  );
}
