import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusSummaryCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Gradient pair, e.g. "from-blue-500 to-blue-600". */
  gradient: string;
  /** Soft coloured shadow, e.g. "shadow-blue-500/30". */
  glow: string;
  hint?: string;
  href?: string;
}

/**
 * High-contrast status tile used across the overview dashboard: a solid
 * gradient, rounded-2xl corners and a soft coloured shadow that lifts the card
 * off the page.
 */
export function StatusSummaryCard({
  label,
  value,
  icon: Icon,
  gradient,
  glow,
  hint,
  href,
}: StatusSummaryCardProps) {
  const body = (
    <div
      className={cn(
        "group h-full rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg transition-transform duration-200 hover:-translate-y-0.5",
        gradient,
        glow,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-white/80">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular tracking-tight">{value}</p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {hint && <p className="mt-2 truncate text-[11px] text-white/75">{hint}</p>}
    </div>
  );

  return href ? (
    <Link href={href} prefetch className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}
