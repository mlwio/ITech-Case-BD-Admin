"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Check,
  Loader2,
  PackagePlus,
  Palette,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FadeIn } from "@/components/shared/motion";
import { EmptyState } from "@/components/shared/empty-state";
import {
  IPHONE_SERIES,
  colorHex,
  modelLabel,
  productModel,
} from "@/lib/catalog-meta";
import {
  createVariantAction,
  removeVariantAction,
  stockInAction,
  type VariantPayload,
} from "@/lib/actions/stock-in";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StockInViewProps {
  products: Product[];
  performedBy: string;
  canViewCosts: boolean;
}

export function StockInView({ products, performedBy, canViewCosts }: StockInViewProps) {
  const router = useRouter();

  const [series, setSeries] = React.useState<string | null>(null);
  /** Selected model name, e.g. `iPhone 6s Plus`. */
  const [model, setModel] = React.useState<string | null>(null);

  /** Optimistic colour rows for models whose product may not exist server-side yet. */
  const [extra, setExtra] = React.useState<Record<string, VariantPayload[]>>({});
  const [removed, setRemoved] = React.useState<string[]>([]);
  const [localProductId, setLocalProductId] = React.useState<Record<string, string>>({});
  /** Optimistic stock overrides keyed by variant id. */
  const [qtyOverride, setQtyOverride] = React.useState<Record<string, number>>({});

  const [qtyInput, setQtyInput] = React.useState<Record<string, string>>({});
  const [costInput, setCostInput] = React.useState<Record<string, string>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const [newColor, setNewColor] = React.useState("");
  const [newCost, setNewCost] = React.useState("");
  const [newPrice, setNewPrice] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const [pendingRemove, setPendingRemove] = React.useState<VariantPayload | null>(null);
  const [removing, setRemoving] = React.useState(false);

  const seriesEntry = series ? IPHONE_SERIES.find((entry) => entry.id === series) ?? null : null;

  const product = React.useMemo(
    () =>
      model
        ? products.find((row) => productModel(row.name).toLowerCase() === model.toLowerCase()) ?? null
        : null,
    [products, model],
  );

  const variants = React.useMemo<VariantPayload[]>(() => {
    if (!model) return [];
    const serverVariants: VariantPayload[] = (product?.variants ?? []).map((variant) => ({
      id: variant.id,
      productId: variant.productId,
      name: variant.name,
      sku: variant.sku,
      color: variant.color,
      costPrice: variant.costPrice,
      sellingPrice: variant.sellingPrice,
      stockQty: variant.stockQty,
      lowStockThreshold: variant.lowStockThreshold,
    }));
    const serverColors = new Set(serverVariants.map((variant) => variant.color.toLowerCase()));
    const extras = (extra[model] ?? []).filter(
      (variant) => !serverColors.has(variant.color.toLowerCase()),
    );
    return [...serverVariants, ...extras].filter((variant) => !removed.includes(variant.id));
  }, [model, product, extra, removed]);

  const productId = product?.id ?? (model ? localProductId[model] : undefined);

  const qtyOf = (variant: VariantPayload) => qtyOverride[variant.id] ?? variant.stockQty;
  const totalUnits = variants.reduce((sum, variant) => sum + qtyOf(variant), 0);

  const defaultCost = variants[0]?.costPrice ?? 220;
  const defaultPrice = variants[0]?.sellingPrice ?? 599;

  function resetModelInputs() {
    setNewColor("");
    setNewCost("");
    setNewPrice("");
  }

  /* ----------------------------- Stock-In save ---------------------------- */

  async function handleStockIn(variant: VariantPayload) {
    const raw = qtyInput[variant.id] ?? "";
    const qty = Math.trunc(Number(raw));
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Enter a quantity greater than zero");
      return;
    }

    const cost = Number(costInput[variant.id] ?? "");
    const previous = qtyOf(variant);
    const optimistic = previous + qty;

    // Optimistic UI — reflected instantly (<50ms) while the write flies.
    setQtyOverride((prev) => ({ ...prev, [variant.id]: optimistic }));
    setQtyInput((prev) => ({ ...prev, [variant.id]: "" }));
    setSavingId(variant.id);

    const result = await stockInAction({
      variantId: variant.id,
      quantity: qty,
      costPrice: Number.isFinite(cost) && cost > 0 ? cost : undefined,
      performedBy,
    });

    setSavingId(null);
    if (!result.ok) {
      setQtyOverride((prev) => ({ ...prev, [variant.id]: previous }));
      toast.error(result.message);
      return;
    }
    if (typeof result.resultingQty === "number") {
      setQtyOverride((prev) => ({ ...prev, [variant.id]: result.resultingQty as number }));
    }
    toast.success(`+${qty} · ${variant.name}`, {
      description: `Now ${result.resultingQty ?? optimistic} pcs in stock`,
    });
    router.refresh();
  }

  /* ----------------------------- Add colour ------------------------------- */

  async function handleAddColor() {
    if (!model) return;
    const color = newColor.trim();
    if (!color) {
      toast.error("Enter a colour name");
      return;
    }
    if (variants.some((variant) => variant.color.toLowerCase() === color.toLowerCase())) {
      toast.error(`${color} already exists for ${model}`);
      return;
    }

    const cost = Number(newCost);
    const price = Number(newPrice);
    setAdding(true);
    const result = await createVariantAction({
      model,
      color,
      costPrice: Number.isFinite(cost) && cost > 0 ? cost : defaultCost,
      sellingPrice: Number.isFinite(price) && price > 0 ? price : defaultPrice,
    });
    setAdding(false);

    if (!result.ok || !result.variant) {
      toast.error(result.message);
      return;
    }

    setExtra((prev) => ({ ...prev, [model]: [...(prev[model] ?? []), result.variant as VariantPayload] }));
    if (result.productId) setLocalProductId((prev) => ({ ...prev, [model]: result.productId as string }));
    resetModelInputs();
    toast.success(`${color} added to ${model}`, { description: "Enter the incoming quantity to stock it in" });
    router.refresh();
  }

  /* ----------------------------- Remove colour ---------------------------- */

  async function confirmRemove() {
    const variant = pendingRemove;
    if (!variant) return;

    setRemoving(true);
    setRemoved((prev) => [...prev, variant.id]);
    const result = await removeVariantAction(variant.id);
    setRemoving(false);
    setPendingRemove(null);

    if (!result.ok) {
      setRemoved((prev) => prev.filter((id) => id !== variant.id));
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
    router.refresh();
  }

  const sellingPriceLabel = canViewCosts ? "Buying cost ৳" : "Price ৳";

  return (
    <div className="space-y-3">
      {/* Step 1 — series */}
      <FadeIn>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                1
              </span>
              Select series / generation
            </CardTitle>
            <CardDescription>Pick the iPhone family to stock in.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {IPHONE_SERIES.map((entry) => {
                const active = series === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setSeries(entry.id);
                      setModel(null);
                      resetModelInputs();
                    }}
                    className={cn(
                      "rounded-lg border px-3.5 py-2 text-sm font-semibold tabular transition-all duration-150 ease-out active:scale-95",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted",
                    )}
                  >
                    {entry.label}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      {/* Step 2 — variant tier */}
      {seriesEntry && (
        <FadeIn>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  2
                </span>
                Select exact model
              </CardTitle>
              <CardDescription>
                {model
                  ? `Targets ${model}`
                  : `Choose the exact model in the ${seriesEntry.label} family.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {seriesEntry.models.map((candidate) => {
                  const active = model === candidate;
                  const exists = products.some(
                    (row) => productModel(row.name).toLowerCase() === candidate.toLowerCase(),
                  );
                  return (
                    <button
                      key={candidate}
                      type="button"
                      onClick={() => {
                        setModel(candidate);
                        resetModelInputs();
                      }}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-all duration-150 ease-out active:scale-95",
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted",
                      )}
                    >
                      {modelLabel(candidate)}
                      {exists && (
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            active ? "bg-primary-foreground" : "bg-emerald-500",
                          )}
                          title="Already in catalog"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {/* Step 3 — colour matrix & stock-in */}
      {model && (
        <FadeIn>
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    3
                  </span>
                  {model} — colours &amp; stock
                </CardTitle>
                <CardDescription>
                  Add units next to each colour, or create a new colour variant (starts at 0 pcs).
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1.5 tabular">
                  <Boxes className="h-3.5 w-3.5" /> {variants.length} colours
                </Badge>
                <Badge variant="secondary" className="gap-1.5 tabular">
                  <PackagePlus className="h-3.5 w-3.5" /> {formatNumber(totalUnits)} pcs
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="px-0 pb-0 sm:px-0">
              {variants.length ? (
                <div className="divide-y divide-border">
                  {variants.map((variant) => {
                    const qty = qtyOf(variant);
                    const low = qty > 0 && qty <= (variant.lowStockThreshold || LOW_STOCK_THRESHOLD);
                    const out = qty <= 0;
                    const saving = savingId === variant.id;
                    return (
                      <div
                        key={variant.id}
                        className="flex flex-col gap-3 p-3.5 transition-colors duration-150 ease-out hover:bg-muted/40 sm:flex-row sm:items-center"
                      >
                        {/* colour identity */}
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            className="h-8 w-8 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                            style={{ backgroundColor: colorHex(variant.color) }}
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{variant.color}</p>
                          </div>
                        </div>

                        {/* live stock */}
                        <div className="flex w-20 shrink-0 flex-col items-start sm:items-center">
                          <span
                            className={cn(
                              "text-lg font-bold tabular leading-none transition-colors duration-150",
                              out
                                ? "text-rose-600 dark:text-rose-400"
                                : low
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-foreground",
                            )}
                          >
                            {qty}
                          </span>
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {out ? "out of stock" : low ? "low · pcs" : "pcs in stock"}
                          </span>
                        </div>

                        {/* inline stock-in */}
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            placeholder="Qty"
                            value={qtyInput[variant.id] ?? ""}
                            onChange={(event) =>
                              setQtyInput((prev) => ({ ...prev, [variant.id]: event.target.value }))
                            }
                            className="h-10 w-20 sm:h-9"
                            aria-label={`Add stock quantity for ${variant.color}`}
                          />
                          {canViewCosts && (
                            <div className="relative">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                ৳
                              </span>
                              <Input
                                type="number"
                                min={0}
                                inputMode="numeric"
                                placeholder={String(variant.costPrice)}
                                value={costInput[variant.id] ?? ""}
                                onChange={(event) =>
                                  setCostInput((prev) => ({ ...prev, [variant.id]: event.target.value }))
                                }
                                className="h-10 w-24 pl-6 sm:h-9"
                                aria-label={`Unit buying cost for ${variant.color}`}
                              />
                            </div>
                          )}
                          <Button
                            size="sm"
                            className="h-10 gap-1.5 transition-transform active:scale-95 sm:h-9"
                            onClick={() => handleStockIn(variant)}
                            disabled={saving}
                          >
                            {saving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Plus className="h-3.5 w-3.5" />
                            )}
                            Add Stock
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remove ${variant.color}`}
                            className="text-muted-foreground transition-colors hover:text-rose-600"
                            onClick={() => setPendingRemove(variant)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={Palette}
                  title="No colours yet"
                  description={`${model} has no colour variants. Add the first one below.`}
                />
              )}

              {/* add new colour */}
              <div className="border-t border-border bg-muted/30 p-3.5">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Add a new colour
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[9rem] flex-1 space-y-1.5">
                    <Label htmlFor="new-color" className="text-[11px]">
                      Colour name
                    </Label>
                    <div className="relative">
                      <span
                        className={cn(
                          "pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-colors duration-150 ease-out",
                          newColor.trim()
                            ? "ring-1 ring-black/10 dark:ring-white/15"
                            : "border border-dashed border-border",
                        )}
                        style={newColor.trim() ? { backgroundColor: colorHex(newColor) } : undefined}
                        aria-hidden
                      />
                      <Input
                        id="new-color"
                        value={newColor}
                        onChange={(event) => setNewColor(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void handleAddColor();
                          }
                        }}
                        placeholder="e.g. Gray, Emerald"
                        className="h-10 pl-8 sm:h-9"
                      />
                    </div>
                  </div>
                  {canViewCosts && (
                    <div className="w-28 space-y-1.5">
                      <Label htmlFor="new-cost" className="text-[11px]">
                        Cost ৳
                      </Label>
                      <Input
                        id="new-cost"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        placeholder={String(defaultCost)}
                        value={newCost}
                        onChange={(event) => setNewCost(event.target.value)}
                        className="h-10 sm:h-9"
                      />
                    </div>
                  )}
                  <div className="w-28 space-y-1.5">
                    <Label htmlFor="new-price" className="text-[11px]">
                      {sellingPriceLabel}
                    </Label>
                    <Input
                      id="new-price"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder={String(defaultPrice)}
                      value={newPrice}
                      onChange={(event) => setNewPrice(event.target.value)}
                      className="h-10 sm:h-9"
                    />
                  </div>
                  <Button
                    className="h-9 gap-1.5 transition-transform active:scale-95"
                    onClick={handleAddColor}
                    disabled={adding}
                  >
                    {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add Colour
                  </Button>
                </div>
                {!productId && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <TriangleAlert className="h-3.5 w-3.5 text-amber-500" />
                    {model} isn&apos;t in the catalog yet — adding a colour creates it automatically.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {!model && (
        <EmptyState
          icon={PackagePlus}
          title="Pick a series to begin"
          description="Choose an iPhone generation above, then its variant tier, to reveal the colour stock matrix."
        />
      )}

      {/* remove confirmation */}
      <Dialog open={Boolean(pendingRemove)} onOpenChange={(open) => !open && setPendingRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove colour variant?</DialogTitle>
            <DialogDescription>
              {pendingRemove
                ? `${pendingRemove.color} · ${model} will be deleted from the catalog. This cannot be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRemove(null)} disabled={removing}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRemove}
              disabled={removing}
              className="gap-1.5"
            >
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Remove colour
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
