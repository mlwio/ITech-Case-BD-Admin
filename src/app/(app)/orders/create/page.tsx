import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { CreateOrderForm } from "@/components/orders/create-order-form";
import { getCustomers, getOrders, getProducts } from "@/lib/data";
import type { OrderHistoryEntry } from "@/lib/risk";
import { getSessionContext } from "@/lib/session";

export const metadata: Metadata = { title: "Create Order" };
export const dynamic = "force-dynamic";

function nextOrderNumber(existing: string[]): string {
  const highest = existing.reduce((max, orderNumber) => {
    const numeric = Number(orderNumber.replace(/\D/g, ""));
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
  }, 1041);
  return `ITC-${highest + 1}`;
}

export default async function CreateOrderPage() {
  const [customersResult, productsResult, ordersResult, session] = await Promise.all([
    getCustomers(),
    getProducts(),
    getOrders(),
    getSessionContext(),
  ]);

  const orders = ordersResult.data;

  // Phone/status history drives the fraud read-out and the duplicate alert.
  const orderHistory: OrderHistoryEntry[] = orders.map((order) => ({
    orderNumber: order.orderNumber,
    phone: order.customer.phone,
    status: order.status,
    placedAt: order.placedAt,
  }));

  return (
    <div>
      <PageHeader
        title="Create Order"
        description="Paste a customer message, check the risk score, then save — Pathao delivery preconfigured."
        actions={<DataSourceBadge source={productsResult.source} />}
      />
      <CreateOrderForm
        customers={customersResult.data}
        products={productsResult.data}
        orderHistory={orderHistory}
        nextOrderNumber={nextOrderNumber(orders.map((order) => order.orderNumber))}
        createdByName={session.user.name}
      />
    </div>
  );
}
