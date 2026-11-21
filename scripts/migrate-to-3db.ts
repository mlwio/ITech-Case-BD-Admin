/**
 * Phase 2 — Idempotent 3-database migration.
 *
 *   Legacy monolithic DB (LEGACY_LOCAL_DATABASE_URL) → three isolated databases:
 *     • DATABASE_1  ordersPrisma     — Order, OrderItem, OrderAuditLog,
 *                                      ParcelTrackingEvent, PathaoWebhookEvent
 *     • DATABASE_2  customersPrisma  — Customer
 *     • DATABASE_3  corePrisma       — Shop, User, ShopMember, Product,
 *                                      ProductVariant, InventoryMovement,
 *                                      CourierCredential, Expense (legacy
 *                                      ExpenseLog), FinancialLedger (already
 *                                      live — never touched here)
 *
 * Every row is upserted by its original `_id`, so the script is safe to re-run.
 * It finishes by comparing source-vs-target row counts for every table and by
 * verifying that every `FinancialLedger.orderId` resolves to a migrated order.
 * Any mismatch aborts the process with a non-zero exit code.
 *
 * Run with:  npx tsx scripts/migrate-to-3db.ts
 */

import { PrismaClient as LegacyClient } from "@prisma/client";
import { PrismaClient as OrdersClient } from "../node_modules/.prisma/orders-client";
import { PrismaClient as CustomersClient } from "../node_modules/.prisma/customers-client";
import { PrismaClient as CoreClient } from "../node_modules/.prisma/core-client";
import { loadEnvConfig } from "@next/env";
import { applyDatabaseUrlAliases } from "../src/lib/db-urls";

/* -------------------------------------------------------------------------- */
/*  Environment                                                               */
/* -------------------------------------------------------------------------- */

loadEnvConfig(process.cwd());
applyDatabaseUrlAliases(process.env);

const legacyUrl = process.env.LEGACY_LOCAL_DATABASE_URL;
if (!legacyUrl) {
  console.error("✖ LEGACY_LOCAL_DATABASE_URL (migration source) is not set.");
  process.exit(1);
}

const legacy = new LegacyClient({ datasources: { db: { url: legacyUrl } } });
// Phase 1 already wrote the `FinancialLedger` collection into the legacy
// monolith database, so it is read with the core client pointed at the
// explicit local migration source.
const legacyCore = new CoreClient({ datasources: { db: { url: legacyUrl } } });
// The three targets read DATABASE_1_URL / DATABASE_2_URL / DATABASE_3_URL
// straight from the generated clients' datasource env().
const orders = new OrdersClient();
const customers = new CustomersClient();
const core = new CoreClient();

/* -------------------------------------------------------------------------- */
/*  Migration plan                                                            */
/* -------------------------------------------------------------------------- */

interface MigrationJob {
  /** Model name on the legacy client. */
  source: string;
  /** Model name on the target client (ExpenseLog → Expense, etc.). */
  target: string;
  /** Which of the three new clients owns this model. */
  db: "DATABASE_1" | "DATABASE_2" | "DATABASE_3";
  targetClient: Record<string, unknown>;
  /** Overrides the legacy read client (defaults to the legacy Prisma client). */
  sourceClient?: Record<string, unknown>;
}

