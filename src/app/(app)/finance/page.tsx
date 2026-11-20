import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { FinanceView } from "@/components/finance/finance-view";
import { Badge } from "@/components/ui/badge";
import { getExpenses, getFinancialLedger, getOrders } from "@/lib/data";
import { getSessionContext } from "@/lib/session";
import { filterByRange, resolveRange } from "@/lib/date-range";
import { canViewCosts } from "@/lib/constants";
import { formatBDT } from "@/lib/format";

export const metadata: Metadata = { title: "Finance & Hisab" };
export const dynamic = "force-dynamic";

interface FinancePageProps {
  searchParams: { range?: string; from?: string; to?: string; shop?: string };
}

/** Local `YYYY-MM-DD` (avoids the UTC shift of `toISOString`). */
function toYmd(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default async function FinancePage({ searchParams }: FinancePageProps) {
  const [ordersResult, expensesResult, ledgerResult, session] = await Promise.all([
    getOrders(),
    getExpenses(),
    getFinancialLedger(),
    getSessionContext(),
  ]);

  const range = resolveRange(searchParams.range, searchParams.from, searchParams.to);
  const orders = filterByRange(ordersResult.data, range);
  const expenses = expensesResult.data.filter((expense) => {
    const time = new Date(expense.date).getTime();
    return time >= range.start && time <= range.end;
  });

  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amountBdt, 0);
  const showCosts = canViewCosts(session.user.role, session.user.permissions);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Finance & Hisab"
        description="Revenue, COGS, Pathao fees, expenses and net profit — plus COD settlement reconciliation."
        actions={
          <>
            <DataSourceBadge source={ordersResult.source} />
            <Badge variant="secondary" className="gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> {formatBDT(totalExpenses)} spent
            </Badge>
          </>
        }
      />

      <DateRangeFilter
        range={range.key}
        from={toYmd(range.start)}
        to={toYmd(range.end)}
        shopId={session.shops[0]?.id ?? ""}
        shops={session.shops}
        basePath="/finance"
      />

      <FinanceView
        orders={orders}
        expenses={expenses}
        ledger={ledgerResult.data}
        createdByName={session.user.name}
        canViewCosts={showCosts}
        periodLabel={range.label}
      />
    </div>
  );
}
