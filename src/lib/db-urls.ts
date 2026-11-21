export interface DatabaseUrls {
  core?: string;
  orders?: string;
  customers?: string;
}

type Env = Record<string, string | undefined>;

const DEFAULT_DATABASES = {
  core: "itechcasebd_core",
  orders: "itechcasebd_orders",
  customers: "itechcasebd_customers",
} as const;

function withDefaultDatabase(uri: string | undefined, database: string): string | undefined {
  if (!uri?.trim()) return undefined;

  try {
    const parsed = new URL(uri.trim());
    if (parsed.protocol !== "mongodb:" && parsed.protocol !== "mongodb+srv:") {
      throw new Error("unsupported protocol");
    }
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = `/${database}`;
    }
    return parsed.toString();
  } catch {
    throw new Error(`Invalid MongoDB connection URL for database "${database}".`);
  }
}

export function resolveCoreDatabaseUrl(env: Env = process.env): string | undefined {
  return withDefaultDatabase(
    env.DATABASE_3_URL || env.CORE_DATABASE_URL || env.MONGODB_URI,
    DEFAULT_DATABASES.core,
  );
}

export function resolveOrdersDatabaseUrl(env: Env = process.env): string | undefined {
  return withDefaultDatabase(
    env.DATABASE_1_URL || env.ORDERS_MONGODB_MONGODB_URI,
    DEFAULT_DATABASES.orders,
  );
}

export function resolveCustomersDatabaseUrl(env: Env = process.env): string | undefined {
  return withDefaultDatabase(
    env.DATABASE_2_URL || env.CUSTOMER_MONGODB_MONGODB_URI,
    DEFAULT_DATABASES.customers,
  );
}

export function resolveDatabaseUrls(env: Env = process.env): DatabaseUrls {
  return {
    core: resolveCoreDatabaseUrl(env),
    orders: resolveOrdersDatabaseUrl(env),
    customers: resolveCustomersDatabaseUrl(env),
  };
}

function isLoopbackMongoUrl(uri: string | undefined): boolean {
  if (!uri) return false;
  try {
    const hostname = new URL(uri).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/**
 * Fill canonical Prisma variables from Marketplace aliases before Prisma CLI
 * or generated clients read datasource env() values.
 */
export function applyDatabaseUrlAliases(env: Env = process.env): DatabaseUrls {
  const urls = resolveDatabaseUrls(env);

  if (urls.core) {
    env.DATABASE_3_URL = urls.core;
    env.CORE_DATABASE_URL = urls.core;
    env.MONGODB_URI = urls.core;
    env.DIRECT_3_URL = urls.core;
    if (!env.DATABASE_URL || (env.NODE_ENV === "production" && isLoopbackMongoUrl(env.DATABASE_URL))) {
      env.DATABASE_URL = urls.core;
    }
    if (!env.DIRECT_URL || (env.NODE_ENV === "production" && isLoopbackMongoUrl(env.DIRECT_URL))) {
      env.DIRECT_URL = urls.core;
    }
  }
  if (urls.orders) {
    env.DATABASE_1_URL = urls.orders;
    env.DIRECT_1_URL = urls.orders;
    env.ORDERS_MONGODB_MONGODB_URI = urls.orders;
  }
  if (urls.customers) {
    env.DATABASE_2_URL = urls.customers;
    env.DIRECT_2_URL = urls.customers;
    env.CUSTOMER_MONGODB_MONGODB_URI = urls.customers;
  }

  return urls;
}
