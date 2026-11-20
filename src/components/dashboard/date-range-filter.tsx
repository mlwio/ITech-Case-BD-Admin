"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarRange, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORDER_RANGE_PRESETS, type RangeKey } from "@/lib/date-range";
import type { ShopOption } from "@/components/layout/shop-switcher";
import { cn } from "@/lib/utils";

interface DateRangeFilterProps {
  range: RangeKey;
  /** `YYYY-MM-DD` values used when the Custom preset is active. */
  from: string;
  to: string;
  shopId: string;
  shops: ShopOption[];
  /** Route the filter navigates to. Defaults to the dashboard. */
  basePath?: string;
}

/**
 * Dashboard filter bar — date-range presets (with a custom window) and the
 * shop selector. State lives in the URL so the server component re-renders with
 * the new window.
 */
export function DateRangeFilter({ range, from, to, shopId, shops, basePath = "/" }: DateRangeFilterProps) {
  const router = useRouter();
  const [customFrom, setCustomFrom] = React.useState(from);
  const [customTo, setCustomTo] = React.useState(to);

  const navigate = React.useCallback(
    (next: { range?: RangeKey; from?: string; to?: string; shop?: string }) => {
      const nextRange = next.range ?? range;
      const params = new URLSearchParams();
      params.set("range", nextRange);

      if (nextRange === "CUSTOM") {
        const nextFrom = next.from ?? customFrom;
        const nextTo = next.to ?? customTo;
        if (nextFrom) params.set("from", nextFrom);
        if (nextTo) params.set("to", nextTo);
      }

      const nextShop = next.shop ?? shopId;
      if (nextShop) params.set("shop", nextShop);

      router.push(`${basePath}?${params.toString()}`);
    },
    [range, customFrom, customTo, shopId, basePath, router],
  );

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-muted/70 p-1">
        {ORDER_RANGE_PRESETS.map((preset) => {
          const active = preset.key === range;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => navigate({ range: preset.key })}
              className={cn(
                "relative whitespace-nowrap rounded-lg px-3 py-2.5 text-xs font-medium transition-colors sm:py-1.5",
                active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="dashboard-range-pill"
                  className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {preset.key === "CUSTOM" && <CalendarRange className="h-3.5 w-3.5" />}
                {preset.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {range === "CUSTOM" && (
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="range-from" className="text-[10px] text-muted-foreground">
                From
              </Label>
              <Input
                id="range-from"
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(event) => setCustomFrom(event.target.value)}
                className="h-10 w-[140px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="range-to" className="text-[10px] text-muted-foreground">
                To
              </Label>
              <Input
                id="range-to"
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(event) => setCustomTo(event.target.value)}
                className="h-10 w-[140px]"
              />
            </div>
            <Button size="sm" className="h-10 sm:h-9" onClick={() => navigate({ range: "CUSTOM" })}>
              Apply
            </Button>
          </div>
        )}

        <Select value={shopId} onValueChange={(value) => navigate({ shop: value })}>
          <SelectTrigger className="h-10 w-[190px] sm:h-9">
            <Store className="h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Shop" />
          </SelectTrigger>
          <SelectContent>
            {shops.map((shop) => (
              <SelectItem key={shop.id} value={shop.id}>
                {shop.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
