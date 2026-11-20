import { PrismaClient } from "prisma-orders-client";

/**
 * Database 1 — Orders & Fulfillment client (`ordersPrisma`).
 *
 * Owns `Order`, `OrderItem`, `OrderAuditLog`, `ParcelTrackingEvent` and
 * `PathaoWebhookEvent`. Customer and product references are stored as plain
 * scalar ids (no cross-database Prisma relations) and resolved with batch
 * lookups against `customersPrisma` / `corePrisma`.
 *
 * A global singleton keeps Next.js hot-reload (dev) and serverless (Vercel)
 * from exhausting the connection pool.
 */
const globalForPrisma = globalThis as unknown as {
  ordersPrisma: PrismaClient | undefined;
};

const ordersDatabaseUrl = process.env.DATABASE_1_URL;

export const ordersPrisma =
  globalForPrisma.ordersPrisma ??
  new PrismaClient({
    ...(ordersDatabaseUrl ? { datasources: { db: { url: ordersDatabaseUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.ordersPrisma = ordersPrisma;
}

/** True when Database 1 (Orders) has a connection string configured. */
export const isOrdersDatabaseConfigured = Boolean(process.env.DATABASE_1_URL);

export type { Prisma } from "prisma-orders-client";