const jobs: MigrationJob[] = [
  // Database 2 — Customers & CRM
  { source: "customer", target: "customer", db: "DATABASE_2", targetClient: customers as unknown as Record<string, unknown> },

  // Database 3 — Core Catalog, Finance & Admin
  { source: "shop", target: "shop", db: "DATABASE_3", targetClient: core as unknown as Record<string, unknown> },
  { source: "user", target: "user", db: "DATABASE_3", targetClient: core as unknown as Record<string, unknown> },
  { source: "shopMember", target: "shopMember", db: "DATABASE_3", targetClient: core as unknown as Record<string, unknown> },
  { source: "product", target: "product", db: "DATABASE_3", targetClient: core as unknown as Record<string, unknown> },
  { source: "productVariant", target: "productVariant", db: "DATABASE_3", targetClient: core as unknown as Record<string, unknown> },
  { source: "inventoryMovement", target: "inventoryMovement", db: "DATABASE_3", targetClient: core as unknown as Record<string, unknown> },
  { source: "courierCredential", target: "courierCredential", db: "DATABASE_3", targetClient: core as unknown as Record<string, unknown> },
  { source: "expenseLog", target: "expense", db: "DATABASE_3", targetClient: core as unknown as Record<string, unknown> },
  // Ledger rows live in the legacy monolith DB → read via the core client
  // bound to LEGACY_LOCAL_DATABASE_URL, upserted into DATABASE_3.
  {
    source: "financialLedger",
    target: "financialLedger",
    db: "DATABASE_3",
    targetClient: core as unknown as Record<string, unknown>,
    sourceClient: legacyCore as unknown as Record<string, unknown>,
  },

  // Database 1 — Orders & Fulfillment
  { source: "order", target: "order", db: "DATABASE_1", targetClient: orders as unknown as Record<string, unknown> },
  { source: "orderItem", target: "orderItem", db: "DATABASE_1", targetClient: orders as unknown as Record<string, unknown> },
  { source: "orderAuditLog", target: "orderAuditLog", db: "DATABASE_1", targetClient: orders as unknown as Record<string, unknown> },
  { source: "parcelTrackingEvent", target: "parcelTrackingEvent", db: "DATABASE_1", targetClient: orders as unknown as Record<string, unknown> },
  { source: "pathaoWebhookEvent", target: "pathaoWebhookEvent", db: "DATABASE_1", targetClient: orders as unknown as Record<string, unknown> },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

interface Delegate {
  findMany: (args?: unknown) => Promise<Array<Record<string, unknown>>>;
  count: () => Promise<number>;
  upsert: (args: { where: { id: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => Promise<unknown>;
}

function delegate(client: Record<string, unknown>, model: string): Delegate {
  return client[model] as unknown as Delegate;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

/* -------------------------------------------------------------------------- */
/*  Migrate                                                                   */
/* -------------------------------------------------------------------------- */

interface Row {
  label: string;
  db: string;
  source: number;
  target: number;
  ok: boolean;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  Phase 2 — migrating legacy DB into DATABASE_1 / _2 / _3           ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");

  const report: Row[] = [];

  for (const job of jobs) {
    const src = delegate(job.sourceClient ?? (legacy as unknown as Record<string, unknown>), job.source);
    const dst = delegate(job.targetClient, job.target);

    const rows = await src.findMany();
    for (const row of rows) {
      const id = row.id as string;
      const { id: _ignored, ...rest } = row;
      await dst.upsert({ where: { id }, create: row, update: rest });
    }

    const source = await src.count();
    const target = await dst.count();
    report.push({
      label: `${job.source} → ${job.target}`,
      db: job.db,
      source,
      target,
      ok: source === target,
    });
    console.log(`  ${pad(job.db, 11)} ${pad(job.source + " → " + job.target, 34)} ${source} ✔`);
  }

  const adminEmail = "itechcasebd@gmail.com";
  let admin = await core.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    const ownerMembership = await core.shopMember.findFirst({
      where: { role: "OWNER", isActive: true },
      orderBy: { invitedAt: "asc" },
    });
    const existingOwner = ownerMembership
      ? await core.user.findUnique({ where: { id: ownerMembership.userId } })
      : null;
    if (!ownerMembership || !existingOwner?.passwordHash) {
      throw new Error(
        `Cannot ensure ${adminEmail}: no migrated active OWNER with an existing password hash was found.`,
      );
    }
    admin = await core.user.update({
      where: { id: existingOwner.id },
      data: { email: adminEmail, inviteStatus: "ACTIVE" },
    });
  } else if (admin.inviteStatus !== "ACTIVE") {
    admin = await core.user.update({
      where: { id: admin.id },
      data: { inviteStatus: "ACTIVE" },
    });
  }

  const activeOwnerMembership = await core.shopMember.findFirst({
    where: { userId: admin.id, role: "OWNER", isActive: true },
  });
  if (!admin.passwordHash || !activeOwnerMembership) {
    throw new Error(`Admin validation failed for ${adminEmail}.`);
  }
  const ownerShop = await core.shop.findUnique({
    where: { id: activeOwnerMembership.shopId },
    select: { id: true },
  });
  if (!ownerShop) throw new Error(`No Shop record exists for ${adminEmail}'s active OWNER membership.`);
  console.log(
    `\nAdmin verified: ${adminEmail}; password hash present; ACTIVE; Shop and active OWNER membership present.`,
  );

  /* ---------------------------------------------------------------------- */
  /*  Verification — row-count parity                                        */
  /* ---------------------------------------------------------------------- */

  console.log("\n── Row-count parity ────────────────────────────────────────────────");
  console.log(`  ${pad("DATABASE", 11)} ${pad("TABLE", 36)} ${pad("SOURCE", 8)} ${pad("TARGET", 8)} STATUS`);
  let allOk = true;
  for (const row of report) {
    if (!row.ok) allOk = false;
    console.log(
      `  ${pad(row.db, 11)} ${pad(row.label, 36)} ${pad(String(row.source), 8)} ${pad(String(row.target), 8)} ${
        row.ok ? "OK" : "✖ MISMATCH"
      }`,
    );
  }
  const clusterTotals = report.reduce(
    (totals, row) => {
      totals[row.db] = (totals[row.db] || 0) + row.target;
      return totals;
    },
    {} as Record<string, number>,
  );
  console.log("\n── Migrated row totals ─────────────────────────────────────────────");
  for (const database of ["DATABASE_1", "DATABASE_2", "DATABASE_3"]) {
    console.log(`  ${pad(database, 11)} ${clusterTotals[database] ?? 0} rows`);
  }

  /* ---------------------------------------------------------------------- */
  /*  Verification — FinancialLedger.orderId ↔ ordersPrisma.order.id         */
  /* ---------------------------------------------------------------------- */

  console.log("\n── FinancialLedger ↔ Order integrity ───────────────────────────────");
  const ledgerRows = await core.financialLedger.findMany({
    select: { orderId: true, type: true, netProfit: true },
  });
  const orderIdSet = new Set((await orders.order.findMany({ select: { id: true } })).map((o) => o.id));
  const dangling = ledgerRows.filter((l) => l.orderId && !orderIdSet.has(l.orderId));

  const profit = ledgerRows
    .filter((l) => l.type === "ORDER_PROFIT")
    .reduce((sum, l) => sum + l.netProfit, 0);
  const loss = ledgerRows
    .filter((l) => l.type === "RETURN_DELIVERY_LOSS")
    .reduce((sum, l) => sum + l.netProfit, 0);

  console.log(`  Ledger rows            : ${ledgerRows.length}`);
  console.log(`  Linked to an order     : ${ledgerRows.filter((l) => l.orderId).length}`);
  console.log(`  Dangling orderId refs  : ${dangling.length}`);
  console.log(`  ORDER_PROFIT total     : ৳${profit.toFixed(2)}`);
  console.log(`  RETURN loss total      : ৳${loss.toFixed(2)}`);
  if (dangling.length > 0) {
    allOk = false;
    for (const d of dangling) console.log(`    ✖ orderId ${d.orderId} not found`);
  }

  console.log("\n════════════════════════════════════════════════════════════════════");
  if (allOk) {
    console.log("✔ Migration verified — 100% row-count parity, ledger fully linked.");
  } else {
    console.log("✖ Migration verification FAILED — see mismatches above.");
  }
  console.log("════════════════════════════════════════════════════════════════════");

  return allOk;
}

main()
  .then(async (ok) => {
    await Promise.all([
      legacy.$disconnect(),
      legacyCore.$disconnect(),
      orders.$disconnect(),
      customers.$disconnect(),
      core.$disconnect(),
    ]);
    process.exit(ok ? 0 : 1);
  })
  .catch(async (error) => {
    console.error("\n✖ Migration crashed:", error);
    await Promise.all([
      legacy.$disconnect(),
      legacyCore.$disconnect(),
      orders.$disconnect(),
      customers.$disconnect(),
      core.$disconnect(),
    ]);
    process.exit(1);
  });
