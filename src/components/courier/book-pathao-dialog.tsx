"use client";

import * as React from "react";
import { AlertTriangle, Loader2, MapPin, Route, Sparkles, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { bookPathaoOrderAction, type BookingResult } from "@/lib/actions/courier";
import { listCachedCities, listCachedZones, matchPathaoLocation } from "@/lib/couriers/pathao-locations";
import { PATHAO_DEFAULT_ITEM_WEIGHT } from "@/lib/constants";
import { formatBDT, formatPhone } from "@/lib/format";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

interface BookPathaoDialogProps {
  order: Order;
  performedBy: string;
  pickupStoreName: string | null;
  trigger: React.ReactNode;
  onBooked: (result: BookingResult) => void;
}

function confidenceTone(confidence: number, needsReview: boolean) {
  if (needsReview) return "warning" as const;
  if (confidence >= 0.9) return "success" as const;
  return "secondary" as const;
}

/** Books a single Confirmed order to Pathao with auto-mapped city/zone overrides. */
export function BookPathaoDialog({
  order,
  performedBy,
  pickupStoreName,
  trigger,
  onBooked,
}: BookPathaoDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [address, setAddress] = React.useState(order.customer.address);
  const [phone, setPhone] = React.useState(order.customer.phone);
  const [weight, setWeight] = React.useState(String(PATHAO_DEFAULT_ITEM_WEIGHT));
  const [quantity, setQuantity] = React.useState(
    String(order.items.reduce((sum, item) => sum + item.quantity, 0) || 1),
  );
  const [cityOverride, setCityOverride] = React.useState<number | null>(null);
  const [zoneOverride, setZoneOverride] = React.useState<number | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; fieldErrors?: Record<string, string[]> } | null>(
    null,
  );

  const match = React.useMemo(
    () => matchPathaoLocation(address, order.deliveryZone),
    [address, order.deliveryZone],
  );
  const cities = React.useMemo(() => listCachedCities(), []);

  const effectiveCityId = cityOverride ?? match.cityId;
  const zones = React.useMemo(() => listCachedZones(effectiveCityId), [effectiveCityId]);
  const effectiveZoneId =
    zoneOverride ??
    (effectiveCityId === match.cityId ? match.zoneId : zones[0]?.zoneId ?? match.zoneId);

  const itemDescription = order.items
    .map((item) => `${item.productName} - ${item.variantName} (x${item.quantity})`)
    .join(", ");

  function resetToAuto() {
    setCityOverride(null);
    setZoneOverride(null);
  }

  async function handleBook() {
    setPending(true);
    setError(null);
    try {
      const result = await bookPathaoOrderAction(order.id, performedBy, {
        cityId: effectiveCityId,
        zoneId: effectiveZoneId,
        address,
        phone,
        weight: Number(weight) || PATHAO_DEFAULT_ITEM_WEIGHT,
        quantity: Number(quantity) || undefined,
      });

      if (!result.ok) {
        setError({ message: result.message, fieldErrors: result.fieldErrors });
        toast.error("Pathao rejected the booking", { description: result.message });
        return;
      }

      toast.success("Consignment booked", {
        description: `${result.consignmentId} · fee ${formatBDT(result.deliveryFee ?? 0)}`,
      });
      onBooked(result);
      setOpen(false);
    } catch (caught) {
      const message = (caught as Error).message;
      setError({ message });
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" /> Book with Pathao
          </DialogTitle>
          <DialogDescription>
            {order.orderNumber} · {order.customer.name} · {formatBDT(order.totalAmount)} COD
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!pickupStoreName && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                No pickup store selected. Choose one in the{" "}
                <a href="/couriers" className="font-semibold underline">
                  Courier API Hub
                </a>{" "}
                before booking.
              </span>
            </div>
          )}

          {/* Address auto-mapper */}
          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center gap-2">
              <Route className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-semibold">City / Zone auto-mapper</p>
              <Badge
                variant={confidenceTone(match.confidence, match.needsReview)}
                className="ml-auto gap-1 text-[10px]"
              >
                <Sparkles className="h-3 w-3" />
                {match.needsReview ? "Needs review" : `${Math.round(match.confidence * 100)}% match`}
              </Badge>
            </div>

            <div className="space-y-2">
              <Textarea
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value);
                  setZoneOverride(null);
                }}
                rows={2}
                className="text-xs"
                aria-label="Recipient address"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Pathao City</Label>
                  <Select
                    value={String(effectiveCityId)}
                    onValueChange={(value) => {
                      setCityOverride(Number(value));
                      setZoneOverride(null);
                    }}
                  >
                    <SelectTrigger className="h-10 text-xs sm:h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map((city) => (
                        <SelectItem key={city.cityId} value={String(city.cityId)}>
                          {city.cityName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Pathao Zone</Label>
                  <Select value={String(effectiveZoneId)} onValueChange={(value) => setZoneOverride(Number(value))}>
                    <SelectTrigger className="h-10 text-xs sm:h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {zones.map((zone) => (
                        <SelectItem key={zone.zoneId} value={String(zone.zoneId)}>
                          {zone.zoneName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {match.needsReview
                    ? `Guessed ${match.cityName} · ${match.zoneName} — please confirm`
                    : `Matched ${match.cityName} · ${match.zoneName}`}
                </p>
                {(cityOverride !== null || zoneOverride !== null) && (
                  <button
                    type="button"
                    onClick={resetToAuto}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Reset to auto
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Recipient + parcel */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor={`phone-${order.id}`} className="text-xs font-semibold">
                Recipient phone
              </Label>
              <Input
                id={`phone-${order.id}`}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="01XXXXXXXXX"
                inputMode="tel"
                className={cn(error?.fieldErrors?.recipient_phone && "border-rose-300 focus-visible:ring-rose-300")}
              />
              {error?.fieldErrors?.recipient_phone && (
                <p className="text-[11px] text-rose-600">{error.fieldErrors.recipient_phone[0]}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`weight-${order.id}`} className="text-xs font-semibold">
                Weight (kg)
              </Label>
              <Input
                id={`weight-${order.id}`}
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`qty-${order.id}`} className="text-xs font-semibold">
                Quantity
              </Label>
              <Input
                id={`qty-${order.id}`}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Recipient</span>
              <span className="font-medium">
                {order.customer.name} · {formatPhone(phone)}
              </span>
            </div>
            <Separator className="my-2" />
            <div className="flex items-start justify-between gap-4">
              <span className="shrink-0 text-muted-foreground">Item description</span>
              <span className="text-right font-medium">{itemDescription}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Amount to collect (COD)</span>
              <span className="text-base font-semibold text-emerald-600">{formatBDT(order.totalAmount)}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Pickup store</span>
              <span className="font-medium">{pickupStoreName ?? "Not selected"}</span>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Pathao validation error</p>
                <p className="mt-0.5">{error.message}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleBook} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
            {pending ? "Booking…" : "Book consignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
