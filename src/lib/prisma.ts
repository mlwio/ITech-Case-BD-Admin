import { PrismaClient as CorePrismaClient } from "prisma-core-client";
import { applyDatabaseUrlAliases } from "@/lib/db-urls";

/**
 * Database 3 — Core Catalog, Finance, Inventory & Admin client (`corePrisma`).
 *
 * Phase 2 split the monolithic database into three isolated databases:
 *   • Database 1 (`ordersPrisma`)    — `@/lib/prisma-orders`
 *   • Database 2 (`customersPrisma`) — `@/lib/prisma-customers`
 *   • Database 3 (`corePrisma`)      — this file
 *
 * `corePrisma` owns the shop tenancy & access control (`Shop`, `User`,
 * `ShopMember`), the catalog and live stock (`Product`, `ProductVariant`,
 * `InventoryMovement`), courier credentials (`CourierCredential`), and the
 * finance ledger (`Expense`, `FinancialLedger`).
 *
 * Next.js hot-reload (dev) and serverless (Vercel) both re-evaluate modules
 * frequently, which would otherwise exhaust the connection pool. Reusing a
 * global instance keeps a single client per process in dev and one per lambda
 * in production.
 */
const globalForPrisma = globalThis as unknown as {
  corePrisma: CorePrismaClient | undefined;
};

const coreDatabaseUrl = applyDatabaseUrlAliases().core;

export const corePrisma =
  globalForPrisma.corePrisma ??
  new CorePrismaClient({
    ...(coreDatabaseUrl ? { datasources: { db: { url: coreDatabaseUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.corePrisma = corePrisma;
}

/** True when the core database (Database 3) has a connection string configured. */
export const isCoreDatabaseConfigured = Boolean(coreDatabaseUrl);

/**
 * Backwards-compatible alias used across the server actions to gate features
 * that require database connectivity. Points at the core database, which every
 * authenticated surface depends on.
 */
export const isDatabaseConfigured = isCoreDatabaseConfigured;
