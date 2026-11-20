"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  History,
  Minus,
  PackageCheck,
  PackageX,
  Plus,
  RefreshCw,
  Search,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { FadeIn } from "@/components/shared/motion";
import { adjustStockAction } from "@/lib/actions/orders";
import { buildInventoryMatrix, type InventoryCellVariant } from "@/lib/inventory";
import { colorHex } from "@/lib/catalog-meta";
import { INVENTORY_MOVEMENT_META, LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { formatBDT, formatNumber, formatRelative } from "@/lib/format";
import type { InventoryMovement, InventoryMovementReason, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

interface InventoryViewProps {
  products: Product[];
  movements: InventoryMovement[];
  performedBy: string;
  canViewCosts: boolean;
}

export function InventoryView({ products, movements, performedBy, canViewCosts }: InventoryViewProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [lowOnly, setLowOnly] = React.useState(false);
  /** Optimistic stock overrides keyed by variant id. */
  const [stock, setStock] = React.useState<Record<string, number>>({});
  const [localMovements, setLocalMovements] = React.useState<InventoryMovement[]>([]);
  const [target, setTarget] = React.useState<InventoryCellVariant | null>(null);

  const matrix = React.useMemo(() => buildInventoryMatrix(products), [products]);

  const qtyOf = React.useCallback(
    (variant: { id: string; stockQty: number }) => stock[variant.id] ?? variant.stockQty,
    [stock],
  );

  const variants = matrix.allVariants;
  const totalUnits = variants.reduce((sum, variant) => sum + qtyOf(variant), 0);
  const stockValue = variants.reduce((sum, variant) => sum + qtyOf(variant) * variant.costPrice, 0);
  const retailValue = variants.reduce((sum, variant) => sum + qtyOf(variant) * variant.sellingPrice, 0);

  const isLow = (variant: InventoryCellVariant) => {
    const qty = qtyOf(variant);
    return qty > 0 && qty <= (variant.lowStockThreshold || LOW_STOCK_THRESHOLD);
  };
  const isOut = (variant: InventoryCellVariant) => qtyOf(variant) <= 0;

  const lowCount = variants.filter(isLow).length;
  const outCount = variants.filter(isOut).length;

  const needle = query.trim().toLowerCase();
  const rows = matrix.rows.filter((row) => {
    if (lowOnly && !Object.values(row.variants).some(isLow)) return false;
    if (!needle) return true;
    return (
      row.model.toLowerCase().includes(needle) ||
      Object.values(row.variants).some((variant) => variant.sku.toLowerCase().includes(needle))
    );
  });

  const allMovements = React.useMemo(() => [...localMovements, ...movements], [localMovements, movements]);

  async function submitAdjustment(input: {
    variantId: string;
    delta: number;
    reason: InventoryMovementReason;
    note?: string;
  }) {
    const variant = target;
    if (!variant) return;

    const previousQty = qtyOf(variant);
    const resultingQty = Math.max(0, previousQty + input.delta);

    // Optimistic UI — the server action reconciles when a DB is attached.
    setStock((prev) => ({ ...prev, [input.variantId]: resultingQty }));
    const optimistic: InventoryMovement = {
      id: `invm_local_${Date.now()}`,
      shopId: "local",
      variantId: input.variantId,
      variantName: variant.name,
      sku: variant.sku,
      delta: input.delta,
      reason: input.reason,
      note: input.note?.trim() || null,
      resultingQty,
      performedBy,
      createdAt: new Date().toISOString(),
    };
    setLocalMovements((prev) => [optimistic, ...prev]);
    setTarget(null);

    const result = await adjustStockAction({ ...input, performedBy });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`${variant.name} · ${variant.model}`, {
      description: `${input.delta > 0 ? "+" : ""}${input.delta} units → ${resultingQty} in stock`,
    });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FadeIn>
          <StatCard
            label="Active variants"
            value={formatNumber(variants.length)}
            icon={Boxes}
            hint={`${matrix.rows.length} iPhone models`}
          />
        </FadeIn>
        <FadeIn delay={0.04}>
          <StatCard
            label="Units in stock"
            value={formatNumber(totalUnits)}
            icon={PackageCheck}
            iconClassName="bg-emerald-50 text-emerald-600"
            hint={`${matrix.colors.length} silicone colours`}
          />
        </FadeIn>
        <FadeIn delay={0.08}>
          {canViewCosts ? (
            <StatCard
              label="Stock value (cost)"
              value={formatBDT(stockValue)}
              icon={Warehouse}
              iconClassName="bg-amber-50 text-amber-600"
              hint={`retail ${formatBDT(retailValue)}`}
            />
          ) : (
            <StatCard
              label="Retail value"
              value={formatBDT(retailValue)}
              icon={Warehouse}
              iconClassName="bg-amber-50 text-amber-600"
              hint="at current selling price"
            />
          )}
        </FadeIn>
        <FadeIn delay={0.12}>
          <StatCard
            label="Needs restock"
            value={formatNumber(lowCount + outCount)}
            icon={AlertTriangle}
            iconClassName="bg-orange-50 text-orange-600"
            hint={`${outCount} out of stock`}
          />
        </FadeIn>
      </div>

      <Tabs defaultValue="matrix">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="matrix" className="h-10 sm:h-7">
            Model × colour matrix
          </TabsTrigger>
          <TabsTrigger value="restock" className="h-10 sm:h-7">
            Restock queue ({lowCount + outCount})
          </TabsTrigger>
          <TabsTrigger value="movements" className="h-10 sm:h-7">
            Stock ledger
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="space-y-3">
          <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search iPhone model or SKU…"
                className="pl-9"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
              <Switch checked={lowOnly} onCheckedChange={setLowOnly} aria-label="Low stock only" />
              Low stock only
            </label>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">iPhone model × silicone colour</CardTitle>
              <CardDescription>
                Tap any cell to open the quick stock / restock panel. Cells turn amber at ≤{" "}
                {LOW_STOCK_THRESHOLD} units.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0 sm:px-0">
              {rows.length ? (
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left text-xs font-semibold">
                          Model
                        </th>
                        {matrix.colors.map((color) => (
                          <th key={color} className="px-2 py-2 text-center text-[11px] font-semibold">
                            <span className="flex flex-col items-center gap-1">
                              <span
                                className="h-3 w-3 rounded-full ring-1 ring-black/10"
                                style={{ backgroundColor: colorHex(color) }}
                              />
                              <span className="whitespace-nowrap">{color}</span>
                            </span>
                          </th>
                        ))}
                        <th className="px-3 py-2 text-right text-xs font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const rowTotal = Object.values(row.variants).reduce(
                          (sum, variant) => sum + qtyOf(variant),
                          0,
                        );
                        return (
                          <tr key={row.model} className="border-b border-border last:border-0">
                            <td className="sticky left-0 z-10 bg-card px-3 py-2">
                              <p className="whitespace-nowrap text-xs font-semibold">{row.model}</p>
                              <p className="text-[10px] text-muted-foreground">{row.totalUnits} units</p>
                            </td>
                            {matrix.colors.map((color) => {
                              const variant = row.variants[color];
                              if (!variant) {
                                return (
                                  <td key={color} className="px-1.5 py-2 text-center">
                                    <span className="text-[11px] text-muted-foreground/50">—</span>
                                  </td>
                                );
                              }
                              const qty = qtyOf(variant);
                              const low = isLow(variant);
                              const out = qty <= 0;
                              return (
                                <td key={color} className="px-1.5 py-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setTarget(variant)}
                                    title={`${row.model} · ${color} — ${qty} in stock`}
                                    className={cn(
                                      "mx-auto flex h-9 w-full min-w-[46px] flex-col items-center justify-center rounded-md text-sm font-semibold tabular ring-1 ring-inset transition-colors",
                                      out
                                        ? "bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30 dark:hover:bg-rose-500/20"
                                        : low
                                          ? "bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30 dark:hover:bg-amber-500/20"
                                          : "bg-card text-foreground ring-border hover:bg-muted",
                                    )}
                                  >
                                    {qty}
                                    {low && !out && <span className="text-[9px] font-medium">low</span>}
                                    {out && <span className="text-[9px] font-medium">out</span>}
                                  </button>
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 text-right text-xs font-semibold tabular">{rowTotal}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={Boxes} title="No models match" description="Try a different search term." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="restock">
          <RestockQueue
            variants={[...variants].filter((variant) => isLow(variant) || isOut(variant))}
            qtyOf={qtyOf}
            onSelect={setTarget}
          />
        </TabsContent>

        <TabsContent value="movements">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" /> Stock movement ledger
              </CardTitle>
              <CardDescription>
                Every restock, correction, damage write-off and auto order deduction.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-0">
              {allMovements.length ? (
                <div className="divide-y divide-border">
                  {allMovements.slice(0, 40).map((movement) => {
                    const meta = INVENTORY_MOVEMENT_META[movement.reason];
                    return (
                      <div key={movement.id} className="flex items-center gap-3 px-4 py-3">
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular",
                            movement.delta >= 0
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-rose-50 text-rose-600",
                          )}
                        >
                          {movement.delta > 0 ? "+" : ""}
                          {movement.delta}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{movement.sku}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {movement.note ?? meta.label} · by {movement.performedBy}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${meta.className}`}
                          >
                            {meta.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            → {movement.resultingQty} · {formatRelative(movement.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState icon={RefreshCw} title="No stock movements yet" />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <QuickStockDialog
        variant={target}
        onOpenChange={(open) => !open && setTarget(null)}
        onSubmit={submitAdjustment}
      />
    </div>
  );
}

function RestockQueue({
  variants,
  qtyOf,
  onSelect,
}: {
  variants: InventoryCellVariant[];
  qtyOf: (variant: { id: string; stockQty: number }) => number;
  onSelect: (variant: InventoryCellVariant) => void;
}) {
  if (!variants.length) {
    return (
      <Card>
        <EmptyState
          icon={PackageCheck}
          title="Everything is well stocked"
          description="No iPhone case variant is below its low-stock threshold."
        />
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-border">
      {[...variants]
        .sort((a, b) => qtyOf(a) - qtyOf(b))
        .map((variant) => {
          const qty = qtyOf(variant);
          const out = qty <= 0;
          return (
            <div key={variant.id} className="flex items-center gap-3 p-3.5 sm:p-4">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  out ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600",
                )}
              >
                {out ? <PackageX className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {variant.model} · {variant.name}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{variant.sku}</p>
              </div>
              <Badge variant={out ? "destructive" : "warning"} className="shrink-0 tabular">
                {qty} left
              </Badge>
              <Button size="sm" variant="outline" className="h-10 shrink-0 sm:h-8" onClick={() => onSelect(variant)}>
                <Plus className="h-3.5 w-3.5" /> Restock
              </Button>
            </div>
          );
        })}
    </Card>
  );
}

function QuickStockDialog({
  variant,
  onOpenChange,
  onSubmit,
}: {
  variant: InventoryCellVariant | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { variantId: string; delta: number; reason: InventoryMovementReason; note?: string }) => void;
}) {
  const [direction, setDirection] = React.useState<"add" | "remove">("add");
  const [reason, setReason] = React.useState<InventoryMovementReason>("RESTOCK");
  const [quantity, setQuantity] = React.useState("10");
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (variant) {
      setDirection("add");
      setReason("RESTOCK");
      setQuantity("10");
      setNote("");
    }
  }, [variant]);

  function submit() {
    const qty = Math.trunc(Number(quantity));
    if (!qty || qty <= 0) {
      toast.error("Enter a quantity greater than zero");
      return;
    }
    onSubmit({
      variantId: variant!.id,
      delta: direction === "add" ? qty : -qty,
      reason,
      note: note.trim() || undefined,
    });
  }

  return (
    <Dialog open={Boolean(variant)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quick stock adjustment</DialogTitle>
          <DialogDescription>
            {variant
              ? `${variant.model} · ${variant.name} — currently ${variant.stockQty} units in stock.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {variant && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={direction === "add" ? "default" : "outline"}
                onClick={() => {
                  setDirection("add");
                  setReason("RESTOCK");
                }}
              >
                <Plus className="h-4 w-4" /> Add stock
              </Button>
              <Button
                type="button"
                variant={direction === "remove" ? "default" : "outline"}
                onClick={() => {
                  setDirection("remove");
                  setReason("MANUAL_ADJUSTMENT");
                }}
              >
                <Minus className="h-4 w-4" /> Remove stock
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
                <div className="flex gap-1">
                  {[5, 10, 25, 50].map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 px-2 sm:h-8"
                      onClick={() => setQuantity(String(preset))}
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={(value) => setReason(value as InventoryMovementReason)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RESTOCK">Restock (supplier delivery)</SelectItem>
                  <SelectItem value="MANUAL_ADJUSTMENT">Manual adjustment / stock audit</SelectItem>
                  <SelectItem value="DAMAGE">Damaged / lost</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stock-note">Note</Label>
              <Input
                id="stock-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Supplier restock — Black & Midnight Blue top-up"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>
            <RefreshCw className="h-4 w-4" /> Apply adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
