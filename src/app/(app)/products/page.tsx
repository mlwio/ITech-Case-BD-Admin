import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { ProductsView } from "@/components/products/products-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProducts } from "@/lib/data";

export const metadata: Metadata = { title: "Products & Inventory" };
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const { data: products, source } = await getProducts();

  return (
    <div>
      <PageHeader
        title="Products & Inventory"
        description="Phone cases, glass guards and accessories — pricing, variants and stock in one place."
        actions={
          <>
            <DataSourceBadge source={source} />
            <Badge variant="secondary" className="gap-1.5">
              <Boxes className="h-3.5 w-3.5" /> {products.length} products
            </Badge>
            <Button asChild size="sm" className="h-8">
              <Link href="/orders/create" prefetch>
                <Plus className="h-4 w-4" /> New product
              </Link>
            </Button>
          </>
        }
      />

      <ProductsView products={products} />
    </div>
  );
}
