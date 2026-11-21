import { corePrisma, isCoreDatabaseConfigured } from "./prisma";
import { customersPrisma, isCustomersDatabaseConfigured } from "./prisma-customers";
import { ordersPrisma, isOrdersDatabaseConfigured } from "./prisma-orders";
import { mergePathaoCredential } from "./couriers/credential";
import type {
  CourierCredential,
  CourierCredentialPublic,
  Customer,
  ExpenseLog,
  FinancialLedgerEntry,
  InventoryMovement,
  Order,
  OrderAuditLog,
  ParcelTrackingEvent,
  Product,
  Shop,
  ShopMember,
} from "./types";

/**
 * Data access layer.
 *
 * Reads only persisted database records. If the database is unavailable, the
 * error is surfaced instead of presenting sample data as real business data.
 *
 * Phase 2 splits storage across three isolated databases:
 *   • Database 1 (`ordersPrisma`)    — orders, order items, audit & tracking
 *   • Database 2 (`customersPrisma`) — the customer directory
 *   • Database 3 (`corePrisma`)      — shop, members, catalog/stock, courier
 *                                      credentials, expenses & the ledger
 *
 * Because orders no longer join to customers/users in Prisma, related rows are
 * batch-fetched and merged in memory with O(N) Map lookups (no N+1 queries).
 */

export type DataSource = "database";

export interface DataResult<T> {
  data: T;
  source: DataSource;
}

async function runData<T>(
  label: string,
  configured: boolean,
  missingMessage: string,
  query: () => Promise<T>,
): Promise<DataResult<T>> {
  if (!configured) {
    throw new Error(missingMessage);
  }
  try {
    const data = await query();
    return { data, source: "database" };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error(`[data:${label}] Database query failed`, error);
    }
    throw error;
  }
}

/** Orders & fulfillment — Database 1 (`ordersPrisma`). */
function withOrdersDatabase<T>(label: string, query: () => Promise<T>): Promise<DataResult<T>> {
  return runData(label, isOrdersDatabaseConfigured, "The orders database is not configured.", query);
}

/** Customers & CRM — Database 2 (`customersPrisma`). */
function withCustomersDatabase<T>(label: string, query: () => Promise<T>): Promise<DataResult<T>> {
  return runData(label, isCustomersDatabaseConfigured, "The customers database is not configured.", query);
}

/** Core catalog / finance / admin — Database 3 (`corePrisma`). */
function withCoreDatabase<T>(label: string, query: () => Promise<T>): Promise<DataResult<T>> {
  return runData(label, isCoreDatabaseConfigured, "The core database is not configured.", query);
}

/* -------------------------------------------------------------------------- */
/*  Row mappers (Prisma → domain)                                             */
/* -------------------------------------------------------------------------- */

const num = (value: unknown): number => Number(value ?? 0);

type PrismaShopMember = {
  id: string;
  shopId: string;
  userId: string;
  role: ShopMember["role"];
  canAccessOrders: boolean;
  canAccessProducts: boolean;
  canAccessCustomers: boolean;
  canAccessFinance: boolean;
  canAccessInventory: boolean;
  isActive: boolean;
  joinedAt: Date | null;
  invitedAt: Date;
  user: {
    name: string;
    email: string;
    phone: string | null;
    avatar: string | null;
    lastActiveAt: Date | null;
    inviteStatus: ShopMember["inviteStatus"] | null;
  };
};

const mapMember = (row: PrismaShopMember): ShopMember => ({
  id: row.id,
  shopId: row.shopId,
  userId: row.userId,
  role: row.role,
  permissions: {
    orders: row.canAccessOrders,
    products: row.canAccessProducts,
    customers: row.canAccessCustomers,
    finance: row.canAccessFinance,
    inventory: row.canAccessInventory,
  },
  name: row.user.name,
  email: row.user.email,
  phone: row.user.phone,
  avatar: row.user.avatar,
  isActive: row.isActive,
  // A pending invite outranks the membership flag; otherwise a paused member
  // reads as DISABLED and everyone else as ACTIVE.
  inviteStatus:
    row.user.inviteStatus === "INVITED" ? "INVITED" : row.isActive ? "ACTIVE" : "DISABLED",
  lastActiveAt: row.user.lastActiveAt?.toISOString() ?? null,
  joinedAt: (row.joinedAt ?? row.invitedAt).toISOString(),
});

type PrismaProduct = {
  id: string;
  shopId: string;
  name: string;
  brand: string;
  category: string;
  description: string | null;
  image: string | null;
  isActive: boolean;
  variants: {
    id: string;
    productId: string;
    name: string;
    sku: string;
    color: string;
    costPrice: unknown;
    sellingPrice: unknown;
    stockQty: number;
    lowStockThreshold: number;
  }[];
};

