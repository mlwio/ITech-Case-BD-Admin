import { Crown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { FadeIn } from "@/components/shared/motion";
import { formatBDT, formatNumber, formatPercent, initialsOf } from "@/lib/format";
import type { ModeratorStat } from "@/lib/metrics";
import { cn } from "@/lib/utils";

interface ModeratorLeaderboardProps {
  stats: ModeratorStat[];
}

/** Per-staff intake vs confirmation — who is actually converting their orders. */
export function ModeratorLeaderboard({ stats }: ModeratorLeaderboardProps) {
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Moderator leaderboard</CardTitle>
          <CardDescription>Placed vs confirmed orders for the selected period</CardDescription>
        </div>
        <Crown className="h-4 w-4 text-amber-500" />
      </CardHeader>
      <CardContent className="space-y-3">
        {stats.length === 0 ? (
          <EmptyState icon={Crown} title="No orders in this range" />
        ) : (
          stats.map((stat, index) => (
            <FadeIn key={stat.name} delay={index * 0.04}>
              <div className="rounded-xl border border-border p-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs">{initialsOf(stat.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold">{stat.name}</p>
                      {index === 0 && (
                        <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30">
                          Top
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground tabular">
                      {formatNumber(stat.placed)} placed · {formatNumber(stat.confirmed)} confirmed ·{" "}
                      {formatNumber(stat.cancelled)} cancelled
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-sm font-semibold tabular",
                        stat.conversion >= 70
                          ? "text-emerald-600"
                          : stat.conversion >= 45
                            ? "text-amber-600"
                            : "text-rose-600",
                      )}
                    >
                      {formatPercent(stat.conversion)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">conversion</p>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <Progress
                    value={stat.conversion}
                    className="h-1.5"
                    indicatorClassName={cn(
                      stat.conversion >= 70
                        ? "bg-emerald-500"
                        : stat.conversion >= 45
                          ? "bg-amber-500"
                          : "bg-rose-500",
                    )}
                  />
                  <span className="shrink-0 text-[11px] font-medium text-muted-foreground tabular">
                    {formatBDT(stat.revenue)}
                  </span>
                </div>
              </div>
            </FadeIn>
          ))
        )}
      </CardContent>
    </Card>
  );
}
