import { Database } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Identifies the configured database as the source of persisted records.
 */
export function DataSourceBadge({
  source,
  className,
}: {
  source: "database";
  className?: string;
}) {
  return (
    <span
      data-source={source}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
        className,
      )}
    >
      <Database className="h-3 w-3" />
      Live database
    </span>
  );
}
