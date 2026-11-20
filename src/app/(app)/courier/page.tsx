import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { CourierView } from "@/components/courier/courier-view";
import { Badge } from "@/components/ui/badge";
import { Truck } from "lucide-react";
import { getCourierCredential, getOrders, getParcelTrackingEvents, toPublicCourierCredential } from "@/lib/data";
import { getSessionContext } from "@/lib/session";

export const metadata: Metadata = { title: "Pathao Courier" };
export const dynamic = "force-dynamic";

export default async function CourierPage() {
  const [ordersResult, credentialResult, eventsResult, session] = await Promise.all([
    getOrders(),
    getCourierCredential(),
    getParcelTrackingEvents(),
    getSessionContext(),
  ]);

  const orders = ordersResult.data;
  const withConsignment = orders.filter((order) => order.consignmentId).length;

  return (
    <div>
      <PageHeader
        title="Pathao Courier"
        description="Book consignments, track live parcel states and print shipping labels — everything Pathao in one desk."
        actions={
          <>
            <DataSourceBadge source={ordersResult.source} />
            <Badge variant="secondary" className="gap-1.5">
              <Truck className="h-3.5 w-3.5" /> {withConsignment} consignments
            </Badge>
          </>
        }
      />

      <CourierView
        orders={orders}
        trackingEvents={eventsResult.data}
        credential={toPublicCourierCredential(credentialResult.data)}
        performedBy={session.user.name}
      />
    </div>
  );
}
