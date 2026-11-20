import type { Metadata } from "next";
import { Store } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { StorefrontView } from "@/components/storefront/storefront-view";
import { Badge } from "@/components/ui/badge";
import { getOrders, getProducts, getShop } from "@/lib/data";

export const metadata: Metadata = { title: "Storefront & Landing Pages" };
export const dynamic = "force-dynamic";

export default async function StorefrontPage() {
  const [shopResult, productsResult, ordersResult] = await Promise.all([
    getShop(),
    getProducts(),
    getOrders(),
  ]);

  return (
    <div>
      <PageHeader
        title="Storefront & Landing Pages"
        description="Brand your store, connect a custom domain and launch COD landing pages."
        actions={
          <>
            <DataSourceBadge source={productsResult.source} />
            <Badge variant="secondary" className="gap-1.5">
              <Store className="h-3.5 w-3.5" /> {shopResult.data.customDomain ?? "itechcasebd.com"}
            </Badge>
          </>
        }
      />

      <StorefrontView
        shop={shopResult.data}
        products={productsResult.data}
        orders={ordersResult.data}
      />
    </div>
  );
}
