"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  Minus,
  PackageCheck,
  PackageX,
  Plus,
  Search,
  Tag,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { FadeIn } from "@/components/shared/motion";
import { inventoryStats } from "@/lib/metrics";
import { formatBDT, formatNumber } from "@/lib/format";
import type { Product, ProductVariant } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ProductsViewProps {
  products: Product[];
}

type VariantRow = ProductVariant & { productName: string; brand: string; category: string };

const LOW_STOCK_FALLBACK = 5;

export function ProductsView({ products }: ProductsViewProps) {
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<string>("ALL");
  /** Local stock adjustments (optimistic until Phase 2 persists them). */
  const [stock, setStock] = React.useState<Record<string, number>>({});
  const [expanded, setExpanded] = React.useState<string | null>(products[0]?.id ?? null);

  const categories = React.useMemo(
    () => Array.from(new Set(products.map((product) => product.category))).sort(),
    [products],
  );

  const variantRows: VariantRow[] = React.useMemo(
    () =>
      products.flatMap((product) =>
        product.variants.map((variant) => ({
          ...variant,
          productName: product.name,
          brand: product.brand,
          category: product.category,
        })),
      ),
    [products],
  );

  const stats = React.useMemo(() => inventoryStats(products), [products]);
  const lowStock = variantRows.filter((row) => {
    const qty = stock[row.id] ?? row.stockQty;
    const threshold = row.lowStockThreshold || LOW_STOCK_FALLBACK;
    return qty > 0 && qty <= threshold;
  });
  const outOfStock = variantRows.filter((row) => (stock[row.id] ?? row.stockQty) <= 0);

  const filtered = products.filter((product) => {
    if (category !== "ALL" && product.category !== category) return false;
    if (!query.trim()) return true;
    const needle = query.toLowerCase();
    return (
      product.name.toLowerCase().includes(needle) ||
      product.brand.toLowerCase().includes(needle) ||
      product.variants.some((variant) => variant.sku.toLowerCase().includes(needle))
    );
  });

  function adjust(variant: ProductVariant, delta: number, productName: string) {
    setStock((prev) => {
      const current = prev[variant.id] ?? variant.stockQty;
      const next = Math.max(0, current + delta);
      return { ...prev, [variant.id]: next };
    });
    toast.success(`${variant.name} stock ${delta > 0 ? "increased" : "reduced"}`, {
      description: `${variant.sku} · ${productName}`,
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FadeIn>
          <StatCard
            label="Active variants"
            value={formatNumber(stats.totalVariants)}
            icon={Boxes}
            hint={`${products.length} products`}
          />
        </FadeIn>
        <FadeIn delay={0.04}>
          <StatCard
            label="Units in stock"
            value={formatNumber(stats.totalUnits)}
            icon={PackageCheck}
            iconClassName="bg-emerald-50 text-emerald-600"
            hint="across all variants"
          />
        </FadeIn>
        <FadeIn delay={0.08}>
          <StatCard
            label="Stock value (cost)"
            value={formatBDT(stats.stockValue)}
            icon={Wallet}
            iconClassName="bg-amber-50 text-amber-600"
            hint={`retail ${formatBDT(stats.retailValue)}`}
          />
        </FadeIn>
        <FadeIn delay={0.12}>
          <StatCard
            label="Needs restock"
            value={formatNumber(lowStock.length + outOfStock.length)}
            icon={AlertTriangle}
            iconClassName="bg-orange-50 text-orange-600"
            hint={`${outOfStock.length} out of stock`}
          />
        </FadeIn>
      </div>

      <Tabs defaultValue="catalog">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="catalog" className="h-10 sm:h-7">
            Catalog
          </TabsTrigger>
          <TabsTrigger value="low" className="h-10 sm:h-7">
            Low stock ({lowStock.length})
          </TabsTrigger>
          <TabsTrigger value="out" className="h-10 sm:h-7">
            Out of stock ({outOfStock.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search product, brand or SKU…"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip label="All" active={category === "ALL"} onClick={() => setCategory("ALL")} />
              {categories.map((item) => (
                <FilterChip
                  key={item}
                  label={item}
                  active={category === item}
                  onClick={() => setCategory(item)}
                />
              ))}
            </div>
          </div>

          {filtered.length ? (
            <div className="space-y-2">
              {filtered.map((product) => {
                const isOpen = expanded === product.id;
                const units = product.variants.reduce(
                  (sum, variant) => sum + (stock[variant.id] ?? variant.stockQty),
                  0,
                );
                return (
                  <Card key={product.id} className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : product.id)}
                      className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-muted/40 sm:p-4"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Tag className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{product.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {product.brand} · {product.category} · {product.variants.length} variants
                        </p>
                      </div>
                      <Badge variant={units > 0 ? "secondary" : "destructive"} className="shrink-0 tabular">
                        {units} in stock
                      </Badge>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          isOpen && "rotate-180",
                        )}
                      />
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden border-t border-border"
                        >
                          <div className="divide-y divide-border">
                            {product.variants.map((variant) => {
                              const qty = stock[variant.id] ?? variant.stockQty;
                              const threshold = variant.lowStockThreshold || LOW_STOCK_FALLBACK;
                              const margin = variant.sellingPrice - variant.costPrice;
                              return (
                                <div
                                  key={variant.id}
                                  className="flex flex-wrap items-center gap-3 px-3.5 py-3 sm:px-4"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">
                                      {variant.name} · {variant.color}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                      {variant.sku} · cost {formatBDT(variant.costPrice)} · sell{" "}
                                      {formatBDT(variant.sellingPrice)}
                                    </p>
                                    <div className="mt-1.5 max-w-[160px]">
                                      <Progress
                                        value={Math.min((qty / Math.max(threshold * 3, 1)) * 100, 100)}
                                        indicatorClassName={cn(
                                          qty <= 0
                                            ? "bg-rose-500"
                                            : qty <= threshold
                                              ? "bg-amber-500"
                                              : "bg-emerald-500",
                                        )}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="text-right">
                                      <p
                                        className={cn(
                                          "text-sm font-semibold tabular",
                                          qty <= 0
                                            ? "text-rose-600"
                                            : qty <= threshold
                                              ? "text-amber-600"
                                              : "",
                                        )}
                                      >
                                        {qty}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground">units</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="outline"
                                        size="icon-sm"
                                        onClick={() => adjust(variant, -1, product.name)}
                                        aria-label="Reduce stock"
                                      >
                                        <Minus className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="icon-sm"
                                        onClick={() => adjust(variant, 1, product.name)}
                                        aria-label="Increase stock"
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                    <Badge
                                      variant={margin > 0 ? "success" : "muted"}
                                      className="hidden shrink-0 tabular sm:inline-flex"
                                    >
                                      +{formatBDT(margin)}
                                    </Badge>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <EmptyState
                icon={Boxes}
                title="No products match"
                description="Try a different search term or category filter."
              />
            </Card>
          )}
        </TabsContent>

        <TabsContent value="low">
          <AlertList
            rows={lowStock}
            stock={stock}
            emptyTitle="Everything is well stocked"
            emptyIcon={PackageCheck}
            tone="warning"
          />
        </TabsContent>

        <TabsContent value="out">
          <AlertList
            rows={outOfStock}
            stock={stock}
            emptyTitle="No out-of-stock variants"
            emptyIcon={PackageCheck}
            tone="danger"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-2.5 text-xs font-medium transition-colors sm:py-1",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

function AlertList({
  rows,
  stock,
  emptyTitle,
  emptyIcon,
  tone,
}: {
  rows: VariantRow[];
  stock: Record<string, number>;
  emptyTitle: string;
  emptyIcon: typeof PackageX;
  tone: "warning" | "danger";
}) {
  if (!rows.length) {
    return (
      <Card>
        <EmptyState icon={emptyIcon} title={emptyTitle} />
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-border">
      {rows
        .sort((a, b) => (stock[a.id] ?? a.stockQty) - (stock[b.id] ?? b.stockQty))
        .map((row) => {
          const qty = stock[row.id] ?? row.stockQty;
          return (
            <div key={row.id} className="flex items-center gap-3 p-3.5 sm:p-4">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  tone === "danger" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600",
                )}
              >
                {tone === "danger" ? <PackageX className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.productName}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {row.name} · {row.sku}
                </p>
              </div>
              <Badge variant={tone === "danger" ? "destructive" : "warning"} className="shrink-0 tabular">
                {qty} left
              </Badge>
            </div>
          );
        })}
    </Card>
  );
}
