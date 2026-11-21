import "server-only";
import { MongoClient, type Db } from "mongodb";
import {
  resolveCoreDatabaseUrl,
  resolveCustomersDatabaseUrl,
  resolveOrdersDatabaseUrl,
} from "@/lib/db-urls";

export type NativeDatabaseName = "core" | "orders" | "customers";

interface NativeMongoCache {
  clients: Partial<Record<NativeDatabaseName, MongoClient>>;
  connections: Partial<Record<NativeDatabaseName, Promise<MongoClient>>>;
}

type MongoGlobal = typeof globalThis & {
  __itechNativeMongoCache?: NativeMongoCache;
};

const globalForMongo = globalThis as MongoGlobal;
const cache =
  globalForMongo.__itechNativeMongoCache ??
  (globalForMongo.__itechNativeMongoCache = { clients: {}, connections: {} });

function databaseUrl(name: NativeDatabaseName): string | undefined {
  switch (name) {
    case "core":
      return resolveCoreDatabaseUrl();
    case "orders":
      return resolveOrdersDatabaseUrl();
    case "customers":
      return resolveCustomersDatabaseUrl();
  }
}

function maskedMongoHost(uri: string): string | null {
  try {
    const host = new URL(uri).hostname.toLowerCase();
    return host.endsWith(".mongodb.net") ? `***.mongodb.net` : "***";
  } catch {
    return null;
  }
}

export function isNativeMongoConfigured(name: NativeDatabaseName): boolean {
  return Boolean(databaseUrl(name));
}

export async function getNativeMongoDb(name: NativeDatabaseName): Promise<Db> {
  const uri = databaseUrl(name);
  if (!uri) throw new Error(`The ${name} database URL is not configured.`);

  let client = cache.clients[name];
  if (!client) {
    client = new MongoClient(uri, {
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false,
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      socketTimeoutMS: 10_000,
      maxPoolSize: 5,
    });
    cache.clients[name] = client;
  }

  let connection = cache.connections[name];
  if (!connection) {
    connection = client.connect().catch((error: unknown) => {
      if (cache.clients[name] === client) delete cache.clients[name];
      if (cache.connections[name] === connection) delete cache.connections[name];
      void client.close().catch(() => undefined);
      throw error;
    });
    cache.connections[name] = connection;
  }

  return (await connection).db();
}

export async function getCoreMongoDb(): Promise<Db> {
  return getNativeMongoDb("core");
}

export async function getOrdersMongoDb(): Promise<Db> {
  return getNativeMongoDb("orders");
}

export async function getCustomersMongoDb(): Promise<Db> {
  return getNativeMongoDb("customers");
}

export async function pingNativeMongoDatabases() {
  const databases: NativeDatabaseName[] = ["core", "orders", "customers"];
  const results = await Promise.all(
    databases.map(async (database) => {
      const uri = databaseUrl(database);
      if (!uri) {
        return {
          database,
          configured: false,
          host: null,
          ok: false,
          error: `${database} database URL is not configured.`,
        };
      }
      const startedAt = Date.now();
      try {
        await (await getNativeMongoDb(database)).command({ ping: 1 });
        return {
          database,
          configured: true,
          host: maskedMongoHost(uri),
          ok: true,
          latencyMs: Date.now() - startedAt,
        };
      } catch (error) {
        return {
          database,
          configured: true,
          host: maskedMongoHost(uri),
          ok: false,
          latencyMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
  return results;
}
