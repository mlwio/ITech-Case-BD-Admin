/**
 * Domain model for the UI layer.
 *
 * The UI never imports Prisma types directly — the data layer maps database
 * rows into these shapes. That keeps components independent of the ORM.
 */

/* -------------------------------------------------------------------------- */
/*  Enums (mirrors prisma/schema.prisma)                                      */
/* -------------------------------------------------------------------------- */

export const ORDER_STATUSES = [
  "PLACED",
  "CONFIRMED",
  "HOLD",
  "CANCELLED",
  "IN_TRANSIT",
  "DELIVERED",
  "RETURNED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_SOURCES = [
  "MESSENGER",
  "WHATSAPP",
  "TIKTOK",
  "WEBSITE",
  "LANDING_PAGE",
  "CALL",
] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const EXPENSE_CATEGORIES = [
  "AD_SPEND",
  "PACKAGING",
  "SALARY",
  "OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const MEMBER_ROLES = ["OWNER", "MODERATOR", "PACKING_STAFF"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const INVENTORY_MOVEMENT_REASONS = [
  "RESTOCK",
  "MANUAL_ADJUSTMENT",
  "ORDER_CONFIRMED",
  "ORDER_CANCELLED",
  "ORDER_RETURNED",
  "DAMAGE",
] as const;
export type InventoryMovementReason = (typeof INVENTORY_MOVEMENT_REASONS)[number];

