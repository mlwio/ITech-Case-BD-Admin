"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  BadgeDollarSign,
  Banknote,
  CheckCircle2,
  Clock,
  Download,
  HandCoins,
  Megaphone,
  Package,
  PiggyBank,
  Plus,
  Receipt,
  Search,
  ShieldAlert,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { FadeIn } from "@/components/shared/motion";
import { ExpenseDonutChart, FinanceBarChart, type NamedValue } from "@/components/charts/charts";
import { deliveryZoneLabel, EXPENSE_CATEGORY_META } from "@/lib/constants";
import { codSettlement, financeSummary } from "@/lib/metrics";
import { formatBDT, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { bulkMarkCollectedAction, createExpenseAction, markLedgerCollectedAction } from "@/lib/actions/finance";
import { downloadCsv, toCsv, type CsvCell } from "@/lib/csv";
import type { ExpenseCategory, ExpenseLog, FinancialLedgerEntry, Order } from "@/lib/types";
import { cn } from "@/lib/utils";

type LedgerFilter = "all" | "profit" | "return" | "pending" | "collected";

const LEDGER_FILTERS: { value: LedgerFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "profit", label: "Delivered profit" },
  { value: "return", label: "Return loss" },
  { value: "pending", label: "Pending COD" },
  { value: "collected", label: "Collected" },
];

interface FinanceViewProps {
  orders: Order[];
  expenses: ExpenseLog[];
  /** Database 3 financial ledger — realised profit, return loss and COD state. */
  ledger: FinancialLedgerEntry[];
  createdByName: string;
  /** Owners (and finance-enabled roles) may see buying cost and net profit. */
  canViewCosts: boolean;
  /** Human label for the active date window, e.g. "This Month". */
  periodLabel: string;
}

