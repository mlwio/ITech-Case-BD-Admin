import type { Metadata } from "next";
import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { deliveryZoneLabel } from "@/lib/constants";
import { getOrders, getShop } from "@/lib/data";
import { formatBDT, formatDate, formatNumber, formatPhone } from "@/lib/format";
import { orderPackingSlipText } from "@/lib/packing-slip";
import type { Order } from "@/lib/types";

export const metadata: Metadata = { title: "A4 Warehouse Packing List" };
export const dynamic = "force-dynamic";

interface PackingGroup {
  key: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  orderNumbers: string[];
}

function parseIds(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : value ?? "";
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export default async function PackingListPrintPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const ids = parseIds(searchParams.ids);

  const [ordersResult, shopResult] = await Promise.all([getOrders(), getShop()]);
  const byId = new Map(ordersResult.data.map((order) => [order.id, order]));
  const orders = ids.map((id) => byId.get(id)).filter((order): order is Order => Boolean(order));
  const shopName = shopResult.data.name || "ITech Case BD";

  // Group every selected order's line items by Phone Model + Colour SKU so the
  // warehouse can pack all units of a SKU in one sweep.
  const groupMap = new Map<string, PackingGroup>();
  for (const order of orders) {
    for (const item of order.items) {
      const key = `${item.productName}||${item.variantName}||${item.sku}`;
      const group =
        groupMap.get(key) ??
        ({
          key,
          productName: item.productName,
          variantName: item.variantName,
          sku: item.sku,
          quantity: 0,
          orderNumbers: [],
        } satisfies PackingGroup);
      group.quantity += item.quantity;
      group.orderNumbers.push(order.orderNumber);
      groupMap.set(key, group);
    }
  }

  const groups = Array.from(groupMap.values()).sort(
    (a, b) =>
      a.productName.localeCompare(b.productName) || a.variantName.localeCompare(b.variantName),
  );

  const totalUnits = groups.reduce((sum, group) => sum + group.quantity, 0);
  const totalCod = orders.reduce((sum, order) => sum + order.totalAmount, 0);

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: "@page { size: A4; margin: 10mm; }" }} />

      <PrintToolbar title={`Packing list · ${orders.length} orders`} backHref="/courier" />

      {orders.length === 0 ? (
        <div className="no-print mx-auto max-w-md p-10 text-center">
          <PackageCheck className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-base font-semibold">Nothing to pack</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Select confirmed orders on the courier desk and print a packing list.
          </p>
          <Link
            href="/courier"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            Back to Pathao Courier
          </Link>
        </div>
      ) : (
        <div className="print-page mx-auto w-[210mm] max-w-full bg-white p-8 text-black">
          <header className="flex items-start justify-between border-b-2 border-black pb-3">
            <div>
              <p className="text-2xl font-extrabold tracking-tight">{shopName}</p>
              <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.2em] text-neutral-600">
                A4 Warehouse Packing Summary
              </p>
            </div>
            <div className="text-right text-xs leading-tight text-neutral-600">
              <p className="font-semibold text-black">Generated {formatDate(new Date())}</p>
              <p>{formatNumber(orders.length)} orders · {formatNumber(totalUnits)} units</p>
              <p>{formatNumber(groups.length)} SKU groups</p>
            </div>
          </header>

          <section className="mt-4 grid grid-cols-3 gap-3">
            <SummaryTile label="Orders to pack" value={formatNumber(orders.length)} />
            <SummaryTile label="Total units" value={formatNumber(totalUnits)} />
            <SummaryTile label="COD value" value={formatBDT(totalCod)} />
          </section>

          <section className="mt-5">
            <h2 className="text-sm font-bold uppercase tracking-wide">Pack by SKU</h2>
            <p className="mb-2 text-[11px] text-neutral-500">
              Grouped by phone model &amp; colour so staff can grab every unit of a SKU at once.
            </p>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-y border-black bg-neutral-100 text-left">
                  <th className="px-2 py-1.5 font-semibold">Phone model</th>
                  <th className="px-2 py-1.5 font-semibold">Colour / variant</th>
                  <th className="px-2 py-1.5 font-semibold">SKU</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Qty</th>
                  <th className="px-2 py-1.5 font-semibold">Orders</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.key} className="print-avoid-break border-b border-neutral-300">
                    <td className="px-2 py-1.5 font-medium">{group.productName}</td>
                    <td className="px-2 py-1.5">{group.variantName}</td>
                    <td className="px-2 py-1.5 font-mono text-[11px]">{group.sku}</td>
                    <td className="px-2 py-1.5 text-right text-sm font-bold tabular">
                      {group.quantity}
                    </td>
                    <td className="px-2 py-1.5 text-[11px] text-neutral-600">
                      {Array.from(new Set(group.orderNumbers)).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-y-2 border-black font-bold">
                  <td className="px-2 py-1.5" colSpan={3}>
                    Total
                  </td>
                  <td className="px-2 py-1.5 text-right tabular">{totalUnits}</td>
                  <td className="px-2 py-1.5" />
                </tr>
              </tfoot>
            </table>
          </section>

          <section className="mt-5">
            <h2 className="text-sm font-bold uppercase tracking-wide">Order checklist</h2>
            <table className="mt-2 w-full border-collapse text-xs">
              <thead>
                <tr className="border-y border-black bg-neutral-100 text-left">
                  <th className="px-2 py-1.5 font-semibold">Order</th>
                  <th className="px-2 py-1.5 font-semibold">Customer</th>
                  <th className="px-2 py-1.5 font-semibold">Phone</th>
                  <th className="px-2 py-1.5 font-semibold">Zone</th>
                  <th className="px-2 py-1.5 font-semibold">Items</th>
                  <th className="px-2 py-1.5 text-right font-semibold">COD</th>
                  <th className="px-2 py-1.5 text-center font-semibold">Packed</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="print-avoid-break border-b border-neutral-300">
                    <td className="px-2 py-1.5 font-medium">{order.orderNumber}</td>
                    <td className="px-2 py-1.5">{order.customer.name}</td>
                    <td className="px-2 py-1.5">{formatPhone(order.customer.phone)}</td>
                    <td className="px-2 py-1.5 text-[11px]">
                      {deliveryZoneLabel(order.deliveryZone, order.deliveryCharge)}
                    </td>
                    <td className="px-2 py-1.5">
                      {order.items
                        .map((item) => `${item.variantName} ×${item.quantity}`)
                        .join(" · ")}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular">
                      {formatBDT(order.totalAmount)}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className="inline-block h-4 w-4 rounded border border-black" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-5">
            <h2 className="text-sm font-bold uppercase tracking-wide">Packing slips</h2>
            <p className="mb-2 text-[11px] text-neutral-500">
              One slip per parcel — Order ID, Pathao Merchant Order ID and the exact Model / Cover /
              Colour to pack.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {orders.map((order) => (
                <pre
                  key={order.id}
                  className="print-avoid-break whitespace-pre-wrap rounded-md border border-neutral-300 p-2 font-mono text-[11px] leading-snug"
                >
                  {orderPackingSlipText(order)}
                </pre>
              ))}
            </div>
          </section>

          <footer className="mt-6 flex items-center justify-between border-t border-neutral-300 pt-2 text-[10px] text-neutral-500">
            <span>{shopName} · Pathao Courier fulfilment</span>
            <span>Packed by ____________ · Checked by ____________</span>
          </footer>
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-300 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular">{value}</p>
    </div>
  );
}
