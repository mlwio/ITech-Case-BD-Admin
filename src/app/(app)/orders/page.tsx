import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { OrdersView } from "@/components/orders/orders-view";
import { Badge } from "@/components/ui/badge";
import { getAuditLogs, getOrders, getParcelTrackingEvents } from "@/lib/data";
import { computeKpis, countByStatus } from "@/lib/metrics";
import { getSessionContext } from "@/lib/session";
import { formatBDT, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

interface OrdersPageProps {
  searchParams: { q?: string; status?: string };
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const [ordersResult, auditResult, trackingResult, session] = await Promise.all([
    getOrders(),
    getAuditLogs(300),
    getParcelTrackingEvents(),
    getSessionContext(),
  ]);
  const orders = ordersResult.data;
  const source = ordersResult.source;
  const kpis = computeKpis(orders);
  const counts = countByStatus(orders);

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every order from Messenger, WhatsApp, TikTok, calls and your website in one inbox."
        actions={
          <>
            <DataSourceBadge source={source} />
            <Badge variant="warning">{formatNumber(kpis.pendingOrders)} need action</Badge>
            <Badge variant="success">{formatBDT(kpis.grossRevenue)} booked</Badge>
          </>
        }
      >
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span>{formatNumber(counts.PLACED)} placed</span>
          <span>·</span>
          <span>{formatNumber(counts.CONFIRMED)} confirmed</span>
          <span>·</span>
          <span>{formatNumber(counts.IN_TRANSIT)} in transit</span>
          <span>·</span>
          <span>{formatNumber(counts.DELIVERED)} delivered</span>
          <span>·</span>
          <span>{formatNumber(counts.RETURNED)} returned</span>
        </div>
      </PageHeader>

      <OrdersView
        orders={orders}
        auditLogs={auditResult.data}
        trackingEvents={trackingResult.data}
        performedBy={session.user.name}
        initialQuery={searchParams.q}
        initialStatus={searchParams.status}
      />
    </div>
  );
}
