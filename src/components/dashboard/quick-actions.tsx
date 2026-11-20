"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Printer, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bulkSendToPathaoAction } from "@/lib/actions/orders";
import { formatNumber } from "@/lib/format";

interface QuickActionsProps {
  /** Confirmed orders that have not been booked with Pathao yet. */
  pathaoReadyIds: string[];
  performedBy: string;
}

/** One-tap shortcuts for the most common desk tasks. */
export function QuickActions({ pathaoReadyIds, performedBy }: QuickActionsProps) {
  const router = useRouter();
  const [isPending, setIsPending] = React.useState(false);

  async function bulkSend() {
    if (pathaoReadyIds.length === 0) {
      toast.info("Nothing to send", {
        description: "No confirmed orders are waiting for a Pathao consignment.",
      });
      return;
    }

    setIsPending(true);
    try {
      const result = await bulkSendToPathaoAction(pathaoReadyIds, performedBy);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" className="h-10 sm:h-9">
        <a href="/orders/create">
          <Plus className="h-4 w-4" /> New Order
        </a>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 sm:h-9"
        onClick={bulkSend}
        disabled={isPending}
      >
        <Truck className="h-4 w-4" />
        {isPending ? "Sending…" : "Bulk Send to Pathao"}
        {pathaoReadyIds.length > 0 && (
          <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary tabular">
            {formatNumber(pathaoReadyIds.length)}
          </span>
        )}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 sm:h-9"
        onClick={() => window.print()}
      >
        <Printer className="h-4 w-4" /> Print Packing List
      </Button>
    </div>
  );
}