const mapProduct = (row: PrismaProduct): Product => ({
  id: row.id,
  shopId: row.shopId,
  name: row.name,
  brand: row.brand,
  category: row.category,
  description: row.description,
  image: row.image,
  isActive: row.isActive,
  variants: row.variants.map((variant) => ({
    id: variant.id,
    productId: variant.productId,
    name: variant.name,
    sku: variant.sku,
    color: variant.color,
    costPrice: num(variant.costPrice),
    sellingPrice: num(variant.sellingPrice),
    stockQty: variant.stockQty,
    lowStockThreshold: variant.lowStockThreshold,
  })),
});

type PrismaCustomer = {
  id: string;
  shopId: string;
  name: string;
  phone: string;
  address: string;
  zone: Customer["zone"];
  totalOrders: number;
  deliveredCount: number;
  returnedCount: number;
  createdAt: Date;
};

const mapCustomer = (row: PrismaCustomer): Customer => ({
  id: row.id,
  shopId: row.shopId,
  name: row.name,
  phone: row.phone,
  address: row.address,
  zone: row.zone,
  totalOrders: row.totalOrders,
  deliveredCount: row.deliveredCount,
  returnedCount: row.returnedCount,
  createdAt: row.createdAt.toISOString(),
});

type PrismaOrder = {
  id: string;
  shopId: string;
  orderNumber: string;
  customerId: string;
  status: Order["status"];
  source: Order["source"];
  deliveryZone: Order["deliveryZone"];
  deliveryCharge: unknown;
  discount: unknown;
  subtotal: unknown;
  totalAmount: unknown;
  courierName: string;
  consignmentId: string | null;
  pathaoStatus: string | null;
  courierFee: unknown;
  isPaymentSettled: boolean;
  note: string | null;
  createdById: string;
  placedAt: Date;
  updatedAt: Date;
  customer: PrismaCustomer;
  createdBy: { name: string };
  items: {
    id: string;
    orderId: string;
    variantId: string;
    productName: string;
    variantName: string;
    sku: string;
    quantity: number;
    unitPrice: unknown;
    unitCostPrice: unknown;
  }[];
};

