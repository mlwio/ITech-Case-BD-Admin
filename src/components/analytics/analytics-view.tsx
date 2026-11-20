"use client";

import * as React from "react";
import {
  BarChart3,
  MapPin,
  PackageCheck,
  Truck,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { FadeIn } from "@/components/shared/motion";
import {
  BreakdownBarChart,
  CHART_COLORS,
  RevenueTrendChart,
  type NamedValue,
} from "@/components/charts/charts";
import { deliveryZoneLabel } from "@/lib/constants";
import {
  computeKpis,
  revenueTrend,
  topCustomers,
  topProducts,
  weekdayLoad,
  zoneBreakdown,
} from "@/lib/metrics";
import { formatBDT, formatNumber, formatPercent, formatPhone, initialsOf } from "@/lib/format";
import type { Customer, Order } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AnalyticsViewProps {
  orders: Order[];
  customers: Customer[];
}

const ZONE_LABELS: Record<"DHAKA" | "OTHER", string> = {
  DHAKA: "Dhaka City",
  OTHER: "Outside Dhaka",
};

export function AnalyticsView({ orders, customers }: AnalyticsViewProps) {
  const kpis = React.useMemo(() => computeKpis(orders), [orders]);
  const trend = React.useMemo(() => revenueTrend(orders, 14), [orders]);
  const zones = React.useMemo(() => zoneBreakdown(orders), [orders]);
  const leaders = React.useMemo(() => topProducts(orders, 8), [orders]);
  const weekdays = React.useMemo(() => weekdayLoad(orders), [orders]);
  const bestCustomers = React.useMemo(() => topCustomers(customers, 6), [customers]);

  const zoneData: NamedValue[] = zones.map((entry, index) => ({
    name: ZONE_LABELS[entry.zone],
    value: entry.orders,
    color: [CHART_COLORS.primary, CHART_COLORS.emerald, CHART_COLORS.amber, CHART_COLORS.sky][index % 4],
  }));

  const weekdayData: NamedValue[] = weekdays.map((entry) => ({
    name: entry.day,
    value: entry.orders,
    color: CHART_COLORS.violet,
  }));

  const topZone = zones[0];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <FadeIn>
          <StatCard
            label="Delivery success"
            value={formatPercent(kpis.deliveryRate)}
            icon={PackageCheck}
            iconClassName="bg-emerald-50 text-emerald-600"
            hint={`${kpis.deliveredOrders} delivered`}
          />
        </FadeIn>
        <FadeIn delay={0.04}>
          <StatCard
            label="Avg order value"
            value={formatBDT(kpis.avgOrderValue)}
            icon={BarChart3}
            hint={`${formatNumber(kpis.totalOrders)} orders total`}
          />
        </FadeIn>
        <FadeIn delay={0.08}>
          <StatCard
            label="Top zone"
            value={topZone ? ZONE_LABELS[topZone.zone] : "—"}
            icon={MapPin}
            iconClassName="bg-sky-50 text-sky-600"
            hint={topZone ? formatBDT(topZone.revenue) : "no data"}
          />
        </FadeIn>
      </div>

      <FadeIn delay={0.06}>
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Revenue &amp; order volume</CardTitle>
              <CardDescription>Daily performance across the last 14 days</CardDescription>
            </div>
            <Badge variant="secondary" className="tabular">
              14 days
            </Badge>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={trend} height={280} />
          </CardContent>
        </Card>
      </FadeIn>

      <div className="grid gap-3">
        <FadeIn delay={0.1}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Delivery zones</CardTitle>
              <CardDescription>Dhaka city, Dhaka sub-area and outside Dhaka</CardDescription>
            </CardHeader>
            <CardContent>
              {zoneData.length ? (
                <BreakdownBarChart data={zoneData} layout="vertical" height={230} />
              ) : (
                <EmptyState icon={MapPin} title="No zone data yet" />
              )}
            </CardContent>
          </Card>
        </FadeIn>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <FadeIn delay={0.06} className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Product leaders</CardTitle>
              <CardDescription>Best selling variants by revenue and margin</CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 sm:pl-5">Variant</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaders.map((leader) => (
                    <TableRow key={leader.variantId}>
                      <TableCell className="pl-4 sm:pl-5">
                        <p className="truncate text-sm font-medium">{leader.productName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {leader.variantName} · {leader.sku}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular">{formatNumber(leader.units)}</TableCell>
                      <TableCell className="text-right font-medium tabular">
                        {formatBDT(leader.revenue)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular text-emerald-600 sm:table-cell">
                        {formatBDT(leader.profit)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {leaders.length === 0 && <EmptyState icon={Truck} title="No sales recorded yet" />}
            </CardContent>
          </Card>
        </FadeIn>

        <FadeIn delay={0.1}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Busy days</CardTitle>
              <CardDescription>Order load by weekday</CardDescription>
            </CardHeader>
            <CardContent>
              <BreakdownBarChart data={weekdayData} height={230} />
            </CardContent>
          </Card>
        </FadeIn>
      </div>

      <FadeIn delay={0.06}>
        <Card>
          <CardHeader>
            <CardTitle>Top customers</CardTitle>
            <CardDescription>Repeat buyers with the strongest delivery record</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {bestCustomers.map((customer) => {
              const rate = customer.totalOrders
                ? (customer.deliveredCount / customer.totalOrders) * 100
                : 0;
              return (
                <div
                  key={customer.id}
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{initialsOf(customer.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{customer.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {formatPhone(customer.phone)} · {deliveryZoneLabel(customer.zone)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular">{formatNumber(customer.totalOrders)}</p>
                    <p
                      className={cn(
                        "text-[10px] tabular",
                        rate >= 70 ? "text-emerald-600" : rate >= 40 ? "text-amber-600" : "text-rose-600",
                      )}
                    >
                      {formatPercent(rate, 0)} delivered
                    </p>
                  </div>
                </div>
              );
            })}
            {bestCustomers.length === 0 && (
              <div className="sm:col-span-2 lg:col-span-3">
                <EmptyState icon={Users} title="No customers yet" />
              </div>
            )}
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
