import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { InventoryView } from "@/components/inventory/inventory-view";
import { Badge } from "@/components/ui/badge";
import { getInventoryMovements, getProducts } from "@/lib/data";
import { getSessionContext } from "@/lib/session";
import { canViewCosts, LOW_STOCK_THRESHOLD } from "@/lib/constants";

export const metadata: Metadata = { title: "Inventory Matrix" };
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const [{ data: products, source }, { data: movements }, session] = await Promise.all([
    getProducts(),
    getInventoryMovements(),
    getSessionContext(),
  ]);

  const variantCount = products.reduce((sum, product) => sum + product.variants.length, 0);

  return (
    <div>
      <PageHeader
        title="Inventory Matrix"
        description="iPhone model × silicone colour stock. Auto-deduction on confirmation, restock on cancel/return."
        actions={
          <>
            <DataSourceBadge source={source} />
            <Badge variant="secondary" className="gap-1.5">
              <Boxes className="h-3.5 w-3.5" /> {variantCount} variants
            </Badge>
            <Badge variant="warning" className="hidden sm:inline-flex">
              Low stock ≤ {LOW_STOCK_THRESHOLD}
            </Badge>
          </>
        }
      />

      <InventoryView
        products={products}
        movements={movements}
        performedBy={session.user.name}
        canViewCosts={canViewCosts(session.user.role, session.user.permissions)}
      />
    </div>
  );
}
