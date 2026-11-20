import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { AnalyticsView } from "@/components/analytics/analytics-view";
import { Badge } from "@/components/ui/badge";
import { getCustomers, getOrders } from "@/lib/data";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const [ordersResult, customersResult] = await Promise.all([getOrders(), getCustomers()]);

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Delivery zones and the products that actually move."
        actions={
          <>
            <DataSourceBadge source={ordersResult.source} />
            <Badge variant="secondary" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> {ordersResult.data.length} orders analysed
            </Badge>
          </>
        }
      />

      <AnalyticsView orders={ordersResult.data} customers={customersResult.data} />
    </div>
  );
}
