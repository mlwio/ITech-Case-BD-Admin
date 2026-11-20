"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PrintToolbarProps {
  title: string;
  /** Client component — must not be a server function. */
  backHref: string;
  /** Optional size switcher (sticker route only). */
  sizes?: { value: string; label: string }[];
  activeSize?: string;
  /** Prebuilt href for each size value — must be serializable (no functions). */
  sizeHrefs?: Record<string, string>;
  /** Fire `window.print()` automatically once the sheet is painted. */
  autoprint?: boolean;
}

/**
 * On-screen toolbar for the print routes. Hidden from the printed sheet via the
 * `.no-print` utility so only the sticker / packing list hits paper.
 */
export function PrintToolbar({
  title,
  backHref,
  sizes,
  activeSize,
  sizeHrefs,
  autoprint = false,
}: PrintToolbarProps) {
  React.useEffect(() => {
    if (!autoprint) return;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [autoprint]);

  return (
    <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur">
      <Button variant="ghost" size="sm" asChild>
        <Link href={backHref}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </Button>
      <span className="text-sm font-medium">{title}</span>

      {sizes && sizeHrefs && (
        <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-1">
          {sizes.map((size) => (
            <Link
              key={size.value}
              href={sizeHrefs[size.value] ?? "#"}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                size.value === activeSize
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {size.label}
            </Link>
          ))}
        </div>
      )}

      <Button size="sm" className="ml-auto" onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> Print
      </Button>
    </div>
  );
}
