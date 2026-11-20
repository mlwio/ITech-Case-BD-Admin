import type { Metadata } from "next";
import { PlugZap } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { Badge } from "@/components/ui/badge";
import { CourierConfigView } from "@/components/courier/courier-config-view";
import { getCourierCredential, getOrders, getShop, toPublicCourierCredential } from "@/lib/data";

export const metadata: Metadata = { title: "Courier API Hub" };
export const dynamic = "force-dynamic";

export default async function CouriersPage() {
  const [credentialResult, shopResult, ordersResult] = await Promise.all([
    getCourierCredential(),
    getShop(),
    getOrders(),
  ]);

  const credential = toPublicCourierCredential(credentialResult.data);
  const queued = ordersResult.data.filter(
    (order) => order.status === "CONFIRMED" && !order.consignmentId,
  ).length;
  const booked = ordersResult.data.filter((order) => order.consignmentId).length;

  return (
    <div>
      <PageHeader
        title="Courier API Hub"
        description="Connect Pathao Courier once — ITech Case BD ships every parcel through this single merchant account."
        actions={
          <>
            <DataSourceBadge source={credentialResult.source} />
            <Badge variant="secondary" className="gap-1.5">
              <PlugZap className="h-3.5 w-3.5" /> Pathao only
            </Badge>
          </>
        }
      />

      <CourierConfigView
        credential={credential}
        shopName={shopResult.data.name}
        queued={queued}
        booked={booked}
      />
    </div>
  );
}
