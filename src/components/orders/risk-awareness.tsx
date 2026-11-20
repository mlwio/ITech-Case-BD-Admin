"use client";

import { AlertTriangle, CheckCircle2, Clock3, PackageX, RotateCcw, ShieldAlert, ShieldCheck, ShieldX, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_META } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import type { DeliveryStats, DuplicateHit, RiskAssessment } from "@/lib/risk";
import { cn } from "@/lib/utils";

const TONE_VARIANT: Record<RiskAssessment["tone"], "success" | "warning" | "destructive" | "muted"> = {
  success: "success",
  warning: "warning",
  destructive: "destructive",
  muted: "muted",
};

/** Local fraud / courier risk read-out for the phone currently on the form. */
export function RiskBadge({ assessment }: { assessment: RiskAssessment | null }) {
  if (!assessment) return null;

  const Icon =
    assessment.level === "risk"
      ? ShieldX
      : assessment.level === "watch" || assessment.level === "new"
        ? ShieldAlert
        : ShieldCheck;

  const closed = assessment.delivered + assessment.returned + assessment.cancelled;
  const notReceived = assessment.returned + assessment.cancelled;

  const detail =
    assessment.totalParcels === 0
      ? "No order history in this shop yet"
      : closed === 0
        ? `${assessment.totalParcels} order${assessment.totalParcels === 1 ? "" : "s"} · no completed delivery yet`
        : `Received ${assessment.delivered} · Not received ${notReceived} · ${assessment.successRate}% success`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={TONE_VARIANT[assessment.tone]} className="gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        {assessment.label}
      </Badge>
      <span className="text-[10px] text-muted-foreground">{detail}</span>
    </div>
  );
}

/** Pathao delivery breakdown shown once a customer phone is on the order form. */
export function DeliveryHistoryPanel({ stats }: { stats: DeliveryStats | null }) {
  if (!stats) return null;

  const tiles = [
    {
      key: "total",
      label: "Total parcels",
      value: stats.total,
      icon: Truck,
      tone: "bg-slate-50 text-slate-700 dark:bg-slate-500/15 dark:text-slate-200",
    },
    {
      key: "received",
      label: "Received",
      value: stats.delivered,
      icon: CheckCircle2,
      tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    },
    {
      key: "not-received",
      label: "Not received",
      value: stats.notReceived,
      icon: PackageX,
      tone: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    },
    {
      key: "returned",
      label: "Returned",
      value: stats.returned,
      icon: RotateCcw,
      tone: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <Truck className="h-3.5 w-3.5 text-primary" />
          Pathao delivery history
        </p>
        {stats.total > 0 && (
          <Badge
            variant={stats.successRate >= 85 ? "success" : stats.successRate >= 60 ? "warning" : "destructive"}
            className="tabular"
          >
            {stats.successRate}% success
          </Badge>
        )}
      </div>

      {stats.total === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          First-time buyer — no order history for this number in your shop yet.
        </p>
      ) : (
        <>
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <div key={tile.key} className="rounded-lg border border-border bg-card p-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", tile.tone)}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {tile.label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-lg font-semibold tabular">{formatNumber(tile.value)}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            In transit {formatNumber(stats.inTransit)} · Still pending {formatNumber(stats.pending)}
            {stats.cancelled > 0 ? ` · Cancelled ${formatNumber(stats.cancelled)}` : ""}
          </p>
        </>
      )}
    </div>
  );
}

/** Amber warning shown when the same number ordered again inside 72 hours. */
export function DuplicateOrderAlert({ hits }: { hits: DuplicateHit[] }) {
  if (hits.length === 0) return null;

  return (
    <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5" />
        Possible duplicate order
      </p>
      <p className="text-[11px] text-amber-900">
        This number already placed {hits.length} order{hits.length === 1 ? "" : "s"} in the last 72 hours.
      </p>
      <div className="space-y-1">
        {hits.slice(0, 3).map((hit) => (
          <div
            key={hit.orderNumber}
            className={cn("flex items-center justify-between gap-2 text-[11px] text-amber-900")}
          >
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Clock3 className="h-3 w-3" />
              {hit.orderNumber} · {hit.hoursAgo}h ago
            </span>
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", ORDER_STATUS_META[hit.status].className)}>
              {ORDER_STATUS_META[hit.status].label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