export const PERMISSION_KEYS = [
  "orders",
  "products",
  "customers",
  "finance",
  "inventory",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type Permissions = Record<PermissionKey, boolean>;

export type DeliveryZone = "DHAKA" | "CHITTAGONG" | "SYLHET" | "OTHER";

export const PATHAO_ENVIRONMENTS = ["SANDBOX", "PRODUCTION"] as const;
export type PathaoEnvironment = (typeof PATHAO_ENVIRONMENTS)[number];

/* -------------------------------------------------------------------------- */
/*  Entities                                                                  */
/* -------------------------------------------------------------------------- */

export interface Shop {
  id: string;
  name: string;
  logo: string | null;
  primaryColor: string;
  customDomain: string | null;
  createdAt: string;
}

export interface ShopMember {
  id: string;
  shopId: string;
  userId: string;
  role: MemberRole;
  permissions: Permissions;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  isActive: boolean;
  lastActiveAt: string | null;
  joinedAt: string;
}

export interface Product {
  id: string;
  shopId: string;
  name: string;
  brand: string;
  category: string;
  description: string | null;
  image: string | null;
  isActive: boolean;
  variants: ProductVariant[];
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  color: string;
  costPrice: number;
  sellingPrice: number;
  stockQty: number;
  lowStockThreshold: number;
}

export interface Customer {
  id: string;
  shopId: string;
  name: string;
  phone: string;
  address: string;
  zone: DeliveryZone;
  totalOrders: number;
  deliveredCount: number;
  returnedCount: number;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitCostPrice: number;
}

export interface Order {
  id: string;
  shopId: string;
  orderNumber: string;
  customerId: string;
  customer: Customer;
  status: OrderStatus;
  source: OrderSource;
  deliveryZone: DeliveryZone;
  deliveryCharge: number;
  discount: number;
  subtotal: number;
  totalAmount: number;
  courierName: string;
  consignmentId: string | null;
  pathaoStatus: string | null;
  courierFee: number;
  isPaymentSettled: boolean;
  note: string | null;
  createdById: string;
  createdByName: string;
  items: OrderItem[];
  placedAt: string;
  updatedAt: string;
}

export interface ExpenseLog {
  id: string;
  shopId: string;
  date: string;
  category: ExpenseCategory;
  amountBdt: number;
  note: string;
  createdByName: string;
}

export interface OrderAuditLog {
  id: string;
  orderId: string;
  action: string;
  details: string;
  performedBy: string;
  createdAt: string;
}

/** Append-only stock movement log (restocks, manual edits, order deductions). */
export interface InventoryMovement {
  id: string;
  shopId: string;
  variantId: string;
  variantName: string;
  sku: string;
  /** Signed change applied to stock (negative = deduction). */
  delta: number;
  reason: InventoryMovementReason;
  note: string | null;
  /** Stock level after the movement was applied. */
  resultingQty: number;
  performedBy: string;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Financial ledger (Phase 1 — Database 3)                                   */
/* -------------------------------------------------------------------------- */

export const LEDGER_ENTRY_TYPES = [
  "ORDER_PROFIT",
  "RETURN_DELIVERY_LOSS",
  "EXPENSE",
  "MANUAL_ADJUSTMENT",
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const COLLECTION_STATUSES = ["PENDING", "COLLECTED", "WAIVED_OR_LOST"] as const;
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];

/**
 * One row of the order profit/loss + delivery-charge + COD-collection ledger.
 * One entry per order (`orderId`), rewritten as the order's status changes.
 */
export interface FinancialLedgerEntry {
  id: string;
  shopId: string;
  orderId: string | null;
  orderNumber: string | null;
  consignmentId: string | null;
  type: LedgerEntryType;
  collectionStatus: CollectionStatus;
  /** Cash tracked against the entry (COD value; 0 for a return loss). */
  collectedAmount: number;
  /** subtotal − discount */
  productRevenue: number;
  /** Σ(unitCostPrice × quantity) */
  productCost: number;
  /** Actual delivery fee deducted (courierFee, else the order's charge). */
  deliveryCharge: number;
  /** (totalAmount − deliveryCharge) − productCost, or −returnFee on a return. */
  netProfit: number;
  note: string | null;
  collectedAt: string | null;
  collectedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Pathao courier (Phase 3)                                                  */
/* -------------------------------------------------------------------------- */

/** Merchant credentials + cached OAuth tokens for the Pathao Courier API. */
export interface CourierCredential {
  id: string;
  shopId: string;
  provider: "PATHAO";
  environment: PathaoEnvironment;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  storeId: string;
  webhookSecret: string;
  /** Cached bearer token issued by `/aladdin/api/v1/issue-token`. */
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null;
  /** The store (pickup point) the merchant ships from. */
  pickupStoreId: string | null;
  pickupStoreName: string | null;
  isActive: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
}

/**
 * Secret-free view of the Pathao credential that is safe to serialise into a
 * Client Component / RSC payload. Secrets (`clientSecret`, `password`,
 * `webhookSecret`, `accessToken`, `refreshToken`) are replaced with boolean
 * "is it set?" flags so the UI can render state without ever receiving them.
 */
export interface CourierCredentialPublic {
  id: string;
  shopId: string;
  provider: "PATHAO";
  environment: PathaoEnvironment;
  clientId: string;
  username: string;
  storeId: string;
  pickupStoreId: string | null;
  pickupStoreName: string | null;
  isActive: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  hasClientSecret: boolean;
  hasPassword: boolean;
  hasWebhookSecret: boolean;
  hasAccessToken: boolean;
}

/** A pickup store returned by `/aladdin/api/v1/stores`. */
export interface PathaoStore {
  storeId: string;
  storeName: string;
  storeAddress: string;
  cityName: string;
  zoneName: string;
  isActive: boolean;
}

/** Immutable Pathao lifecycle event shown in the order drawer timeline. */
export interface ParcelTrackingEvent {
  id: string;
  orderId: string;
  consignmentId: string | null;
  status: string;
  message: string | null;
  source: string;
  occurredAt: string;
}

/** Pathao city/zone lookup rows used by the address auto-mapper. */
export interface PathaoCity {
  cityId: number;
  cityName: string;
}

export interface PathaoZone {
  zoneId: number;
  zoneName: string;
  cityId: number;
}

export interface PathaoArea {
  areaId: number;
  areaName: string;
  zoneId: number;
}
