"use client";

import * as React from "react";
import {
  AlertTriangle,
  Phone,
  Repeat,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { deliveryZoneLabel } from "@/lib/constants";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { FadeIn } from "@/components/shared/motion";
import { buildCustomerInsights, RISK_META, type CustomerInsight } from "@/lib/customers";
import { colorHex } from "@/lib/catalog-meta";
import { formatBDT, formatDate, formatNumber, formatPhone, formatRelative, initialsOf } from "@/lib/format";
import type { Customer, Order } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CustomersViewProps {
  customers: Customer[];
  orders: Order[];
}

export function CustomersView({ customers, orders }: CustomersViewProps) {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<CustomerInsight | null>(null);

  const insights = React.useMemo(
    () => buildCustomerInsights(customers, orders).sort((a, b) => b.totalSpent - a.totalSpent),
    [customers, orders],
  );

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? insights.filter(
        (row) =>
          row.customer.name.toLowerCase().includes(needle) ||
          row.customer.phone.toLowerCase().includes(needle) ||
          row.customer.address.toLowerCase().includes(needle),
      )
    : insights;

  const repeatBuyers = insights.filter((row) => row.totalOrders > 1).length;
  const totalSpent = insights.reduce((sum, row) => sum + row.totalSpent, 0);
  const highRisk = insights.filter((row) => row.riskLevel === "high").length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FadeIn>
          <StatCard label="Customers" value={formatNumber(insights.length)} icon={Users} hint="unique buyers" />
        </FadeIn>
        <FadeIn delay={0.04}>
          <StatCard
            label="Repeat buyers"
            value={formatNumber(repeatBuyers)}
            icon={Repeat}
            iconClassName="bg-violet-50 text-violet-600"
            hint={`${formatNumber(insights.length ? (repeatBuyers / insights.length) * 100 : 0)}% reorder rate`}
          />
        </FadeIn>
        <FadeIn delay={0.08}>
          <StatCard
            label="Lifetime collected"
            value={formatBDT(totalSpent)}
            icon={Wallet}
            iconClassName="bg-emerald-50 text-emerald-600"
            hint="delivered orders"
          />
        </FadeIn>
        <FadeIn delay={0.12}>
          <StatCard
            label="High return risk"
            value={formatNumber(highRisk)}
            icon={ShieldAlert}
            iconClassName="bg-rose-50 text-rose-600"
            hint="watch on COD"
          />
        </FadeIn>
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone or address…"
            className="pl-9"
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Customer directory</CardTitle>
          <CardDescription>
            Tap a buyer to see their order history, spend and preferred iPhone case.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0 sm:px-0">
          {filtered.length ? (
            <div className="divide-y divide-border">
              {filtered.map((row) => {
                const risk = RISK_META[row.riskLevel];
                return (
                  <button
                    key={row.customer.id}
                    type="button"
                    onClick={() => setSelected(row)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initialsOf(row.customer.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{row.customer.name}</p>
                        <span
                          className={cn(
                            "hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset sm:inline-flex",
                            risk.className,
                          )}
                        >
                          {risk.label}
                        </span>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {formatPhone(row.customer.phone)} · {row.customer.address}
                      </p>
                    </div>
                    <div className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">
                      <span className="text-sm font-semibold tabular">{formatBDT(row.totalSpent)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {row.totalOrders} order{row.totalOrders === 1 ? "" : "s"}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset sm:hidden",
                        risk.className,
                      )}
                    >
                      {row.totalOrders}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={UserRound}
              title="No customers match"
              description="Try another name, phone number or address."
            />
          )}
        </CardContent>
      </Card>

      <CustomerDetailSheet insight={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}

function CustomerDetailSheet({
  insight,
  onOpenChange,
}: {
  insight: CustomerInsight | null;
  onOpenChange: (open: boolean) => void;
}) {
  const risk = insight ? RISK_META[insight.riskLevel] : null;

  return (
    <Sheet open={Boolean(insight)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md gap-0 p-0">
        {insight && (
          <>
            <SheetHeader className="border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {initialsOf(insight.customer.name)}
                </span>
                <div className="min-w-0">
                  <SheetTitle className="truncate">{insight.customer.name}</SheetTitle>
                  <SheetDescription className="truncate">{insight.customer.address}</SheetDescription>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {risk && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                      risk.className,
                    )}
                  >
                    {insight.riskLevel === "low" ? (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    ) : (
                      <ShieldAlert className="h-3.5 w-3.5" />
                    )}
                    {risk.label} · {insight.riskScore}%
                  </span>
                )}
                <Badge variant="secondary" className="gap-1.5">
                  <Phone className="h-3 w-3" /> {formatPhone(insight.customer.phone)}
                </Badge>
                <Badge variant="outline" className="gap-1.5">
                  {deliveryZoneLabel(insight.customer.zone)}
                </Badge>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-2.5">
                  <MiniStat label="Total orders" value={formatNumber(insight.totalOrders)} />
                  <MiniStat label="Lifetime spend" value={formatBDT(insight.totalSpent)} />
                  <MiniStat label="Delivered" value={formatNumber(insight.delivered)} tone="emerald" />
                  <MiniStat label="Returned / cancelled" value={formatNumber(insight.returned + insight.cancelled)} tone="rose" />
                </div>

                {(insight.preferredModel || insight.preferredColor) && (
                  <Card className="bg-muted/40 p-3.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold">
                      <Sparkles className="h-3.5 w-3.5 text-primary" /> Preferred iPhone case
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {insight.preferredModel && (
                        <Badge className="gap-1.5">
                          <Smartphone className="h-3 w-3" /> {insight.preferredModel}
                        </Badge>
                      )}
                      {insight.preferredColor && (
                        <Badge variant="secondary" className="gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                            style={{ backgroundColor: colorHex(insight.preferredColor) }}
                          />
                          {insight.preferredColor}
                        </Badge>
                      )}
                    </div>
                    {insight.models.length > 1 && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Also bought: {insight.models.slice(1, 5).join(", ")}
                      </p>
                    )}
                  </Card>
                )}

                {insight.outstanding > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{formatBDT(insight.outstanding)} in transit / awaiting COD settlement</span>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Order history
                    </p>
                    {insight.lastOrderAt && (
                      <span className="text-[11px] text-muted-foreground">
                        last {formatRelative(insight.lastOrderAt)}
                      </span>
                    )}
                  </div>
                  <Separator className="my-2" />
                  {insight.orders.length ? (
                    <div className="space-y-2">
                      {insight.orders.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center gap-3 rounded-lg border border-border p-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold">{order.orderNumber}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {order.items.map((item) => `${item.productName} ×${item.quantity}`).join(", ")}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{formatDate(order.placedAt)}</p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="text-xs font-semibold tabular">{formatBDT(order.totalAmount)}</span>
                            <StatusBadge status={order.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon={UserRound} title="No orders yet" />
                  )}
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "rose";
}) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular",
          tone === "emerald" && "text-emerald-600",
          tone === "rose" && "text-rose-600",
        )}
      >
        {value}
      </p>
    </div>
  );
}
