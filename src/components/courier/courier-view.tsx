"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MapPin,
  PackageSearch,
  Printer,
  RefreshCw,
  RotateCcw,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { FadeIn } from "@/components/shared/motion";
import { BookPathaoDialog } from "@/components/courier/book-pathao-dialog";
import { PathaoTimeline } from "@/components/courier/pathao-timeline";
import { PathaoConnectionBanner } from "@/components/courier/connection-banner";
import {
  bulkBookPathaoOrdersAction,
  refreshPathaoStatusAction,
  type BookingResult,
} from "@/lib/actions/courier";
import { deliveryZoneLabel, PATHAO_DEFAULT_ITEM_WEIGHT, pathaoStatusMeta } from "@/lib/constants";
import { formatBDT, formatDate, formatNumber, formatPhone, formatRelative } from "@/lib/format";
import type { CourierCredentialPublic, Order, OrderStatus, ParcelTrackingEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

type CourierTab = "queue" | "moving" | "delivered" | "returns";

const TAB_FILTERS: Record<CourierTab, OrderStatus[]> = {
  queue: ["CONFIRMED"],
  moving: ["IN_TRANSIT"],
  delivered: ["DELIVERED"],
  returns: ["RETURNED"],
};

export interface CourierViewProps {
  orders: Order[];
  trackingEvents: ParcelTrackingEvent[];
  credential: CourierCredentialPublic;
  performedBy: string;
}

const stickerHref = (ids: string[]) => `/print/sticker?ids=${encodeURIComponent(ids.join(","))}`;
const packingHref = (ids: string[]) => `/print/packing-list?ids=${encodeURIComponent(ids.join(","))}`;

export function CourierView({ orders, trackingEvents, credential, performedBy }: CourierViewProps) {
  const router = useRouter();

  const [tab, setTab] = React.useState<CourierTab>("queue");
  const [query, setQuery] = React.useState("");
  const [statusOverrides, setStatusOverrides] = React.useState<Record<string, OrderStatus>>({});
  const [pathaoOverrides, setPathaoOverrides] = React.useState<Record<string, string>>({});
  const [consignmentOverrides, setConsignmentOverrides] = React.useState<Record<string, string>>({});
  const [sessionEvents, setSessionEvents] = React.useState<Record<string, ParcelTrackingEvent[]>>({});
  const [checkedIds, setCheckedIds] = React.useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [pendingBulk, setPendingBulk] = React.useState(false);
  const [refreshingId, setRefreshingId] = React.useState<string | null>(null);

  const statusOf = React.useCallback(
    (order: Order): OrderStatus => statusOverrides[order.id] ?? order.status,
    [statusOverrides],
  );
  const consignmentOf = React.useCallback(
    (order: Order): string | null => consignmentOverrides[order.id] ?? order.consignmentId,
    [consignmentOverrides],
  );
  const pathaoStatusOf = React.useCallback(
    (order: Order): string | null => pathaoOverrides[order.id] ?? order.pathaoStatus,
    [pathaoOverrides],
  );

  const eventsByOrder = React.useMemo(() => {
    const map = new Map<string, ParcelTrackingEvent[]>();
    for (const event of trackingEvents) {
      const list = map.get(event.orderId) ?? [];
      list.push(event);
      map.set(event.orderId, list);
    }
    for (const [orderId, list] of Object.entries(sessionEvents)) {
      map.set(orderId, [...(map.get(orderId) ?? []), ...list]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
    }
    return map;
  }, [trackingEvents, sessionEvents]);

  const consignmentOrders = React.useMemo(
    () => orders.filter((order) => consignmentOf(order)),
    [orders, consignmentOf],
  );

  const stats = React.useMemo(() => {
    const queue = orders.filter(
      (order) => statusOf(order) === "CONFIRMED" && !consignmentOf(order),
    ).length;
    const moving = orders.filter((order) => statusOf(order) === "IN_TRANSIT").length;
    const delivered = orders.filter((order) => statusOf(order) === "DELIVERED").length;
    const returns = orders.filter((order) => statusOf(order) === "RETURNED").length;
    const codInTransit = orders
      .filter((order) => statusOf(order) === "IN_TRANSIT")
      .reduce((sum, order) => sum + order.totalAmount, 0);
    const courierFees = consignmentOrders.reduce((sum, order) => sum + order.courierFee, 0);
    return { queue, moving, delivered, returns, codInTransit, courierFees };
  }, [orders, consignmentOrders, statusOf, consignmentOf]);

  const filtered = React.useMemo(() => {
    const allowed = TAB_FILTERS[tab];
    const needle = query.trim().toLowerCase();
    return orders
      .filter((order) => {
        if (!allowed.includes(statusOf(order))) return false;
        if (tab === "queue" && consignmentOf(order)) return false;
        return true;
      })
      .filter((order) => {
        if (!needle) return true;
        return (
          order.orderNumber.toLowerCase().includes(needle) ||
          order.customer.name.toLowerCase().includes(needle) ||
          order.customer.phone.includes(needle) ||
          (consignmentOf(order) ?? "").toLowerCase().includes(needle)
        );
      });
  }, [orders, tab, query, statusOf, consignmentOf]);

  const selectedOrder = React.useMemo(
    () => orders.find((order) => order.id === selectedId) ?? null,
    [orders, selectedId],
  );

  const queueOrders = React.useMemo(
    () => orders.filter((order) => statusOf(order) === "CONFIRMED" && !consignmentOf(order)),
    [orders, statusOf, consignmentOf],
  );

  const selectedVisibleCount = filtered.filter((order) => checkedIds.has(order.id)).length;
  const allVisibleSelected = filtered.length > 0 && selectedVisibleCount === filtered.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  function toggleOne(orderId: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function toggleAllVisible() {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const order of filtered) next.delete(order.id);
      } else {
        for (const order of filtered) next.add(order.id);
      }
      return next;
    });
  }

  function appendEvent(
    orderId: string,
    entry: { status: string; message?: string | null; source?: string },
  ) {
    setSessionEvents((prev) => ({
      ...prev,
      [orderId]: [
        ...(prev[orderId] ?? []),
        {
          id: `local_${orderId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          orderId,
          consignmentId: null,
          status: entry.status,
          message: entry.message ?? null,
          source: entry.source ?? "MERCHANT",
          occurredAt: new Date().toISOString(),
        },
      ],
    }));
  }

  /** Applies a successful single booking to local state so the UI reacts instantly. */
  function applyBooking(order: Order, result: BookingResult) {
    setStatusOverrides((prev) => ({ ...prev, [order.id]: "IN_TRANSIT" }));
    if (result.pathaoStatus) setPathaoOverrides((prev) => ({ ...prev, [order.id]: result.pathaoStatus! }));
    const consignment = result.consignmentId ?? `PA-${order.orderNumber}`;
    setConsignmentOverrides((prev) => ({ ...prev, [order.id]: consignment }));
    appendEvent(order.id, {
      status: result.pathaoStatus ?? "Pickup_Requested",
      message: `Booked via Pathao — fee ${formatBDT(result.deliveryFee ?? 0)}`,
    });
    router.refresh();
  }

  async function refreshStatus(order: Order, silent = false) {
    setRefreshingId(order.id);
    try {
      const result = await refreshPathaoStatusAction(
        order.id,
        performedBy,
        pathaoStatusOf(order) ?? undefined,
      );
      if (!result.ok) {
        toast.error("Could not sync live status", { description: result.message });
        return;
      }
      if (result.status) {
        setPathaoOverrides((prev) => ({ ...prev, [order.id]: result.status! }));
        appendEvent(order.id, {
          status: result.status,
          message: "Pulled from Pathao on demand",
          source: "MANUAL_SYNC",
        });
      }
      if (result.orderStatus) {
        setStatusOverrides((prev) => ({ ...prev, [order.id]: result.orderStatus! }));
      }
      if (!silent) {
        toast.success("Live status refreshed", { description: result.message });
      }
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setRefreshingId(null);
    }
  }

  async function bookMany(ids: string[], label: string) {
    if (ids.length === 0) return;
    setPendingBulk(true);
    try {
      const result = await bulkBookPathaoOrdersAction(ids, performedBy);
      if (!result.ok) {
        toast.error(result.message || "Could not book the consignments");
        router.refresh();
        return;
      }
      setStatusOverrides((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = "IN_TRANSIT";
        return next;
      });
      setPathaoOverrides((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = result.pathaoStatus ?? "Pickup_Requested";
        return next;
      });
      setConsignmentOverrides((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          const order = orders.find((item) => item.id === id);
          if (order) next[id] = `PA-${order.orderNumber}`;
        }
        return next;
      });
      for (const id of ids) {
        appendEvent(id, { status: "Pickup_Requested", message: "Bulk booked with Pathao" });
      }
      toast.success(result.message, { description: label });
      setCheckedIds(new Set());
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPendingBulk(false);
    }
  }

  return (
    <div className="space-y-3">
      <PathaoConnectionBanner credential={credential} queued={stats.queue} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FadeIn>
          <StatCard
            label="Ready to book"
            value={formatNumber(stats.queue)}
            icon={Clock3}
            hint="confirmed, awaiting pickup request"
            iconClassName="bg-amber-50 text-amber-600"
          />
        </FadeIn>
        <FadeIn delay={0.04}>
          <StatCard
            label="In transit"
            value={formatNumber(stats.moving)}
            icon={Truck}
            hint={`${formatBDT(stats.codInTransit)} COD on the road`}
            iconClassName="bg-sky-50 text-sky-600"
          />
        </FadeIn>
        <FadeIn delay={0.08}>
          <StatCard
            label="Delivered"
            value={formatNumber(stats.delivered)}
            icon={CheckCircle2}
            hint={`${formatBDT(stats.courierFees)} courier fees`}
            iconClassName="bg-emerald-50 text-emerald-600"
          />
        </FadeIn>
        <FadeIn delay={0.12}>
          <StatCard
            label="Returns"
            value={formatNumber(stats.returns)}
            icon={RotateCcw}
            hint="inspect & restock"
            invertDelta
            iconClassName="bg-orange-50 text-orange-600"
          />
        </FadeIn>
      </div>

      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <PackageSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search consignment ID, order or customer…"
                className="pl-9"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Button
              size="sm"
              variant="outline"
              className="h-10 sm:h-9"
              asChild
              disabled={consignmentOrders.length === 0}
            >
              <a
                href={stickerHref(consignmentOrders.map((order) => order.id))}
                target="_blank"
                rel="noreferrer"
              >
                <Printer className="h-4 w-4" /> Stickers
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-10 sm:h-9"
              asChild
              disabled={queueOrders.length === 0}
            >
              <a href={packingHref(queueOrders.map((order) => order.id))} target="_blank" rel="noreferrer">
                <Printer className="h-4 w-4" /> Packing list
              </a>
            </Button>
            <Button
              size="sm"
              className="h-10 sm:h-9"
              disabled={pendingBulk || queueOrders.length === 0}
              onClick={() => bookMany(queueOrders.map((order) => order.id), "Bulk booking")}
            >
              <Truck className="h-4 w-4" />
              Book all ({queueOrders.length})
            </Button>
          </div>

          <Tabs value={tab} onValueChange={(value) => setTab(value as CourierTab)}>
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
              <TabsTrigger value="queue" className="h-10 sm:h-7">
                Booking queue
              </TabsTrigger>
              <TabsTrigger value="moving" className="h-10 sm:h-7">
                In transit
              </TabsTrigger>
              <TabsTrigger value="delivered" className="h-10 sm:h-7">
                Delivered
              </TabsTrigger>
              <TabsTrigger value="returns" className="h-10 sm:h-7">
                Returns
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Card>

      {/* Bulk selection bar */}
      <AnimatePresence initial={false}>
        {checkedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3"
          >
            <Badge variant="secondary" className="tabular">
              {checkedIds.size} selected
            </Badge>
            <Button
              size="sm"
              variant="success"
              disabled={pendingBulk}
              onClick={() => bookMany(Array.from(checkedIds), "Selected booking")}
            >
              <Truck className="h-4 w-4" />
              {pendingBulk ? "Booking…" : "Book selected with Pathao"}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={stickerHref(Array.from(checkedIds))} target="_blank" rel="noreferrer">
                <Printer className="h-4 w-4" /> Print stickers
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={packingHref(Array.from(checkedIds))} target="_blank" rel="noreferrer">
                <Printer className="h-4 w-4" /> Packing list
              </a>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCheckedIds(new Set())}>
              Clear selection
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAllVisible}
                  aria-label="Select all visible parcels"
                />
              </TableHead>
              <TableHead>Consignment</TableHead>
              <TableHead>Order</TableHead>
              <TableHead className="hidden sm:table-cell">Customer</TableHead>
              <TableHead className="hidden md:table-cell">Zone</TableHead>
              <TableHead>Pathao status</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Courier fee</TableHead>
              <TableHead className="text-right">COD</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((order) => {
              const consignment = consignmentOf(order);
              const pathaoStatus = pathaoStatusOf(order);
              const meta = pathaoStatusMeta(pathaoStatus);
              return (
                <TableRow
                  key={order.id}
                  className="cursor-pointer"
                  data-state={checkedIds.has(order.id) ? "selected" : undefined}
                  onClick={() => setSelectedId(order.id)}
                >
                  <TableCell className="w-10" onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      checked={checkedIds.has(order.id)}
                      onCheckedChange={() => toggleOne(order.id)}
                      aria-label={`Select ${order.orderNumber}`}
                    />
                  </TableCell>
                  <TableCell>
                    {consignment ? (
                      <div>
                        <p className="font-medium">{consignment}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {meta?.label ?? "Pending"}
                        </p>
                      </div>
                    ) : (
                      <Badge variant="warning">Not booked</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{order.orderNumber}</p>
                    <p className="text-[11px] text-muted-foreground">{formatRelative(order.updatedAt)}</p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <p className="truncate text-sm">{order.customer.name}</p>
                    <p className="text-[11px] text-muted-foreground">{formatPhone(order.customer.phone)}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {deliveryZoneLabel(order.deliveryZone, order.deliveryCharge)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {meta ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                          meta.className,
                        )}
                      >
                        {meta.label}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right tabular lg:table-cell">
                    {order.courierFee ? formatBDT(order.courierFee) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <p className="font-semibold tabular">{formatBDT(order.totalAmount)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {order.isPaymentSettled ? "Settled" : "On delivery"}
                    </p>
                  </TableCell>
                  <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      {!consignment && statusOf(order) === "CONFIRMED" ? (
                        <BookPathaoDialog
                          order={order}
                          performedBy={performedBy}
                          pickupStoreName={credential.pickupStoreName}
                          onBooked={(result) => applyBooking(order, result)}
                          trigger={
                            <Button size="sm" variant="success" className="h-10 sm:h-7">
                              <Truck className="h-3.5 w-3.5" /> Book
                            </Button>
                          }
                        />
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-10 sm:h-7"
                            disabled={refreshingId === order.id}
                            onClick={() => refreshStatus(order)}
                          >
                            <RefreshCw
                              className={cn("h-3.5 w-3.5", refreshingId === order.id && "animate-spin")}
                            />
                            Refresh
                          </Button>
                          <Button size="icon-sm" variant="ghost" asChild title="Print sticker">
                            <a href={stickerHref([order.id])} target="_blank" rel="noreferrer">
                              <Printer className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {filtered.length === 0 && (
          <EmptyState
            icon={Truck}
            title="Nothing in this bucket"
            description="Pathao consignments will appear here as soon as orders move."
          />
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Pathao activity</CardTitle>
          <CardDescription>Latest status transitions pushed from the courier API</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {consignmentOrders.slice(0, 5).map((order) => {
            const meta = pathaoStatusMeta(pathaoStatusOf(order));
            return (
              <button
                key={order.id}
                type="button"
                onClick={() => setSelectedId(order.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Truck className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {consignmentOf(order)} · {order.orderNumber}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {order.customer.name} ·{" "}
                    {deliveryZoneLabel(order.deliveryZone, order.deliveryCharge)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                      meta?.className ?? "bg-muted text-muted-foreground ring-border",
                    )}
                  >
                    {meta?.label ?? "Pending"}
                  </span>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(order.updatedAt)}</p>
                </div>
              </button>
            );
          })}
          {consignmentOrders.length === 0 && (
            <EmptyState icon={AlertTriangle} title="No consignments booked yet" />
          )}
        </CardContent>
      </Card>

      {/* Detail drawer */}
      <Sheet open={Boolean(selectedOrder)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="w-full max-w-md gap-0 overflow-y-auto p-0 scrollbar-thin">
          {selectedOrder && (
            <>
              <SheetHeader className="border-b border-border pb-4">
                <div className="flex items-center gap-2">
                  <SheetTitle>{selectedOrder.orderNumber}</SheetTitle>
                  <StatusBadge status={statusOf(selectedOrder)} />
                </div>
                <SheetDescription>
                  {selectedOrder.customer.name} · {formatPhone(selectedOrder.customer.phone)}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-3">
                  <Tile label="Consignment">
                    <span className="text-sm font-medium">
                      {consignmentOf(selectedOrder) ?? "Not booked"}
                    </span>
                  </Tile>
                  <Tile label="Courier fee">
                    <span className="text-sm font-medium tabular">
                      {selectedOrder.courierFee ? formatBDT(selectedOrder.courierFee) : "—"}
                    </span>
                  </Tile>
                  <Tile label="COD to collect">
                    <span className="text-sm font-semibold tabular">
                      {formatBDT(selectedOrder.totalAmount)}
                    </span>
                  </Tile>
                  <Tile label="Payment">
                    <Badge variant={selectedOrder.isPaymentSettled ? "success" : "warning"}>
                      {selectedOrder.isPaymentSettled ? "Settled" : "Unsettled"}
                    </Badge>
                  </Tile>
                </div>

                <PathaoTimeline
                  consignmentId={consignmentOf(selectedOrder)}
                  pathaoStatus={pathaoStatusOf(selectedOrder)}
                  events={eventsByOrder.get(selectedOrder.id) ?? []}
                  refreshing={refreshingId === selectedOrder.id}
                  onRefresh={() => refreshStatus(selectedOrder)}
                />

                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold">Delivery address</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedOrder.customer.address}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Weight {PATHAO_DEFAULT_ITEM_WEIGHT} kg · Delivery type 48 (normal) · Item type 2 (parcel)
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold">Items</p>
                  <div className="space-y-2">
                    {selectedOrder.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 p-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{item.productName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {item.variantName} · {item.sku}
                          </p>
                        </div>
                        <p className="shrink-0 text-xs font-semibold tabular">x{item.quantity}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={refreshingId === selectedOrder.id}
                    onClick={() => refreshStatus(selectedOrder)}
                  >
                    <RefreshCw
                      className={cn("h-4 w-4", refreshingId === selectedOrder.id && "animate-spin")}
                    />
                    Refresh Live Status
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={stickerHref([selectedOrder.id])} target="_blank" rel="noreferrer">
                      <Printer className="h-4 w-4" /> Sticker
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={packingHref([selectedOrder.id])} target="_blank" rel="noreferrer">
                      <Printer className="h-4 w-4" /> Packing list
                    </a>
                  </Button>
                  {statusOf(selectedOrder) === "CONFIRMED" && !consignmentOf(selectedOrder) && (
                    <BookPathaoDialog
                      order={selectedOrder}
                      performedBy={performedBy}
                      pickupStoreName={credential.pickupStoreName}
                      onBooked={(result) => applyBooking(selectedOrder, result)}
                      trigger={
                        <Button size="sm" variant="success">
                          <Truck className="h-4 w-4" /> Book with Pathao
                        </Button>
                      }
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
