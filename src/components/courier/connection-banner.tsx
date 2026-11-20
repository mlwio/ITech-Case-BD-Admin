import Link from "next/link";
import { AlertTriangle, BadgeCheck, PlugZap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CourierCredentialPublic } from "@/lib/types";

/**
 * Tells the operator at a glance whether Pathao is wired up — and nudges them
 * to the Courier API Hub when it isn't, since nothing can be booked without it.
 */
export function PathaoConnectionBanner({
  credential,
  queued,
}: {
  credential: CourierCredentialPublic;
  queued: number;
}) {
  const connected = Boolean(credential.hasAccessToken || credential.lastTestStatus === "SUCCESS");

  if (connected) {
    return (
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 border-emerald-200 bg-emerald-50/60 p-3 text-xs sm:p-4">
        <span className="flex items-center gap-2 font-medium text-emerald-800">
          <BadgeCheck className="h-4 w-4" /> Pathao connected
        </span>
        <Badge variant={credential.environment === "PRODUCTION" ? "success" : "warning"}>
          {credential.environment === "PRODUCTION" ? "Production" : "Sandbox"}
        </Badge>
        <span className="text-emerald-800/80">
          Pickup store: <strong className="font-semibold">{credential.pickupStoreName ?? "not selected"}</strong>
        </span>
        <span className="text-emerald-800/80 tabular">{queued} parcels ready to book</span>
        <Button size="sm" variant="outline" className="ml-auto h-8" asChild>
          <Link href="/couriers" prefetch>
            <PlugZap className="h-3.5 w-3.5" /> Manage connection
          </Link>
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 border-amber-200 bg-amber-50/70 p-3 text-xs sm:p-4">
      <span className="flex items-center gap-2 font-medium text-amber-900">
        <AlertTriangle className="h-4 w-4" /> Pathao is not connected yet
      </span>
      <span className="text-amber-900/80">
        Add your merchant credentials and sync pickup stores before booking parcels.
      </span>
      <Button size="sm" className="ml-auto h-8" asChild>
        <Link href="/couriers" prefetch>
          <PlugZap className="h-3.5 w-3.5" /> Open Courier API Hub
        </Link>
      </Button>
    </Card>
  );
}
