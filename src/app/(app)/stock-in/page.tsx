import type { Metadata } from "next";
import { PackagePlus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { StockInView } from "@/components/inventory/stock-in-view";
import { StockBackupActions } from "@/components/inventory/stock-backup-actions";
import { Badge } from "@/components/ui/badge";
import { getProducts } from "@/lib/data";
import { getSessionContext } from "@/lib/session";
import { canViewCosts } from "@/lib/constants";

export const metadata: Metadata = { title: "Stock In" };
export const dynamic = "force-dynamic";

export default async function StockInPage() {
  const [{ data: products, source }, session] = await Promise.all([getProducts(), getSessionContext()]);

  return (
    <div>
      <PageHeader
        title="Stock In"
        description="Pick a series → variant tier → colour, then top up units. New colours start at 0 pcs."
        actions={
          <>
            <DataSourceBadge source={source} />
            <Badge variant="secondary" className="gap-1.5">
              <PackagePlus className="h-3.5 w-3.5" /> Fast stock-in
            </Badge>
            <StockBackupActions products={products} />
          </>
        }
      />

      <StockInView
        products={products}
        performedBy={session.user.name}
        canViewCosts={canViewCosts(session.user.role, session.user.permissions)}
      />
    </div>
  );
}