const mapOrder = (row: PrismaOrder): Order => ({
  id: row.id,
  shopId: row.shopId,
  orderNumber: row.orderNumber,
  customerId: row.customerId,
  customer: mapCustomer(row.customer),
  status: row.status,
  source: row.source,
  deliveryZone: row.deliveryZone,
  deliveryCharge: num(row.deliveryCharge),
  discount: num(row.discount),
  subtotal: num(row.subtotal),
  totalAmount: num(row.totalAmount),
  courierName: row.courierName,
  consignmentId: row.consignmentId,
  pathaoStatus: row.pathaoStatus,
  courierFee: num(row.courierFee),
  isPaymentSettled: row.isPaymentSettled,
  note: row.note,
  createdById: row.createdById,
  createdByName: row.createdBy.name,
  items: row.items.map((item) => ({
    id: item.id,
    orderId: item.orderId,
    variantId: item.variantId,
    productName: item.productName,
    variantName: item.variantName,
    sku: item.sku,
    quantity: item.quantity,
    unitPrice: num(item.unitPrice),
    unitCostPrice: num(item.unitCostPrice),
  })),
  placedAt: row.placedAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/* -------------------------------------------------------------------------- */
/*  Accessors                                                                 */
/* -------------------------------------------------------------------------- */

export async function getShop(): Promise<DataResult<Shop>> {
  return withCoreDatabase(
    "getShop",
    async () => {
      const shop = await corePrisma.shop.findFirst({ orderBy: { createdAt: "asc" } });
      if (!shop) throw new Error("No shop row found");
      return {
        id: shop.id,
        name: shop.name,
        logo: shop.logo,
        primaryColor: shop.primaryColor,
        customDomain: shop.customDomain,
        createdAt: shop.createdAt.toISOString(),
      } satisfies Shop;
    },
  );
}

export async function getShopMembers(): Promise<DataResult<ShopMember[]>> {
  return withCoreDatabase(
    "getShopMembers",
    async () => {
      const rows = await corePrisma.shopMember.findMany({
        include: { user: true },
        orderBy: [{ role: "asc" }, { invitedAt: "asc" }],
      });
      return rows.map(mapMember);
    },
  );
}

export async function getProducts(): Promise<DataResult<Product[]>> {
  return withCoreDatabase(
    "getProducts",
    async () => {
      const rows = await corePrisma.product.findMany({
        include: { variants: { orderBy: { sellingPrice: "asc" } } },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(mapProduct);
    },
  );
}

export async function getCustomers(): Promise<DataResult<Customer[]>> {
  return withCustomersDatabase(
    "getCustomers",
    async () => {
      const rows = await customersPrisma.customer.findMany({ orderBy: { createdAt: "desc" } });
      return rows.map(mapCustomer);
    },
  );
}

export async function getOrders(limit = 300): Promise<DataResult<Order[]>> {
  return withOrdersDatabase(
    "getOrders",
    async () => {
      // Orders & items live in Database 1, customers in Database 2 and the
      // creating user in Database 3. Related rows are batch-fetched, then joined
      // in memory with O(N) Map lookups — no N+1 fan-out.
      const orders = await ordersPrisma.order.findMany({
        take: limit,
        orderBy: { placedAt: "desc" },
      });

      const orderIds = orders.map((order) => order.id);
      const customerIds = [...new Set(orders.map((order) => order.customerId))];
      const createdByIds = [...new Set(orders.map((order) => order.createdById))];

      const [items, customerRows, userRows] = await Promise.all([
        ordersPrisma.orderItem.findMany({ where: { orderId: { in: orderIds } } }),
        customersPrisma.customer.findMany({ where: { id: { in: customerIds } } }),
        corePrisma.user.findMany({
          where: { id: { in: createdByIds } },
          select: { id: true, name: true },
        }),
      ]);

      const itemsByOrder = new Map<string, PrismaOrder["items"]>();
      for (const item of items) {
        const bucket = itemsByOrder.get(item.orderId) ?? [];
        bucket.push(item);
        itemsByOrder.set(item.orderId, bucket);
      }
      const customerById = new Map(customerRows.map((customer) => [customer.id, customer]));
      const userNameById = new Map(userRows.map((user) => [user.id, user.name]));

      return orders.map((order) =>
        mapOrder({
          ...order,
          customer: customerById.get(order.customerId) ?? {
            id: order.customerId,
            shopId: order.shopId,
            name: "Unknown customer",
            phone: "",
            address: "",
            zone: "DHAKA",
            totalOrders: 0,
            deliveredCount: 0,
            returnedCount: 0,
            createdAt: new Date(0),
          },
          createdBy: { name: userNameById.get(order.createdById) ?? "Team member" },
          items: itemsByOrder.get(order.id) ?? [],
        }),
      );
    },
  );
}

export async function getExpenses(): Promise<DataResult<ExpenseLog[]>> {
  return withCoreDatabase(
    "getExpenses",
    async () => {
      const rows = await corePrisma.expense.findMany({ orderBy: { date: "desc" } });
      return rows.map((row: (typeof rows)[number]) => ({
        id: row.id,
        shopId: row.shopId,
        date: row.date.toISOString(),
        category: row.category,
        amountBdt: num(row.amountBdt),
        note: row.note,
        createdByName: "Tanvir Ahamed Akash",
      }));
    },
  );
}

export async function getAuditLogs(limit = 40): Promise<DataResult<OrderAuditLog[]>> {
  return withOrdersDatabase(
    "getAuditLogs",
    async () => {
      const rows = await ordersPrisma.orderAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return rows.map((row: (typeof rows)[number]) => ({
        id: row.id,
        orderId: row.orderId,
        action: row.action,
        details: row.details,
        performedBy: row.performedBy,
        createdAt: row.createdAt.toISOString(),
      }));
    },
  );
}

/* -------------------------------------------------------------------------- */
/*  Inventory movement ledger (Phase 4)                                       */
/* -------------------------------------------------------------------------- */

type PrismaInventoryMovement = {
  id: string;
  shopId: string;
  variantId: string;
  variantName: string;
  sku: string;
  delta: number;
  reason: InventoryMovement["reason"];
  note: string | null;
  resultingQty: number;
  performedBy: string;
  createdAt: Date;
};

const mapInventoryMovement = (row: PrismaInventoryMovement): InventoryMovement => ({
  id: row.id,
  shopId: row.shopId,
  variantId: row.variantId,
  variantName: row.variantName,
  sku: row.sku,
  delta: row.delta,
  reason: row.reason,
  note: row.note,
  resultingQty: row.resultingQty,
  performedBy: row.performedBy,
  createdAt: row.createdAt.toISOString(),
});

export async function getInventoryMovements(limit = 120): Promise<DataResult<InventoryMovement[]>> {
  return withCoreDatabase(
    "getInventoryMovements",
    async () => {
      const rows = await corePrisma.inventoryMovement.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return rows.map(mapInventoryMovement);
    },
  );
}

/* -------------------------------------------------------------------------- */
/*  Pathao courier (Phase 3)                                                  */
/* -------------------------------------------------------------------------- */

export async function getCourierCredential(): Promise<DataResult<CourierCredential>> {
  return withCoreDatabase(
    "getCourierCredential",
    async () => {
      const row = await corePrisma.courierCredential.findFirst({ orderBy: { createdAt: "asc" } });
      if (!row) {
        const shop = await corePrisma.shop.findFirst({ orderBy: { createdAt: "asc" } });
        if (!shop) throw new Error("No shop configured");
        const fromEnv = mergePathaoCredential(null);
        return {
          id: "",
          shopId: shop.id,
          provider: "PATHAO",
          environment: fromEnv.environment,
          clientId: fromEnv.clientId ?? "",
          clientSecret: fromEnv.clientSecret ?? "",
          username: fromEnv.username ?? "",
          password: fromEnv.password ?? "",
          storeId: fromEnv.storeId ?? "",
          webhookSecret: fromEnv.webhookSecret ?? "",
          accessToken: null,
          refreshToken: null,
          accessTokenExpiresAt: null,
          pickupStoreId: null,
          pickupStoreName: null,
          isActive: true,
          lastTestedAt: null,
          lastTestStatus: null,
          lastTestMessage: null,
        } satisfies CourierCredential;
      }
      const credential = mergePathaoCredential(row);
      return {
        id: row.id,
        shopId: row.shopId,
        provider: "PATHAO",
        environment: credential.environment,
        clientId: credential.clientId ?? "",
        clientSecret: credential.clientSecret ?? "",
        username: credential.username ?? "",
        password: credential.password ?? "",
        storeId: credential.storeId ?? "",
        webhookSecret: credential.webhookSecret ?? "",
        accessToken: row.accessToken,
        refreshToken: row.refreshToken,
        accessTokenExpiresAt: row.accessTokenExpiresAt?.toISOString() ?? null,
        pickupStoreId: row.pickupStoreId,
        pickupStoreName: row.pickupStoreName,
        isActive: row.isActive,
        lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
        lastTestStatus: row.lastTestStatus,
        lastTestMessage: row.lastTestMessage,
      } satisfies CourierCredential;
    },
  );
}

/**
 * Strips every secret out of a `CourierCredential` before it crosses the
 * server → client boundary. Only non-sensitive display fields plus boolean
 * "is it set?" flags remain, so API keys, the merchant password, the webhook
 * secret and the cached OAuth tokens never reach the browser / RSC payload.
 */
export function toPublicCourierCredential(credential: CourierCredential): CourierCredentialPublic {
  return {
    id: credential.id,
    shopId: credential.shopId,
    provider: credential.provider,
    environment: credential.environment,
    clientId: credential.clientId,
    username: credential.username,
    storeId: credential.storeId,
    pickupStoreId: credential.pickupStoreId,
    pickupStoreName: credential.pickupStoreName,
    isActive: credential.isActive,
    lastTestedAt: credential.lastTestedAt,
    lastTestStatus: credential.lastTestStatus,
    lastTestMessage: credential.lastTestMessage,
    hasClientSecret: Boolean(credential.clientSecret),
    hasPassword: Boolean(credential.password),
    hasWebhookSecret: Boolean(credential.webhookSecret),
    hasAccessToken: Boolean(credential.accessToken),
  };
}

export async function getParcelTrackingEvents(limit = 500): Promise<DataResult<ParcelTrackingEvent[]>> {
  return withOrdersDatabase(
    "getParcelTrackingEvents",
    async () => {
      const rows = await ordersPrisma.parcelTrackingEvent.findMany({
        orderBy: { occurredAt: "desc" },
        take: limit,
      });
      return rows.map((row: (typeof rows)[number]) => ({
        id: row.id,
        orderId: row.orderId,
        consignmentId: row.consignmentId,
        status: row.status,
        message: row.message,
        source: row.source,
        occurredAt: row.occurredAt.toISOString(),
      }));
    },
  );
}

/* -------------------------------------------------------------------------- */
/*  Financial ledger (Phase 1 — Database 3)                                   */
/* -------------------------------------------------------------------------- */

/** Complete order profit/loss + delivery-charge + COD-collection history. */
export async function getFinancialLedger(limit = 1000): Promise<DataResult<FinancialLedgerEntry[]>> {
  return withCoreDatabase(
    "getFinancialLedger",
    async () => {
      const rows = await corePrisma.financialLedger.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return rows.map((row: (typeof rows)[number]) => ({
        id: row.id,
        shopId: row.shopId,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        consignmentId: row.consignmentId,
        type: row.type,
        collectionStatus: row.collectionStatus,
        collectedAmount: num(row.collectedAmount),
        productRevenue: num(row.productRevenue),
        productCost: num(row.productCost),
        deliveryCharge: num(row.deliveryCharge),
        codFee: num(row.codFee),
        netProfit: num(row.netProfit),
        note: row.note,
        collectedAt: row.collectedAt?.toISOString() ?? null,
        collectedBy: row.collectedBy,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }));
    },
  );
}
