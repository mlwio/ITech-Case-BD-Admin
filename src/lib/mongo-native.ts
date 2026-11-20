import "server-only";
import { MongoClient, type Db } from "mongodb";

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
      return process.env.DATABASE_3_URL || process.env.CORE_DATABASE_URL;
    case "orders":
      return process.env.DATABASE_1_URL;
    case "customers":
      return process.env.DATABASE_2_URL;
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
      if (!isNativeMongoConfigured(database)) {
        return { database, configured: false, ok: false };
      }
      const startedAt = Date.now();
      try {
        await (await getNativeMongoDb(database)).command({ ping: 1 });
        return { database, configured: true, ok: true, latencyMs: Date.now() - startedAt };
      } catch {
        return { database, configured: true, ok: false, latencyMs: Date.now() - startedAt };
      }
    }),
  );
  return results;
}
