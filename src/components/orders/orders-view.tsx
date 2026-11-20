"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  Clock,
  Copy,
  Download,
  Filter,
  History,
  Lock,
  MapPin,
  MessageSquare,
  Package,
  PlusCircle,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { PathaoTimeline } from "@/components/courier/pathao-timeline";
import {
  DELIVERY_ZONES,
  deliveryZoneLabel,
  ORDER_STATUS_META,
  PATHAO_STATUS_META,
  pathaoStatusMeta,
} from "@/lib/constants";
import { formatBDT, formatDateTime, formatNumber, formatPhone, formatRelative } from "@/lib/format";
import { orderPackingSlipText } from "@/lib/packing-slip";
import { bulkSendToPathaoAction, updateOrderStatusAction } from "@/lib/actions/orders";
import { refreshPathaoStatusAction, bookPathaoOrderAction } from "@/lib/actions/courier";
import { downloadCsv, toCsv, type CsvCell } from "@/lib/csv";
import {
  type Order,
  type OrderAuditLog,
  type OrderStatus,
  type ParcelTrackingEvent,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type StatusFilter = "ALL" | OrderStatus;

/** Spec order — no synthetic "Pending" bucket. */
const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PLACED", label: "Placed" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "HOLD", label: "Hold" },
  { value: "IN_TRANSIT", label: "In Transit" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "RETURNED", label: "Returned" },
  { value: "CANCELLED", label: "Cancelled" },
];

const AUDIT_ACTION_META: Record<string, { label: string; icon: typeof History; tone: string }> = {
  ORDER_CREATED: {
    label: "Order created",
    icon: PlusCircle,
    tone: "bg-blue-50 text-blue-600 ring-blue-600/20",
  },
  STATUS_CHANGED: {
    label: "Status changed",
    icon: RefreshCw,
    tone: "bg-indigo-50 text-indigo-600 ring-indigo-600/20",
  },
  PATHAO_CONSIGNMENT_CREATED: {
    label: "Pathao consignment booked",
    icon: Truck,
    tone: "bg-violet-50 text-violet-600 ring-violet-600/20",
  },
  NOTE_ADDED: {
    label: "Note added",
    icon: MessageSquare,
    tone: "bg-amber-50 text-amber-600 ring-amber-600/20",
  },
};

const DEFAULT_AUDIT_META = {
  label: "Activity",
  icon: History,
  tone: "bg-muted text-muted-foreground ring-border",
};

export interface OrdersViewProps {
  orders: Order[];
  /** Immutable audit trail across the shop — grouped per order in the drawer. */
  auditLogs: OrderAuditLog[];
  /** Pathao parcel lifecycle feed — the live courier tracking history. */
  trackingEvents: ParcelTrackingEvent[];
  /** Name of the signed-in staff member, stamped onto every new audit entry. */
  performedBy: string;
  initialQuery?: string;
  initialStatus?: string;
}

