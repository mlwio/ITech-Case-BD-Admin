import { PrismaClient } from "prisma-customers-client";
import { applyDatabaseUrlAliases } from "@/lib/db-urls";

/**
 * Database 2 — Customers & CRM client (`customersPrisma`).
 *
 * Owns the `Customer` directory and its aggregate counters. A customer's
 * order history lives in Database 1, so it is fetched separately with
 * `ordersPrisma.order.findMany({ where: { customerId } })` and merged in
 * TypeScript.
 *
 * A global singleton keeps Next.js hot-reload (dev) and serverless (Vercel)
 * from exhausting the connection pool.
 */
const globalForPrisma = globalThis as unknown as {
  customersPrisma: PrismaClient | undefined;
};

const customersDatabaseUrl = applyDatabaseUrlAliases().customers;

export const customersPrisma =
  globalForPrisma.customersPrisma ??
  new PrismaClient({
    ...(customersDatabaseUrl ? { datasources: { db: { url: customersDatabaseUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.customersPrisma = customersPrisma;
}

/** True when Database 2 (Customers) has a connection string configured. */
export const isCustomersDatabaseConfigured = Boolean(customersDatabaseUrl);

export type { Prisma } from "prisma-customers-client";