export function FinanceView({
  orders,
  expenses,
  ledger,
  createdByName,
  canViewCosts,
  periodLabel,
}: FinanceViewProps) {
  const router = useRouter();
  /** Newly added expenses (local, optimistic) merged with persisted expenses. */
  const [added, setAdded] = React.useState<ExpenseLog[]>([]);

  const allExpenses = React.useMemo(
    () => [...added, ...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [added, expenses],
  );

  const summary = React.useMemo(() => financeSummary(orders, allExpenses), [orders, allExpenses]);
  const cod = React.useMemo(() => codSettlement(orders), [orders]);

  /** Unsettled COD orders — the reconciliation worklist. */
  const codOrders = React.useMemo(
    () =>
      orders
        .filter((order) => !order.isPaymentSettled && (order.status === "IN_TRANSIT" || order.status === "DELIVERED"))
        .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime()),
    [orders],
  );

  /* ---- Financial ledger (Database 3) ------------------------------------- */
  const [query, setQuery] = React.useState("");
  const [ledgerFilter, setLedgerFilter] = React.useState<LedgerFilter>("all");
  /** Locally-collected ids — optimistic so the UI flips instantly. */
  const [collectedNow, setCollectedNow] = React.useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = React.useState(false);

  /** Overlay the optimistic "collected" state on top of the server rows. */
  const effectiveLedger = React.useMemo(
    () =>
      ledger.map((entry) =>
        collectedNow.has(entry.id)
          ? { ...entry, collectionStatus: "COLLECTED" as const }
          : entry,
      ),
    [ledger, collectedNow],
  );

  const ledgerStats = React.useMemo(() => {
    let collected = 0;
    let pending = 0;
    let charges = 0;
    let net = 0;
    for (const entry of effectiveLedger) {
      if (entry.collectionStatus === "COLLECTED") collected += entry.collectedAmount;
      else if (entry.collectionStatus === "PENDING") pending += entry.collectedAmount;
      if (entry.type === "ORDER_PROFIT" || entry.type === "RETURN_DELIVERY_LOSS") {
        charges += entry.deliveryCharge;
      }
      net += entry.netProfit;
    }
    return { collected, pending, charges, trueNet: net - summary.expenses };
  }, [effectiveLedger, summary.expenses]);

  const filteredLedger = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return effectiveLedger
      .filter((entry) => {
        if (ledgerFilter === "profit") return entry.type === "ORDER_PROFIT";
        if (ledgerFilter === "return") return entry.type === "RETURN_DELIVERY_LOSS";
        if (ledgerFilter === "pending") return entry.collectionStatus === "PENDING";
        if (ledgerFilter === "collected") return entry.collectionStatus === "COLLECTED";
        return true;
      })
      .filter((entry) => {
        if (!q) return true;
        return (
          (entry.orderNumber ?? "").toLowerCase().includes(q) ||
          (entry.consignmentId ?? "").toLowerCase().includes(q) ||
          (entry.note ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [effectiveLedger, ledgerFilter, query]);

  const selectableIds = React.useMemo(
    () => filteredLedger.filter((entry) => entry.collectionStatus === "PENDING").map((entry) => entry.id),
    [filteredLedger],
  );

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function markCollected(id: string) {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      const result = await markLedgerCollectedAction(id, createdByName);
      if (!result.ok) {
        toast.error(result.message || "Could not mark COD collected");
        return;
      }
      setCollectedNow((prev) => new Set(prev).add(id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success("COD marked as collected");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function markSelectedCollected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const result = await bulkMarkCollectedAction(ids, createdByName);
      if (!result.ok) {
        toast.error(result.message || "Could not settle COD");
        return;
      }
      setCollectedNow((prev) => new Set([...prev, ...ids]));
      setSelected(new Set());
      toast.success(result.message || "COD settled");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  const expenseData: NamedValue[] = summary.expenseByCategory
    .filter((entry) => entry.amount > 0)
    .map((entry) => ({
      name: EXPENSE_CATEGORY_META[entry.category].label,
      value: entry.amount,
      color: EXPENSE_CATEGORY_META[entry.category].color,
    }));

  const barData = React.useMemo(() => {
    const buckets = new Map<string, { revenue: number; cost: number }>();
    for (const order of orders) {
      if (!["CONFIRMED", "IN_TRANSIT", "DELIVERED"].includes(order.status)) continue;
      const date = new Date(order.placedAt);
      const key = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
      const current = buckets.get(key) ?? { revenue: 0, cost: 0 };
      current.revenue += order.totalAmount;
      current.cost +=
        order.items.reduce((sum, item) => sum + item.unitCostPrice * item.quantity, 0) + order.courierFee;
      buckets.set(key, current);
    }
    return Array.from(buckets.entries())
      .map(([name, value]) => ({ name, ...value }))
      .slice(-7);
  }, [orders]);

  async function addExpense(expense: Omit<ExpenseLog, "id" | "shopId">) {
    try {
      const result = await createExpenseAction({
        category: expense.category,
        amountBdt: expense.amountBdt,
        note: expense.note,
      });
      if (!result.ok) {
        toast.error(result.message || "Could not record the expense");
        return;
      }

      setAdded((prev) => [
        {
          ...expense,
          id: result.id ?? `exp_local_${prev.length + 1}`,
          shopId: "local",
        },
        ...prev,
      ]);
      toast.success("Expense recorded", {
        description: `${EXPENSE_CATEGORY_META[expense.category].label} · ${formatBDT(expense.amountBdt)}`,
      });
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  /** Offline accounting backup — P&L, COD buckets and the full expense ledger. */
  function exportCsv() {
    const pnl: CsvCell[][] = canViewCosts
      ? [
          ["Gross product revenue", summary.revenue],
          ["Cost of goods sold", -summary.cogs],
          ["Gross profit", summary.grossProfit],
          ["Courier fees (Pathao)", -summary.courierCost],
          ["Operational expenses", -summary.expenses],
          ["Net profit", summary.netProfit],
        ]
      : [
          ["Gross product revenue", summary.revenue],
          ["Courier fees (Pathao)", -summary.courierCost],
          ["Operational expenses", -summary.expenses],
        ];

    const rows: CsvCell[][] = [
      ["ITech Case BD — Finance export"],
      ["Period", periodLabel],
      ["Generated", new Date().toISOString()],
      [],
      ["Profit & loss (BDT)"],
      ["Line", "Amount"],
      ...pnl,
      [],
      ["COD settlement"],
      ["Bucket", "Amount", "Parcels"],
      ["Pending COD", cod.pendingCod, cod.pendingCount],
      ["Delivered (unsettled)", cod.deliveredUnsettled, cod.deliveredUnsettledCount],
      ["Settled / Paid", cod.settled, cod.settledCount],
      ["Total COD", cod.totalCod, ""],
      ["Settlement rate (%)", cod.settlementRate, ""],
      [],
      ["Expense ledger"],
      ["Date", "Category", "Note", "Amount (BDT)", "Recorded by"],
      ...allExpenses.map((expense) => [
        formatDate(expense.date),
        EXPENSE_CATEGORY_META[expense.category].label,
        expense.note,
        expense.amountBdt,
        expense.createdByName,
      ]),
    ];

    downloadCsv(`itech-case-bd-finance-${Date.now()}.csv`, toCsv(rows));
    toast.success("Finance export downloaded", { description: "P&L, COD and expense ledger as CSV" });
  }

  const expenseRatio = summary.revenue ? (summary.expenses / summary.revenue) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {periodLabel} · BDT ৳ ledger
        </p>
        <Button variant="outline" size="sm" className="h-10 sm:h-8" onClick={exportCsv}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FadeIn>
          <StatCard
            label={`Revenue · ${periodLabel}`}
            value={formatBDT(summary.revenue)}
            icon={TrendingUp}
            hint="confirmed + in transit + delivered"
          />
        </FadeIn>
        {canViewCosts ? (
          <>
            <FadeIn delay={0.04}>
              <StatCard
                label="Net profit"
                value={formatBDT(summary.netProfit)}
                icon={PiggyBank}
                hint={`${formatPercent(summary.margin)} margin`}
                delta={summary.margin}
                deltaSuffix="%"
                iconClassName="bg-emerald-50 text-emerald-600"
              />
            </FadeIn>
            <FadeIn delay={0.08}>
              <StatCard
                label="Total cost"
                value={formatBDT(summary.cogs + summary.courierCost + summary.expenses)}
                icon={Receipt}
                hint={`COGS ${formatBDT(summary.cogs)}`}
                iconClassName="bg-amber-50 text-amber-600"
              />
            </FadeIn>
          </>
        ) : (
          <>
            <FadeIn delay={0.04}>
              <StatCard
                label="Pathao COD pending"
                value={formatBDT(cod.pendingCod + cod.deliveredUnsettled)}
                icon={Truck}
                hint={`${formatNumber(cod.pendingCount + cod.deliveredUnsettledCount)} parcels to collect`}
                iconClassName="bg-indigo-50 text-indigo-600"
              />
            </FadeIn>
            <FadeIn delay={0.08}>
              <StatCard
                label="Operational expenses"
                value={formatBDT(summary.expenses)}
                icon={Receipt}
                hint={`ad spend ${formatBDT(summary.adSpend)}`}
                iconClassName="bg-amber-50 text-amber-600"
              />
            </FadeIn>
          </>
        )}
        <FadeIn delay={0.12}>
          <StatCard
            label="ROAS"
            value={`${summary.roas.toFixed(2)}×`}
            icon={Megaphone}
            hint={`${formatBDT(summary.adSpend)} ad spend`}
            iconClassName="bg-violet-50 text-violet-600"
          />
        </FadeIn>
      </div>

      {/* COD & realised profit snapshot — sourced from the Database 3 ledger */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          COD &amp; realised profit
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <FadeIn>
            <StatCard
              label="Collected cash (in hand)"
              value={formatBDT(ledgerStats.collected)}
              icon={HandCoins}
              hint="COD settled with courier"
              iconClassName="bg-emerald-50 text-emerald-600"
            />
          </FadeIn>
          <FadeIn delay={0.04}>
            <StatCard
              label="Pending courier COD"
              value={formatBDT(ledgerStats.pending)}
              icon={Truck}
              hint="cash still sitting with Pathao"
              iconClassName="bg-indigo-50 text-indigo-600"
            />
          </FadeIn>
          <FadeIn delay={0.08}>
            <StatCard
              label="Delivery & return charges"
              value={formatBDT(ledgerStats.charges)}
              icon={Receipt}
              hint="deducted on delivered + returned parcels"
              iconClassName="bg-amber-50 text-amber-600"
            />
          </FadeIn>
          <FadeIn delay={0.12}>
            <StatCard
              label="True net profit"
              value={formatBDT(ledgerStats.trueNet)}
              icon={PiggyBank}
              hint="ledger net − operating expenses"
              iconClassName="bg-emerald-50 text-emerald-600"
            />
          </FadeIn>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="overview" className="h-10 sm:h-7">
            Profit &amp; loss
          </TabsTrigger>
          <TabsTrigger value="expenses" className="h-10 sm:h-7">
            Expense hisab
          </TabsTrigger>
          <TabsTrigger value="cod" className="h-10 sm:h-7">
            COD settlement
          </TabsTrigger>
          <TabsTrigger value="ledger" className="h-10 sm:h-7">
            Profit ledger
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Revenue vs cost</CardTitle>
                <CardDescription>Daily comparison for the last 7 active days</CardDescription>
              </CardHeader>
              <CardContent>
                {barData.length ? (
                  <FinanceBarChart data={barData} />
                ) : (
                  <EmptyState icon={Receipt} title="Not enough data yet" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Where the money goes</CardTitle>
                <CardDescription>Ad spend, packaging, salary &amp; other</CardDescription>
              </CardHeader>
              <CardContent>
                {expenseData.length ? (
                  <ExpenseDonutChart data={expenseData} />
                ) : (
                  <EmptyState icon={Wallet} title="No expenses logged" />
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Profit &amp; loss statement</CardTitle>
              <CardDescription>
                {periodLabel} · BDT ৳ ·{" "}
                <span className="font-medium">Revenue − COGS − Courier fees − Expenses = Net profit</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canViewCosts ? (
                <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                  <div className="space-y-2">
                    <LedgerRow label="Gross product revenue" value={summary.revenue} tone="positive" />
                    <LedgerRow label="Cost of goods sold" value={-summary.cogs} />
                    <LedgerRow label="Gross profit" value={summary.grossProfit} strong tone="positive" />
                  </div>
                  <div className="space-y-2">
                    <LedgerRow label="Courier fees (Pathao)" value={-summary.courierCost} />
                    <LedgerRow label="Operational expenses" value={-summary.expenses} />
                    <Separator />
                    <LedgerRow
                      label="Net profit"
                      value={summary.netProfit}
                      strong
                      tone={summary.netProfit >= 0 ? "positive" : "negative"}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <LedgerRow label="Gross product revenue" value={summary.revenue} tone="positive" />
                    <LedgerRow label="Courier fees (Pathao)" value={-summary.courierCost} />
                    <LedgerRow label="Operational expenses" value={-summary.expenses} />
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
                    Buying cost (COGS) and net profit are hidden for your role. Ask the shop owner for access.
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Expense ratio to revenue</span>
                  <span className="font-semibold tabular">{formatPercent(expenseRatio)}</span>
                </div>
                <Progress value={Math.min(expenseRatio, 100)} indicatorClassName="bg-amber-500" />
                <p className="text-[11px] text-muted-foreground">
                  Keep this under 25% to stay comfortably profitable on Pathao COD orders.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                { key: "AD_SPEND" as ExpenseCategory, icon: Megaphone },
                { key: "PACKAGING" as ExpenseCategory, icon: Package },
                { key: "SALARY" as ExpenseCategory, icon: Users },
                { key: "OTHER" as ExpenseCategory, icon: Wallet },
              ] as const
            ).map(({ key, icon: Icon }) => {
              const amount = summary.expenseByCategory.find((entry) => entry.category === key)?.amount ?? 0;
              return (
                <Card key={key} className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">
                      {EXPENSE_CATEGORY_META[key].label}
                    </p>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-1.5 text-lg font-semibold tabular">{formatBDT(amount)}</p>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Expense log</CardTitle>
                <CardDescription>
                  {allExpenses.length} entries · {formatBDT(summary.expenses)} total
                </CardDescription>
              </div>
              <AddExpenseDialog createdByName={createdByName} onAdd={addExpense} />
            </CardHeader>
            <CardContent className="px-0 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 sm:pl-5">Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allExpenses.map((expense) => {
                    const meta = EXPENSE_CATEGORY_META[expense.category];
                    return (
                      <TableRow key={expense.id}>
                        <TableCell className="pl-4 text-xs text-muted-foreground sm:pl-5">
                          {formatDate(expense.date)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.className}`}
                          >
                            {meta.label}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <p className="truncate text-sm">{expense.note}</p>
                          <p className="text-[11px] text-muted-foreground">by {expense.createdByName}</p>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular">
                          {formatBDT(expense.amountBdt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {allExpenses.length === 0 && <EmptyState icon={Receipt} title="No expenses recorded" />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cod" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <CodBucketCard
              label="Pending COD"
              hint="In transit — cash sitting with Pathao"
              value={cod.pendingCod}
              count={cod.pendingCount}
              icon={Truck}
              iconClassName="bg-indigo-50 text-indigo-600"
            />
            <CodBucketCard
              label="Delivered (unsettled)"
              hint="Delivered but not yet paid out"
              value={cod.deliveredUnsettled}
              count={cod.deliveredUnsettledCount}
              icon={Clock}
              iconClassName="bg-amber-50 text-amber-600"
            />
            <CodBucketCard
              label="Settled / Paid"
              hint="Matched against the Pathao invoice"
              value={cod.settled}
              count={cod.settledCount}
              icon={CheckCircle2}
              iconClassName="bg-emerald-50 text-emerald-600"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HandCoins className="h-4 w-4 text-primary" /> COD settlement tracker
              </CardTitle>
              <CardDescription>
                {formatPercent(cod.settlementRate)} of {formatBDT(cod.totalCod)} collectable COD has been paid out ·
                reconcile the un-settled parcels against your Pathao payment invoice.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={Math.min(cod.settlementRate, 100)} indicatorClassName="bg-emerald-500" />
              {codOrders.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="hidden sm:table-cell">Zone</TableHead>
                        <TableHead>Bucket</TableHead>
                        <TableHead className="text-right">COD amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {codOrders.slice(0, 25).map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="text-sm font-medium">{order.orderNumber}</TableCell>
                          <TableCell className="max-w-[180px]">
                            <p className="truncate text-sm">{order.customer.name}</p>
                            <p className="text-[11px] text-muted-foreground">{order.customer.phone}</p>
                          </TableCell>
                          <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                            {deliveryZoneLabel(order.deliveryZone, order.deliveryCharge)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={order.status === "DELIVERED" ? "warning" : "secondary"}>
                              {order.status === "DELIVERED" ? "Unsettled" : "In transit"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular">
                            {formatBDT(order.totalAmount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState icon={Banknote} title="No pending COD" description="Every COD parcel is settled." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger" className="space-y-3">
          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Transaction &amp; profit history</CardTitle>
                  <CardDescription>
                    {filteredLedger.length} of {effectiveLedger.length} entries · realised profit, return loss &amp;
                    COD state
                  </CardDescription>
                </div>
                {selected.size > 0 && (
                  <Button size="sm" className="h-10 sm:h-8" onClick={markSelectedCollected} disabled={bulkBusy}>
                    <CheckCircle2 className="h-4 w-4" />
                    {bulkBusy ? "Settling…" : `Mark ${selected.size} collected`}
                  </Button>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative sm:w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search order, consignment or note"
                    className="h-10 pl-8 sm:h-8"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {LEDGER_FILTERS.map((filter) => (
                    <Button
                      key={filter.value}
                      type="button"
                      size="sm"
                      variant={ledgerFilter === filter.value ? "default" : "outline"}
                      className="h-10 px-3 text-xs sm:h-7 sm:px-2.5"
                      onClick={() => setLedgerFilter(filter.value)}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-0">
              {filteredLedger.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 pl-4 sm:pl-5">
                          {selectableIds.length > 0 && (
                            <input
                              type="checkbox"
                              aria-label="Select all pending COD"
                              className="h-4 w-4 accent-primary"
                              checked={selectableIds.every((id) => selected.has(id))}
                              onChange={(event) =>
                                setSelected(event.target.checked ? new Set(selectableIds) : new Set())
                              }
                            />
                          )}
                        </TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Order / Consignment</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Collected</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Product cost</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Delivery</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead>COD status</TableHead>
                        <TableHead className="pr-4 text-right sm:pr-5">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLedger.map((entry) => {
                        const isPending = entry.collectionStatus === "PENDING";
                        const isBusy = busyIds.has(entry.id);
                        return (
                          <TableRow key={entry.id}>
                            <TableCell className="pl-4 sm:pl-5">
                              {isPending && (
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${entry.orderNumber ?? "entry"}`}
                                  className="h-4 w-4 accent-primary"
                                  checked={selected.has(entry.id)}
                                  onChange={() => toggleSelected(entry.id)}
                                />
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatDate(entry.createdAt)}
                            </TableCell>
                            <TableCell>
                              <p className="text-sm font-medium">{entry.orderNumber ?? "—"}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {entry.consignmentId ? `Consignment ${entry.consignmentId}` : entry.note ?? "—"}
                              </p>
                            </TableCell>
                            <TableCell>
                              <LedgerTypeBadge type={entry.type} />
                            </TableCell>
                            <TableCell className="text-right font-medium tabular">
                              {formatBDT(entry.collectedAmount)}
                            </TableCell>
                            <TableCell className="hidden text-right tabular text-muted-foreground sm:table-cell">
                              {canViewCosts ? formatBDT(entry.productCost) : "—"}
                            </TableCell>
                            <TableCell className="hidden text-right tabular text-muted-foreground sm:table-cell">
                              {formatBDT(entry.deliveryCharge)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right font-semibold tabular",
                                entry.netProfit >= 0 ? "text-emerald-600" : "text-rose-600",
                              )}
                            >
                              {canViewCosts || entry.type !== "ORDER_PROFIT" ? formatBDT(entry.netProfit) : "—"}
                            </TableCell>
                            <TableCell>
                              <CodStatusBadge status={entry.collectionStatus} />
                            </TableCell>
                            <TableCell className="pr-4 text-right sm:pr-5">
                              {isPending ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-10 sm:h-7"
                                  onClick={() => markCollected(entry.id)}
                                  disabled={isBusy}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {isBusy ? "…" : "Mark collected"}
                                </Button>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">
                                  {entry.collectedBy ? `by ${entry.collectedBy}` : "—"}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  icon={HandCoins}
                  title="No ledger entries yet"
                  description="Delivered and returned orders populate profit & loss here automatically."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="grid gap-3 sm:grid-cols-3"
      >
        <MiniStat label="Avg order value" value={formatBDT(summary.revenue / Math.max(orders.length, 1))} />
        <MiniStat label="Courier cost / order" value={formatBDT(summary.courierCost / Math.max(orders.length, 1))} />
        <MiniStat
          label="Ad spend / order"
          value={formatBDT(summary.adSpend / Math.max(orders.length, 1))}
        />
      </motion.div>
    </div>
  );
}

function LedgerRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: number;
  strong?: boolean;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={strong ? "text-sm font-semibold" : "text-sm text-muted-foreground"}>{label}</span>
      <span
        className={`tabular ${strong ? "text-base font-semibold" : "text-sm"} ${
          tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-rose-600" : ""
        }`}
      >
        {formatBDT(value)}
      </span>
    </div>
  );
}

function CodBucketCard({
  label,
  hint,
  value,
  count,
  icon: Icon,
  iconClassName,
}: {
  label: string;
  hint: string;
  value: number;
  count: number;
  icon: LucideIcon;
  iconClassName?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            iconClassName ?? "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-1.5 text-xl font-semibold tabular">{formatBDT(value)}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {count} parcel{count === 1 ? "" : "s"} · {hint}
      </p>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <BadgeDollarSign className="h-4 w-4" />
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-base font-semibold tabular">{value}</p>
      </div>
    </Card>
  );
}

function LedgerTypeBadge({ type }: { type: FinancialLedgerEntry["type"] }) {
  if (type === "ORDER_PROFIT") return <Badge variant="success">Profit</Badge>;
  if (type === "RETURN_DELIVERY_LOSS") return <Badge variant="destructive">Return loss</Badge>;
  if (type === "EXPENSE") return <Badge variant="warning">Expense</Badge>;
  return <Badge variant="muted">Adjustment</Badge>;
}

function CodStatusBadge({ status }: { status: FinancialLedgerEntry["collectionStatus"] }) {
  if (status === "COLLECTED") {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" /> Collected
      </Badge>
    );
  }
  if (status === "PENDING") {
    return (
      <Badge variant="warning" className="gap-1">
        <Clock className="h-3 w-3" /> Pending
      </Badge>
    );
  }
  return (
    <Badge variant="muted" className="gap-1">
      <ShieldAlert className="h-3 w-3" /> Waived / lost
    </Badge>
  );
}

function AddExpenseDialog({
  createdByName,
  onAdd,
}: {
  createdByName: string;
  onAdd: (expense: Omit<ExpenseLog, "id" | "shopId">) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState<ExpenseCategory>("AD_SPEND");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");

  function submit() {
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    onAdd({
      date: new Date().toISOString(),
      category,
      amountBdt: parsed,
      note: note.trim() || EXPENSE_CATEGORY_META[category].label,
      createdByName,
    });
    setAmount("");
    setNote("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-10 sm:h-8">
          <Plus className="h-4 w-4" /> Add expense
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record an expense</DialogTitle>
          <DialogDescription>Ad spend, packaging, salary or any other business cost.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as ExpenseCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(EXPENSE_CATEGORY_META) as ExpenseCategory[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {EXPENSE_CATEGORY_META[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expense-amount">Amount (৳)</Label>
            <Input
              id="expense-amount"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="4500"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expense-note">Note</Label>
            <Input
              id="expense-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Facebook ads — iPhone 15 campaign"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Save expense</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
