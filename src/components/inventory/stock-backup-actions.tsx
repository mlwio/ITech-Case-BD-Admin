"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Download,
  FileSpreadsheet,
  Loader2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { importStockRestoreAction, type StockRestoreRow } from "@/lib/actions/stock-in";
import { productModel } from "@/lib/catalog-meta";
import { formatNumber } from "@/lib/format";
import type { Product } from "@/lib/types";

interface StockBackupActionsProps {
  products: Product[];
}

interface CurrentVariant {
  sku: string;
  label: string;
  stockQty: number;
  costPrice: number;
  sellingPrice: number;
}

interface PreviewRow {
  variantId: string;
  sku: string;
  label: string;
  from: number;
  to: number;
  priceChanged: boolean;
}

/** Loose header matching — trims, lowercases and drops punctuation/spacing. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Stock-In header actions: download an `.xlsx` backup of the whole catalog and
 * upload an edited copy back. The upload is parsed in the browser purely to
 * build the "Old → New" preview; the authoritative validation + write happens
 * in the protected `importStockRestoreAction` Server Action.
 */
export function StockBackupActions({ products }: StockBackupActionsProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [parsing, setParsing] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<StockRestoreRow[]>([]);
  const [preview, setPreview] = React.useState<PreviewRow[]>([]);
  const [skipped, setSkipped] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const current = React.useMemo(() => {
    const map = new Map<string, CurrentVariant>();
    for (const product of products) {
      for (const variant of product.variants) {
        map.set(variant.id, {
          sku: variant.sku,
          label: `${productModel(product.name)} · ${variant.color}`,
          stockQty: variant.stockQty,
          costPrice: variant.costPrice,
          sellingPrice: variant.sellingPrice,
        });
      }
    }
    return map;
  }, [products]);

  function reset() {
    setFileName(null);
    setRows([]);
    setPreview([]);
    setSkipped(0);
    setError(null);
    setParsing(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setParsing(true);
    setError(null);
    try {
      // SheetJS is heavy — load it only when a file is actually chosen.
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("empty workbook");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      const parsedRows: StockRestoreRow[] = [];
      const changes: PreviewRow[] = [];
      let ignored = 0;

      for (const entry of raw) {
        const normalized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(entry)) normalized[normalizeKey(key)] = value;

        const variantId = String(normalized.variantid ?? "").trim();
        const qty = toNumber(normalized.currentstockqty ?? normalized.stockqty ?? normalized.qty);
        const cost = toNumber(normalized.buyingprice ?? normalized.costprice);
        const price = toNumber(normalized.sellingprice ?? normalized.price);

        if (!variantId || qty === undefined) {
          ignored += 1;
          continue;
        }

        const next = Math.max(0, Math.trunc(qty));
        parsedRows.push({ variantId, stockQty: next, costPrice: cost, sellingPrice: price });

        const existing = current.get(variantId);
        if (!existing) {
          ignored += 1;
          continue;
        }
        const priceChanged =
          (cost !== undefined && cost !== existing.costPrice) ||
          (price !== undefined && price !== existing.sellingPrice);
        if (next !== existing.stockQty || priceChanged) {
          changes.push({
            variantId,
            sku: existing.sku,
            label: existing.label,
            from: existing.stockQty,
            to: next,
            priceChanged,
          });
        }
      }

      setRows(parsedRows);
      setPreview(changes);
      setSkipped(ignored);
      if (parsedRows.length === 0) {
        setError("No readable rows found. Export a fresh backup and edit only the quantity/price columns.");
      }
    } catch {
      setRows([]);
      setPreview([]);
      setError("That file could not be read. Upload the .xlsx backup exported from this page.");
    } finally {
      setParsing(false);
    }
  }

  async function applyRestore() {
    if (rows.length === 0) return;
    setApplying(true);
    const result = await importStockRestoreAction(rows);
    setApplying(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast.success(result.message, {
      description: result.changes?.length
        ? `${result.changes.length} variant(s) updated`
        : "No quantity changes needed",
    });
    reset();
    setOpen(false);
    router.refresh();
  }

  const previewShown = preview.slice(0, 40);

  return (
    <>
      <Button variant="outline" size="sm" asChild>
        <a href="/api/stock-in/export" download>
          <Download className="h-4 w-4" /> Export Excel (Backup)
        </a>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Upload className="h-4 w-4" /> Import Excel (Restore &amp; Update)
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          setOpen(next);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" /> Restore stock from Excel
            </DialogTitle>
            <DialogDescription>
              Upload the edited backup. Only changed rows are written, and every change is logged
              in the inventory ledger.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                setFileName(file.name);
                void handleFile(file);
              }
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={parsing || applying}
            >
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {fileName ? "Choose another file" : "Choose .xlsx file"}
            </Button>
            {fileName && <span className="max-w-[16rem] truncate text-xs text-muted-foreground">{fileName}</span>}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {!error && rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="tabular">
                  {preview.length} to change
                </Badge>
                {skipped > 0 && (
                  <Badge variant="secondary" className="tabular">
                    {skipped} ignored
                  </Badge>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border scrollbar-thin">
                {previewShown.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    No quantity or price changes detected — the catalog already matches this file.
                  </p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted/70 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Variant</th>
                        <th className="px-3 py-2 text-right font-medium">Stock (Old → New)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {previewShown.map((row) => (
                        <tr key={row.variantId}>
                          <td className="px-3 py-2">
                            <p className="font-medium text-foreground">{row.label}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {row.sku}
                              {row.priceChanged ? " · price update" : ""}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="inline-flex items-center gap-1.5 tabular">
                              <span className="text-muted-foreground">{formatNumber(row.from)}</span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              <span className="font-semibold text-foreground">{formatNumber(row.to)}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {preview.length > previewShown.length && (
                <p className="text-[11px] text-muted-foreground">
                  +{preview.length - previewShown.length} more row(s) will also update.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              disabled={applying}
            >
              Cancel
            </Button>
            <Button onClick={applyRestore} disabled={applying || preview.length === 0} className="gap-1.5">
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Apply changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
