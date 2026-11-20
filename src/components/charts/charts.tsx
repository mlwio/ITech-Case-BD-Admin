"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBDT, formatBDTCompact, formatNumber } from "@/lib/format";
import { CHART_COLORS } from "@/lib/chart-colors";
import type { TrendPoint } from "@/lib/metrics";

export { CHART_COLORS, STATUS_CHART_COLORS } from "@/lib/chart-colors";

const axisStyle = { fontSize: 11, fill: "#64748b" } as const;

function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter = (value: number | string) => formatNumber(Number(value)),
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string }[];
  label?: string | number;
  valueFormatter?: (value: number | string) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-popover/98 px-3 py-2 text-xs shadow-elevated backdrop-blur">
      {label !== undefined && <p className="mb-1 font-medium text-foreground">{label}</p>}
      {payload.map((entry, index) => (
        <p key={`${entry.dataKey}-${index}`} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="capitalize">{entry.name}</span>
          <span className="ml-auto font-semibold tabular text-foreground">
            {valueFormatter(entry.value ?? 0)}
          </span>
        </p>
      ))}
    </div>
  );
}

/** Revenue + order-volume trend for the dashboard & analytics screens. */
export function RevenueTrendChart({ data, height = 260 }: { data: TrendPoint[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.28} />
              <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.emerald} stopOpacity={0.22} />
              <stop offset="100%" stopColor={CHART_COLORS.emerald} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis
            tick={axisStyle}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatBDTCompact(value)}
            width={54}
          />
          <Tooltip content={<ChartTooltip valueFormatter={(value) => formatBDT(Number(value))} />} />
          <Area
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke={CHART_COLORS.primary}
            strokeWidth={2}
            fill="url(#revenueFill)"
          />
          <Area
            type="monotone"
            dataKey="orders"
            name="Orders"
            stroke={CHART_COLORS.emerald}
            strokeWidth={2}
            fill="url(#ordersFill)"
            yAxisId={0}
            hide
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface NamedValue {
  name: string;
  value: number;
  color?: string;
}

/** Horizontal bar — order counts per channel / zone. */
export function BreakdownBarChart({
  data,
  height = 240,
  valueFormatter,
  layout = "horizontal",
}: {
  data: NamedValue[];
  height?: number;
  valueFormatter?: (value: number | string) => string;
  layout?: "horizontal" | "vertical";
}) {
  const isVertical = layout === "vertical";
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={layout}
          margin={{ top: 8, right: 12, left: isVertical ? 12 : -18, bottom: 0 }}
          barCategoryGap={14}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={isVertical} horizontal={!isVertical} stroke="#e2e8f0" />
          {isVertical ? (
            <>
              <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} width={92} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={44} />
            </>
          )}
          <Tooltip
            cursor={{ fill: "rgba(79,70,229,0.06)" }}
            content={<ChartTooltip valueFormatter={valueFormatter} />}
          />
          <Bar dataKey="value" name="Orders" radius={[6, 6, 0, 0]} maxBarSize={44}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color ?? CHART_COLORS.primary} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Donut for order-status distribution. */
export function StatusDonutChart({
  data,
  height = 240,
}: {
  data: NamedValue[];
  height?: number;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div style={{ height }} className="relative w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color ?? CHART_COLORS.primary} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-10">
        <span className="text-xl font-semibold tabular">{formatNumber(total)}</span>
        <span className="text-[11px] text-muted-foreground">total orders</span>
      </div>
    </div>
  );
}

/** Expense split (donut) for the finance screen. */
export function ExpenseDonutChart({ data, height = 230 }: { data: NamedValue[]; height?: number }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div style={{ height }} className="relative w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="56%"
            outerRadius="80%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color ?? CHART_COLORS.violet} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip valueFormatter={(value) => formatBDT(Number(value))} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-semibold tabular">{formatBDT(total)}</span>
        <span className="text-[11px] text-muted-foreground">total cost</span>
      </div>
    </div>
  );
}

/** Revenue vs cost/expense comparison bars. */
export function FinanceBarChart({
  data,
  height = 250,
}: {
  data: { name: string; revenue: number; cost: number }[];
  height?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={6}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} />
          <YAxis
            tick={axisStyle}
            tickLine={false}
            axisLine={false}
            width={54}
            tickFormatter={(value: number) => formatBDTCompact(value)}
          />
          <Tooltip content={<ChartTooltip valueFormatter={(value) => formatBDT(Number(value))} />} />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span className="text-xs capitalize text-muted-foreground">{value}</span>}
          />
          <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS.primary} radius={[6, 6, 0, 0]} maxBarSize={38} />
          <Bar dataKey="cost" name="Cost" fill={CHART_COLORS.amber} radius={[6, 6, 0, 0]} maxBarSize={38} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