export function OrdersView({
  orders,
  auditLogs,
  trackingEvents,
  performedBy,
  initialQuery = "",
  initialStatus = "ALL",
}: OrdersViewProps) {
  const router = useRouter();

  const [query, setQuery] = React.useState(initialQuery);
  const [status, setStatus] = React.useState<StatusFilter>(
    (STATUS_TABS.some((tab) => tab.value === initialStatus) ? initialStatus : "ALL") as StatusFilter,
  );
  const [zone, setZone] = React.useState<string>("ALL");
  const [sort, setSort] = React.useState<"newest" | "value">("newest");
  const [selected, setSelected] = React.useState<Order | null>(null);
  const [checkedIds, setCheckedIds] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(false);
  /** Local status overrides so actions feel instant without a round-trip. */
  const [overrides, setOverrides] = React.useState<Record<string, OrderStatus>>({});
  /** Audit entries added optimistically this session. */
  const [sessionLogs, setSessionLogs] = React.useState<Record<string, OrderAuditLog[]>>({});
  /** Pathao status pulled live from the API — overrides the stored value. */
  const [pathaoOverrides, setPathaoOverrides] = React.useState<Record<string, string>>({});
  /** Tracking history returned by a manual "Sync Pathao Status" click. */
  const [trackingOverrides, setTrackingOverrides] = React.useState<Record<string, ParcelTrackingEvent[]>>({});
  const [refreshingId, setRefreshingId] = React.useState<string | null>(null);
  /** Order currently being re-booked with Pathao from the retry controls. */
  const [bookingId, setBookingId] = React.useState<string | null>(null);

  const statusOf = React.useCallback(
    (order: Order): OrderStatus => overrides[order.id] ?? order.status,
    [overrides],
  );

  const pathaoStatusOf = React.useCallback(
    (order: Order): string | null => pathaoOverrides[order.id] ?? order.pathaoStatus,
    [pathaoOverrides],
  );

  const trackingByOrder = React.useMemo(() => {
    const map = new Map<string, ParcelTrackingEvent[]>();
    for (const event of trackingEvents) {
      const list = map.get(event.orderId) ?? [];
      list.push(event);
      map.set(event.orderId, list);
    }
    return map;
  }, [trackingEvents]);

  const logsByOrder = React.useMemo(() => {
    const map = new Map<string, OrderAuditLog[]>();
    for (const log of auditLogs) {
      const list = map.get(log.orderId) ?? [];
      list.push(log);
      map.set(log.orderId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    return map;
  }, [auditLogs]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();

    const list = orders.filter((order) => {
      const orderStatus = statusOf(order);
      if (status !== "ALL" && orderStatus !== status) return false;
      if (zone === "DHAKA_INSIDE" && (order.deliveryZone !== "DHAKA" || order.deliveryCharge === 100)) return false;
      if (zone === "DHAKA_SUB" && (order.deliveryZone !== "DHAKA" || order.deliveryCharge !== 100)) return false;
      if (zone === "OUTSIDE_DHAKA" && order.deliveryZone === "DHAKA") return false;
      if (!needle) return true;
      return (
        order.orderNumber.toLowerCase().includes(needle) ||
        order.customer.name.toLowerCase().includes(needle) ||
        order.customer.phone.includes(needle) ||
        (order.consignmentId ?? "").toLowerCase().includes(needle) ||
        order.items.some((item) => item.sku.toLowerCase().includes(needle))
      );
    });

    return [...list].sort((a, b) =>
      sort === "value"
        ? b.totalAmount - a.totalAmount
        : new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime(),
    );
  }, [orders, query, status, zone, sort, statusOf]);

  const summary = React.useMemo(
    () => ({
      count: filtered.length,
      value: filtered.reduce((sum, order) => sum + order.totalAmount, 0),
      units: filtered.reduce(
        (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
        0,
      ),
    }),
    [filtered],
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

  /** Applies a status change locally, writes an audit entry and persists it. */
  async function changeStatus(order: Order, next: OrderStatus) {
    const previous = statusOf(order);
    if (previous === next) return;

    setOverrides((prev) => ({ ...prev, [order.id]: next }));
    setSelected((prev) => (prev && prev.id === order.id ? { ...prev, status: next } : prev));
    appendSessionLog(order.id, {
      action: "STATUS_CHANGED",
      details: `Status moved ${ORDER_STATUS_META[previous].label} → ${ORDER_STATUS_META[next].label}`,
    });

    try {
      const result = await updateOrderStatusAction(order.id, next, performedBy);
      if (!result.ok) {
        toast.error(result.message || "Could not update the status");
        return;
      }
      toast.success(`Marked as ${ORDER_STATUS_META[next].label}`, {
        description: `${order.orderNumber} · ${order.customer.name}`,
      });
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  /** Pulls the live Pathao parcel status + full tracking history on demand. */
  async function syncPathao(order: Order) {
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
      }
      if (result.events) {
        setTrackingOverrides((prev) => ({ ...prev, [order.id]: result.events! }));
      }
      if (result.orderStatus) {
        setOverrides((prev) => ({ ...prev, [order.id]: result.orderStatus! }));
        setSelected((prev) => (prev && prev.id === order.id ? { ...prev, status: result.orderStatus! } : prev));
      }
      toast.success("Live status refreshed", { description: result.message });
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setRefreshingId(null);
    }
  }

  function appendSessionLog(
    orderId: string,
    entry: { action: string; details: string; performedBy?: string },
  ) {
    setSessionLogs((prev) => ({
      ...prev,
      [orderId]: [
        ...(prev[orderId] ?? []),
        {
          id: `local_${orderId}_${Date.now()}`,
          orderId,
          action: entry.action,
          details: entry.details,
          performedBy: entry.performedBy ?? performedBy,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
  }

  /** Books the given orders with Pathao, updating the UI optimistically. */
  async function bookOrders(ids: string[], description: string): Promise<boolean> {
    if (ids.length === 0) return false;

    setPending(true);
    try {
      const result = await bulkSendToPathaoAction(ids, performedBy);
      if (!result.ok) {
        toast.error(result.message || "Could not queue the consignments");
        return false;
      }

      setOverrides((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = "IN_TRANSIT";
        return next;
      });
      setSelected((prev) =>
        prev && ids.includes(prev.id) ? { ...prev, status: "IN_TRANSIT" } : prev,
      );
      for (const id of ids) {
        appendSessionLog(id, {
          action: "PATHAO_CONSIGNMENT_CREATED",
          details: "Consignment booked with Pathao",
        });
      }

      toast.success(result.message, { description });
      router.refresh();
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  }

  async function sendSelectedToPathao() {
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;
    if (await bookOrders(ids, `${ids.length} order(s) moved to In Transit`)) {
      setCheckedIds(new Set());
    }
  }

  const activeFilterCount =
    (zone !== "ALL" ? 1 : 0) + (sort !== "newest" ? 1 : 0);

  /**
   * Orders that were confirmed (stock deducted) but whose automatic Pathao
   * booking failed, so they still need a consignment. These drive the retry
   * banner and the per-order retry button.
   */
  const unbookedConfirmed = React.useMemo(
    () => orders.filter((order) => statusOf(order) === "CONFIRMED" && !order.consignmentId),
    [orders, statusOf],
  );

  /** Re-books a single order with Pathao and reflects the result optimistically. */
  async function retryBooking(order: Order) {
    setBookingId(order.id);
    try {
      const result = await bookPathaoOrderAction(order.id, performedBy);
      if (!result.ok) {
        toast.error("Pathao booking failed", { description: result.message });
        return;
      }

      const pathaoStatus = result.pathaoStatus ?? "Pickup_Requested";
      setOverrides((prev) => ({ ...prev, [order.id]: "IN_TRANSIT" }));
      setPathaoOverrides((prev) => ({ ...prev, [order.id]: pathaoStatus }));
      setSelected((prev) =>
        prev && prev.id === order.id
          ? {
              ...prev,
              status: "IN_TRANSIT",
              consignmentId: result.consignmentId ?? prev.consignmentId,
              pathaoStatus,
            }
          : prev,
      );
      appendSessionLog(order.id, {
        action: "PATHAO_CONSIGNMENT_CREATED",
        details: `Booked with Pathao — ${result.consignmentId}`,
      });

      toast.success("Booked with Pathao", { description: result.message });
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBookingId(null);
    }
  }

  /** One-click retry for every order whose automatic booking failed. */
  async function retryAllUnbooked() {
    const ids = unbookedConfirmed.map((order) => order.id);
    await bookOrders(ids, `${ids.length} order(s) moved to In Transit`);
  }

  /** Offline backup of the currently filtered order list. */
  function exportCsv() {
    const rows: CsvCell[][] = [
      [
        "Order",
        "Placed",
        "Customer",
        "Phone",
        "Zone",
        "Items",
        "Consignment",
        "Pathao status",
        "Status",
        "Subtotal",
        "Delivery",
        "Discount",
        "Total (BDT)",
      ],
      ...filtered.map((order) => [
        order.orderNumber,
        formatDateTime(order.placedAt),
        order.customer.name,
        order.customer.phone,
        deliveryZoneLabel(order.deliveryZone, order.deliveryCharge),
        order.items.map((item) => `${item.sku} x${item.quantity}`).join(" | "),
        order.consignmentId ?? "",
        order.pathaoStatus ?? "",
        ORDER_STATUS_META[statusOf(order)].label,
        order.subtotal,
        order.deliveryCharge,
        order.discount,
        order.totalAmount,
      ]),
    ];
    downloadCsv(`itech-case-bd-orders-${Date.now()}.csv`, toCsv(rows));
    toast.success("Orders exported", { description: `${filtered.length} filtered order(s) as CSV` });
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by phone, order ID or customer name…"
                className="pl-9"
                aria-label="Search orders"
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

            <Select value={zone} onValueChange={setZone}>
              <SelectTrigger className="w-[132px]">
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All zones</SelectItem>
                {DELIVERY_ZONES.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              className="h-10 sm:h-9"
              onClick={() => setSort((prev) => (prev === "newest" ? "value" : "newest"))}
            >
              <ArrowUpDown className="h-4 w-4" />
              {sort === "newest" ? "Newest" : "Value"}
            </Button>

            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-muted-foreground"
                onClick={() => {
                  setZone("ALL");
                  setSort("newest");
                }}
              >
                <X className="h-4 w-4" /> Clear ({activeFilterCount})
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="ml-auto hidden h-9 sm:inline-flex"
              onClick={exportCsv}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button size="sm" className="h-10 sm:h-9" onClick={() => router.push("/orders/create")}>
              <Package className="h-4 w-4" /> New
            </Button>
          </div>

          <Tabs value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
              {STATUS_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="h-10 sm:h-7">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShoppingBag className="h-3.5 w-3.5" />
              <strong className="font-semibold text-foreground tabular">{formatNumber(summary.count)}</strong> orders
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              <strong className="font-semibold text-foreground tabular">{formatBDT(summary.value)}</strong> value
            </span>
            <span className="tabular">{formatNumber(summary.units)} units</span>
          </div>
        </div>
      </Card>

      {/* Auto-booking retry banner */}
      <AnimatePresence initial={false}>
        {unbookedConfirmed.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/70 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-medium text-amber-900 dark:text-amber-200">
              {unbookedConfirmed.length} order{unbookedConfirmed.length > 1 ? "s" : ""} still need a Pathao
              consignment — the automatic booking did not go through. Stock is already deducted.
            </span>
            <Button
              size="sm"
              variant="success"
              className="ml-auto"
              disabled={pending}
              onClick={retryAllUnbooked}
            >
              <Truck className="h-4 w-4" />
              {pending ? "Booking…" : "Retry booking"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

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
            <Button size="sm" variant="success" disabled={pending} onClick={sendSelectedToPathao}>
              <Send className="h-4 w-4" />
              {pending ? "Booking…" : "Send to Pathao"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCheckedIds(new Set())}>
              Clear selection
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop table */}
      <Card className="hidden overflow-hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAllVisible}
                  aria-label="Select all visible orders"
                />
              </TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead>Pathao</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((order) => {
              const orderStatus = statusOf(order);
              return (
                <TableRow
                  key={order.id}
                  className="cursor-pointer"
                  data-state={checkedIds.has(order.id) ? "selected" : undefined}
                  onClick={() => setSelected(order)}
                >
                  <TableCell className="w-10" onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      checked={checkedIds.has(order.id)}
                      onCheckedChange={() => toggleOne(order.id)}
                      aria-label={`Select ${order.orderNumber}`}
                    />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{order.orderNumber}</p>
                    <p className="text-[11px] text-muted-foreground">{formatRelative(order.placedAt)}</p>
                  </TableCell>
                  <TableCell>
                    <p className="truncate text-sm">{order.customer.name}</p>
                    <p className="text-[11px] text-muted-foreground">{formatPhone(order.customer.phone)}</p>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {deliveryZoneLabel(order.deliveryZone, order.deliveryCharge)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {order.consignmentId ? (
                      <div>
                        <p className="text-xs font-medium">{order.consignmentId}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {PATHAO_STATUS_META[order.pathaoStatus ?? ""]?.label ?? order.pathaoStatus}
                        </p>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Not booked</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <p className="font-semibold tabular">{formatBDT(order.totalAmount)}</p>
                    <p className="text-[11px] text-muted-foreground tabular">
                      {order.items.length} item{order.items.length > 1 ? "s" : ""}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={orderStatus} />
                      {orderStatus === "DELIVERED" && (
                        <CodCollectionBadge settled={order.isPaymentSettled} />
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
            icon={ShoppingBag}
            title="No orders match these filters"
            description="Try clearing the search or switching the status tab."
          />
        )}
      </Card>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        <AnimatePresence initial={false}>
          {filtered.map((order) => (
            <motion.div
              key={order.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className={cn(
                "flex items-start gap-3 rounded-xl border bg-card p-3 shadow-card",
                checkedIds.has(order.id) ? "border-primary/50 bg-primary/5" : "border-border",
              )}
            >
              <Checkbox
                className="mt-1"
                checked={checkedIds.has(order.id)}
                onCheckedChange={() => toggleOne(order.id)}
                aria-label={`Select ${order.orderNumber}`}
              />
              <button
                type="button"
                onClick={() => setSelected(order)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{order.orderNumber}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {order.customer.name} · {formatPhone(order.customer.phone)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={statusOf(order)} />
                    {statusOf(order) === "DELIVERED" && (
                      <CodCollectionBadge settled={order.isPaymentSettled} />
                    )}
                  </div>
                </div>
                <Separator className="my-2.5" />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="muted" className="gap-1">
                      <MapPin className="h-3 w-3" />
                      {deliveryZoneLabel(order.deliveryZone, order.deliveryCharge)}
                    </Badge>
                    {order.consignmentId && (
                      <Badge variant="secondary" className="gap-1">
                        <Truck className="h-3 w-3" />
                        {order.consignmentId.slice(-3)}
                      </Badge>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular">
                    {formatBDT(order.totalAmount)}
                  </span>
                </div>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        {filtered.length === 0 && (
          <Card>
            <EmptyState
              icon={ShoppingBag}
              title="No orders match these filters"
              description="Try clearing the search or switching the status tab."
            />
          </Card>
        )}
      </div>

      {/* Detail drawer */}
      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-full max-w-md gap-0 overflow-y-auto p-0 scrollbar-thin">
          {selected && (
            <>
              <SheetHeader className="border-b border-border pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle>{selected.orderNumber}</SheetTitle>
                  <StatusBadge status={statusOf(selected)} />
                  {statusOf(selected) === "DELIVERED" && (
                    <CodCollectionBadge settled={selected.isPaymentSettled} />
                  )}
                </div>
                <SheetDescription>
                  Placed {formatDateTime(selected.placedAt)} · by {selected.createdByName}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-3">
                  <DetailTile label="Delivery zone">
                    <span className="text-sm font-medium">
                      {deliveryZoneLabel(selected.deliveryZone, selected.deliveryCharge)}
                    </span>
                  </DetailTile>
                  <DetailTile label="Courier">
                    <span className="text-sm font-medium">{selected.courierName}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {selected.consignmentId ?? "Not booked yet"}
                    </span>
                  </DetailTile>
                  <DetailTile label="Payment">
                    <Badge variant={selected.isPaymentSettled ? "success" : "warning"}>
                      {selected.isPaymentSettled ? "Settled" : "Unsettled"}
                    </Badge>
                  </DetailTile>
                </div>

                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5 text-primary" />
                      <p className="text-xs font-semibold">Pathao status</p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                        pathaoStatusMeta(pathaoStatusOf(selected))?.className ?? "bg-muted text-muted-foreground ring-border"
                      }`}
                    >
                      {pathaoStatusMeta(pathaoStatusOf(selected))?.label ?? "Not booked"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Status is driven by Pathao — it updates automatically via the webhook and the
                    Sync button. Booking the parcel in the Courier Hub starts the tracking.
                  </p>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold">Customer</p>
                  <p className="mt-1 text-sm font-medium">{selected.customer.name}</p>
                  <p className="text-xs text-muted-foreground">{formatPhone(selected.customer.phone)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selected.customer.address}</p>
                  <div className="mt-2 flex gap-2 text-[11px] text-muted-foreground">
                    <span>{selected.customer.totalOrders} orders</span>
                    <span>·</span>
                    <span>{selected.customer.deliveredCount} delivered</span>
                    <span>·</span>
                    <span>{selected.customer.returnedCount} returned</span>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold">Items</p>
                  <div className="space-y-2">
                    {selected.items.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 p-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{item.productName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {item.variantName} · {item.sku}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs font-semibold tabular">
                            {formatBDT(item.unitPrice * item.quantity)}
                          </p>
                          <p className="text-[11px] text-muted-foreground tabular">
                            {item.quantity} × {formatBDT(item.unitPrice)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <PackingSlipBlock order={selected} />

                <div className="space-y-1.5 rounded-lg border border-border p-3 text-sm">
                  <Row label="Subtotal" value={formatBDT(selected.subtotal)} />
                  {selected.discount > 0 && (
                    <Row label="Discount" value={`- ${formatBDT(selected.discount)}`} className="text-emerald-600" />
                  )}
                  <Row label="Delivery charge" value={formatBDT(selected.deliveryCharge)} />
                  {selected.courierFee > 0 && (
                    <Row label="Courier fee" value={`- ${formatBDT(selected.courierFee)}`} className="text-muted-foreground" />
                  )}
                  <Separator className="my-1.5" />
                  <Row label="Total payable" value={formatBDT(selected.totalAmount)} strong />
                </div>

                {selected.note && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/15">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Note</p>
                    <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">{selected.note}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {statusOf(selected) === "CONFIRMED" && !selected.consignmentId && (
                    <Button
                      size="sm"
                      variant="success"
                      disabled={bookingId === selected.id}
                      onClick={() => retryBooking(selected)}
                    >
                      <Truck className="h-4 w-4" />
                      {bookingId === selected.id ? "Booking…" : "Book with Pathao"}
                    </Button>
                  )}
                  {!["CANCELLED", "DELIVERED", "RETURNED"].includes(statusOf(selected)) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                      onClick={() => changeStatus(selected, "CANCELLED")}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toast.info("Customer will be dialled", { description: formatPhone(selected.customer.phone) })}
                  >
                    Call customer
                  </Button>
                </div>

                <PathaoTimeline
                  consignmentId={selected.consignmentId}
                  pathaoStatus={pathaoStatusOf(selected)}
                  events={trackingOverrides[selected.id] ?? trackingByOrder.get(selected.id) ?? []}
                  refreshing={refreshingId === selected.id}
                  onRefresh={() => syncPathao(selected)}
                />

                <AuditTimeline
                  order={selected}
                  logs={[
                    ...(logsByOrder.get(selected.id) ?? []),
                    ...(sessionLogs[selected.id] ?? []),
                  ]}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Read-only, 1-click-copy packing slip: Order ID · Merchant Order ID · Model/Cover/Colour. */
function PackingSlipBlock({ order }: { order: Order }) {
  const slip = orderPackingSlipText(order);
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(slip);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("Packing slip copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Packing slip</p>
        <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-2.5 font-mono text-[11px] leading-relaxed">
        {slip}
      </pre>
    </div>
  );
}

/** Vertical, read-only trail of every action taken on an order. */
function AuditTimeline({ order, logs }: { order: Order; logs: OrderAuditLog[] }) {
  const entries = logs.length > 0 ? logs : synthesizeTimeline(order);

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-3 flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold">Order audit log</p>
        <Badge variant="muted" className="ml-auto gap-1 text-[10px]">
          <Lock className="h-3 w-3" /> Immutable
        </Badge>
      </div>
      <ol className="relative space-y-3 border-l border-border pl-4">
        {entries.map((entry) => {
          const meta = AUDIT_ACTION_META[entry.action] ?? DEFAULT_AUDIT_META;
          const Icon = meta.icon;
          return (
            <li key={entry.id} className="relative">
              <span
                className={cn(
                  "absolute -left-[26px] flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-inset",
                  meta.tone,
                )}
              >
                <Icon className="h-3 w-3" />
              </span>
              <p className="text-xs font-medium">{meta.label}</p>
              <p className="text-[11px] text-muted-foreground">{entry.details}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {entry.performedBy} · {formatDateTime(entry.createdAt)}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Derives a baseline trail for orders created before audit logging existed. */
function synthesizeTimeline(order: Order): OrderAuditLog[] {
  const entries: OrderAuditLog[] = [
    {
      id: `${order.id}-created`,
      orderId: order.id,
      action: "ORDER_CREATED",
      details: `${order.orderNumber} created for ${order.customer.name}`,
      performedBy: order.createdByName,
      createdAt: order.placedAt,
    },
  ];

  if (order.status !== "PLACED") {
    entries.push({
      id: `${order.id}-status`,
      orderId: order.id,
      action: "STATUS_CHANGED",
      details: `Status moved Placed → ${ORDER_STATUS_META[order.status].label}`,
      performedBy: order.createdByName,
      createdAt: order.updatedAt,
    });
  }

  if (order.consignmentId) {
    entries.push({
      id: `${order.id}-pathao`,
      orderId: order.id,
      action: "PATHAO_CONSIGNMENT_CREATED",
      details: `Consignment ${order.consignmentId} booked with Pathao (${deliveryZoneLabel(order.deliveryZone, order.deliveryCharge)})`,
      performedBy: "Pathao",
      createdAt: order.updatedAt,
    });
  }

  return entries;
}

function DetailTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** COD collection state for delivered parcels (source: Database 3 ledger sync). */
function CodCollectionBadge({ settled }: { settled: boolean }) {
  return (
    <Badge variant={settled ? "success" : "warning"} className="gap-1">
      {settled ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {settled ? "COD Collected" : "COD Pending"}
    </Badge>
  );
}

function Row({
  label,
  value,
  strong,
  className,
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <span className={cn("text-xs text-muted-foreground", strong && "text-sm font-medium text-foreground")}>
        {label}
      </span>
      <span className={cn("tabular", strong ? "text-base font-semibold" : "text-xs")}>{value}</span>
    </div>
  );
}
