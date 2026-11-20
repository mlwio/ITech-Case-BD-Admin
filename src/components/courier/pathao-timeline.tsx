"use client";

import * as React from "react";
import { Check, Copy, Loader2, MapPin, RefreshCw, Truck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PATHAO_LIFECYCLE_STEPS, pathaoLifecycleStepsFor, pathaoStatusMeta } from "@/lib/constants";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { ParcelTrackingEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PathaoTimelineProps {
  consignmentId: string | null;
  pathaoStatus: string | null;
  events: ParcelTrackingEvent[];
  onRefresh?: () => void;
  refreshing?: boolean;
  className?: string;
}

const CANONICAL = PATHAO_LIFECYCLE_STEPS.map((step) => step.status);

/**
 * A-to-Z Pathao parcel state timeline.
 *
 * Renders the canonical lifecycle as a vertical stepper, marks everything the
 * parcel has already passed, then appends any non-happy-path states (returns,
 * partial delivery, settlement) plus the immutable raw event log.
 */
export function PathaoTimeline({
  consignmentId,
  pathaoStatus,
  events,
  onRefresh,
  refreshing = false,
  className,
}: PathaoTimelineProps) {
  const [copied, setCopied] = React.useState(false);

  const { steps, timeline } = React.useMemo(() => {
    const sorted = [...events].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );

    const firstByStatus = new Map<string, ParcelTrackingEvent>();
    for (const event of sorted) {
      if (!firstByStatus.has(event.status)) firstByStatus.set(event.status, event);
    }

    const reached = sorted.length > 0 ? Array.from(firstByStatus.keys()) : pathaoLifecycleStepsFor(pathaoStatus);
    const reachedSet = new Set(reached);

    const canonical = CANONICAL.filter((status) => reachedSet.has(status));
    const extras = reached.filter((status) => !CANONICAL.includes(status));
    const ordered = [...canonical, ...extras];

    const current = ordered[ordered.length - 1] ?? null;

    return {
      steps: ordered,
      timeline: { firstByStatus, current, sorted },
    };
  }, [events, pathaoStatus]);

  const currentMeta = pathaoStatusMeta(timeline.current);

  async function copyConsignment() {
    if (!consignmentId) return;
    try {
      await navigator.clipboard.writeText(consignmentId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("Consignment ID copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  }

  if (!consignmentId) {
    return (
      <div className={cn("rounded-lg border border-dashed border-border p-4 text-center", className)}>
        <Truck className="mx-auto h-5 w-5 text-muted-foreground" />
        <p className="mt-1.5 text-xs font-medium">No consignment yet</p>
        <p className="text-[11px] text-muted-foreground">
          Book this order with Pathao to start tracking its journey.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border p-3", className)}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Truck className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold">Pathao live tracking</p>
        <button
          type="button"
          onClick={copyConsignment}
          className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          title="Copy consignment ID"
        >
          {consignmentId}
          {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {currentMeta && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                currentMeta.className,
              )}
            >
              {currentMeta.label}
            </span>
          )}
          {onRefresh && (
            <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Refresh Live Status
            </Button>
          )}
        </div>
      </div>

      <ol className="relative space-y-3 border-l border-border pl-4">
        {steps.map((status) => {
          const event = timeline.firstByStatus.get(status);
          const meta = pathaoStatusMeta(status);
          const isCurrent = status === timeline.current;
          const isTerminal = ["Delivered", "Returned", "Partial_Delivery", "Payment_Invoice", "Cancelled"].includes(
            status,
          );
          return (
            <li key={status} className="relative">
              <span
                className={cn(
                  "absolute -left-[26px] flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-inset",
                  isCurrent
                    ? isTerminal && status !== "Delivered" && status !== "Payment_Invoice"
                      ? "bg-orange-50 text-orange-600 ring-orange-500/30"
                      : "bg-emerald-50 text-emerald-600 ring-emerald-500/30"
                    : "bg-muted text-muted-foreground ring-border",
                )}
              >
                {isCurrent ? <MapPin className="h-3 w-3" /> : <Check className="h-3 w-3" />}
              </span>
              <p className={cn("text-xs", isCurrent ? "font-semibold" : "font-medium")}>
                {meta?.label ?? status.replace(/_/g, " ")}
              </p>
              {event ? (
                <p className="text-[10px] text-muted-foreground">
                  {formatDateTime(event.occurredAt)}
                  {event.message ? ` · ${event.message}` : ""}
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">Awaiting Pathao update</p>
              )}
            </li>
          );
        })}
      </ol>

      {timeline.sorted.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Raw event log
          </p>
          <div className="space-y-1">
            {[...timeline.sorted].reverse().slice(0, 6).map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 text-[11px]">
                <span className="truncate text-muted-foreground">
                  <Badge variant="muted" className="mr-1.5 px-1.5 py-0 text-[9px]">
                    {event.source}
                  </Badge>
                  {pathaoStatusMeta(event.status)?.label ?? event.status}
                </span>
                <span className="shrink-0 text-muted-foreground">{formatRelative(event.occurredAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
