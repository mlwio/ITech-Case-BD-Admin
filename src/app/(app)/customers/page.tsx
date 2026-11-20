import type { Metadata } from "next";
import { Contact } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { CustomersView } from "@/components/customers/customers-view";
import { Badge } from "@/components/ui/badge";
import { getCustomers, getOrders } from "@/lib/data";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const [{ data: customers, source }, { data: orders }] = await Promise.all([
    getCustomers(),
    getOrders(),
  ]);

  return (
    <div>
      <PageHeader
        title="Customer CRM"
        description="Repeat buyers, lifetime spend and COD return-risk — every buyer in one directory."
        actions={
          <>
            <DataSourceBadge source={source} />
            <Badge variant="secondary" className="gap-1.5">
              <Contact className="h-3.5 w-3.5" /> {customers.length} buyers
            </Badge>
          </>
        }
      />

      <CustomersView customers={customers} orders={orders} />
    </div>
  );
}
