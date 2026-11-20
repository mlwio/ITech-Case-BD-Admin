import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  delta?: number;
  deltaSuffix?: string;
  /** Invert delta colour semantics (e.g. returns going up is bad). */
  invertDelta?: boolean;
  iconClassName?: string;
  href?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  delta,
  deltaSuffix = "%",
  invertDelta = false,
  iconClassName,
  href,
  className,
}: StatCardProps) {
  const positive = (delta ?? 0) >= 0;
  const good = invertDelta ? !positive : positive;

  const body = (
    <Card
      className={cn(
        "group relative overflow-hidden p-4 transition-shadow hover:shadow-elevated sm:p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1.5 text-xl font-semibold tabular tracking-tight sm:text-2xl">{value}</p>
        </div>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
            iconClassName,
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>

      {(hint || delta !== undefined) && (
        <div className="mt-3 flex items-center gap-2 text-[11px]">
          {delta !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
                good ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
              )}
            >
              {positive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(delta).toFixed(1)}
              {deltaSuffix}
            </span>
          )}
          {hint && <span className="truncate text-muted-foreground">{hint}</span>}
        </div>
      )}
    </Card>
  );

  return href ? (
    <Link href={href} prefetch className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
