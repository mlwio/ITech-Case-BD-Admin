import Link from "next/link";
import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  PackageCheck,
  PauseCircle,
  Percent,
  ShoppingBag,
  TrendingUp,
  Truck,
  Undo2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/badges";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { FadeIn } from "@/components/shared/motion";
import { RevenueTrendChart } from "@/components/charts/charts";
import { StatusSummaryCard } from "@/components/dashboard/status-summary-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { ModeratorLeaderboard } from "@/components/dashboard/moderator-leaderboard";
import { getOrders, getShop } from "@/lib/data";
import { getSessionContext } from "@/lib/session";
import {
  confirmationRate,
  countByStatus,
  isRevenueOrder,
  moderatorLeaderboard,
  revenueTrendBetween,
} from "@/lib/metrics";
import { filterByRange, resolveRange } from "@/lib/date-range";
import { ORDER_STATUS_CARD, STATUS_CARD_ORDER } from "@/lib/constants";
import { formatBDT, formatNumber, formatPercent, formatPhone, formatRelative } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

interface DashboardPageProps {
  searchParams: { range?: string; from?: string; to?: string; shop?: string };
}

const STATUS_TILE_ICON: Record<OrderStatus, LucideIcon> = {
  PLACED: ShoppingBag,
  CONFIRMED: CheckCircle2,
  HOLD: PauseCircle,
  IN_TRANSIT: Truck,
  DELIVERED: PackageCheck,
  RETURNED: Undo2,
  CANCELLED: XCircle,
};

/** Local `YYYY-MM-DD` (avoids the UTC shift of `toISOString`). */
function toYmd(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [ordersResult, shopResult, session] = await Promise.all([
    getOrders(),
    getShop(),
    getSessionContext(),
  ]);

  const allOrders = ordersResult.data;
  const range = resolveRange(searchParams.range, searchParams.from, searchParams.to);
  const orders = filterByRange(allOrders, range);

  const counts = countByStatus(orders);
  const leads = moderatorLeaderboard(orders);
  const trend = revenueTrendBetween(orders, range.start, range.end);

  const salesOrders = orders.filter(isRevenueOrder);
  const totalSales = salesOrders.reduce((sum, order) => sum + order.totalAmount, 0);
  const confirmRate = confirmationRate(orders);
  const pathaoReadyIds = allOrders
    .filter((order) => order.status === "CONFIRMED" && !order.consignmentId)
    .map((order) => order.id);
  const recentOrders = orders.slice(0, 6);
  const totalCount = orders.length || 1;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Overview"
        description={`${range.label} · ${shopResult.data.name} — status pulse, sales and team performance.`}
        actions={
          <>
            <DataSourceBadge source={ordersResult.source} />
            <QuickActions pathaoReadyIds={pathaoReadyIds} performedBy={session.user.name} />
          </>
        }
      />

      <DateRangeFilter
        range={range.key}
        from={toYmd(range.start)}
        to={toYmd(range.end)}
        shopId={session.shops[0]?.id ?? ""}
        shops={session.shops}
      />

      {/* Status + sales tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {STATUS_CARD_ORDER.map((status, index) => {
          const meta = ORDER_STATUS_CARD[status];
          return (
            <FadeIn key={status} delay={index * 0.03} className="h-full">
              <StatusSummaryCard
                label={meta.label}
                value={formatNumber(counts[status])}
                icon={STATUS_TILE_ICON[status]}
                gradient={meta.gradient}
                glow={meta.glow}
                hint={`${formatPercent((counts[status] / totalCount) * 100)} of orders`}
                href={`/orders?status=${status}`}
              />
            </FadeIn>
          );
        })}

        <FadeIn delay={0.21} className="h-full">
          <StatusSummaryCard
            label="Total Sales"
            value={formatBDT(totalSales)}
            icon={BadgeDollarSign}
            gradient="from-violet-500 to-violet-600"
            glow="shadow-violet-500/30"
            hint={`${formatNumber(salesOrders.length)} confirmed, in-transit & delivered`}
            href="/orders"
          />
        </FadeIn>
        <FadeIn delay={0.24} className="h-full">
          <StatusSummaryCard
            label="Confirmation Rate"
            value={formatPercent(confirmRate)}
            icon={Percent}
            gradient="from-teal-500 to-teal-600"
            glow="shadow-teal-500/30"
            hint={`${formatNumber(counts.CONFIRMED)} confirmed of ${formatNumber(orders.length)}`}
            href="/orders?status=CONFIRMED"
          />
        </FadeIn>
      </div>

      {/* Trend + leaderboard */}
      <div className="grid gap-3 lg:grid-cols-3">
        <FadeIn delay={0.06} className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Revenue trend</CardTitle>
                <CardDescription>Confirmed, in-transit &amp; delivered value — {range.label}</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <Link href="/analytics" prefetch>
                  Analytics <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <RevenueTrendChart data={trend} />
            </CardContent>
          </Card>
        </FadeIn>

        <FadeIn delay={0.1} className="lg:col-span-1">
          <ModeratorLeaderboard stats={leads} />
        </FadeIn>
      </div>

      {/* Recent orders */}
      <FadeIn delay={0.06}>
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Recent orders</CardTitle>
              <CardDescription>Newest first within the selected range</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link href="/orders" prefetch>
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentOrders.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="No orders in this range"
                description="Try a wider date range or switch the shop filter."
              />
            ) : (
              recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/orders?q=${order.orderNumber}`}
                  prefetch
                  className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{order.orderNumber}</p>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {order.customer.name} · {formatPhone(order.customer.phone)} ·{" "}
                      {formatRelative(order.placedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular">{formatBDT(order.totalAmount)}</span>
                    <StatusBadge status={order.status} />
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
