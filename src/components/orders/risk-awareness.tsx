"use client";

import { AlertTriangle, Clock3, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_META } from "@/lib/constants";
import type { DuplicateHit, RiskAssessment } from "@/lib/risk";
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
