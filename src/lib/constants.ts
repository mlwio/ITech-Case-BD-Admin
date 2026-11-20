import {
  LayoutDashboard,
  ShoppingBag,
  PlusCircle,
  Truck,
  Wallet,
  PackageSearch,
  PackagePlus,
  Boxes,
  Contact,
  Store,
  BarChart3,
  Users2,
  Home,
  PlugZap,
  type LucideIcon,
} from "lucide-react";
import type {
  ExpenseCategory,
  InventoryMovementReason,
  MemberRole,
  OrderStatus,
  Permissions,
  PermissionKey,
} from "@/lib/types";

/* -------------------------------------------------------------------------- */
/*  Navigation                                                                */
/* -------------------------------------------------------------------------- */

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  permission: PermissionKey | null;
  /** When set, only these roles see the item (mirrors `route-guards.ts`). */
  roles?: MemberRole[];
  badge?: "pending-orders" | "pathao-queue";
  description: string;
}

/** Desktop left-rail navigation (spec order). */
export const NAV_ITEMS: NavItem[] = [
  {
    title: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    permission: null,
    description: "Today's sales, pending orders & business pulse",
  },
  {
    title: "Orders",
    href: "/orders",
    icon: ShoppingBag,
    permission: "orders",
    badge: "pending-orders",
    description: "All orders across Messenger, WhatsApp, TikTok & web",
  },
  {
    title: "Create Order",
    href: "/orders/create",
    icon: PlusCircle,
    permission: "orders",
    description: "Manual entry for inbox & call-in orders",
  },
  {
    title: "Stock In",
    href: "/stock-in",
    icon: PackagePlus,
    permission: "inventory",
    description: "Fast cascading iPhone stock-in — add colours & top up units",
  },
  {
    title: "Customers",
    href: "/customers",
    icon: Contact,
    permission: "customers",
    description: "Directory, repeat buyers & return-risk insights",
  },
  {
    title: "Pathao Courier",
    href: "/courier",
    icon: Truck,
    permission: "orders",
    badge: "pathao-queue",
    description: "Consignments, pickups & delivery status sync",
  },
  {
    title: "Courier API Hub",
    href: "/couriers",
    icon: PlugZap,
    permission: "orders",
    roles: ["OWNER"],
    description: "Pathao credentials, webhook & pickup store setup",
  },
  {
    title: "Finance & Hisab",
    href: "/finance",
    icon: Wallet,
    permission: "finance",
    description: "Revenue, ad spend, packaging & profit hisab",
  },
  {
    title: "Products & Catalog",
    href: "/products",
    icon: PackageSearch,
    permission: "products",
    description: "iPhone case catalog, silicone colours & pricing",
  },
  {
    title: "Inventory Matrix",
    href: "/inventory",
    icon: Boxes,
    permission: "inventory",
    description: "iPhone model × colour stock, restocks & low-stock alerts",
  },
  {
    title: "Storefront & Landing Pages",
    href: "/storefront",
    icon: Store,
    permission: "products",
    description: "Website builder, landing pages & custom domain",
  },
  {
    title: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    permission: "orders",
    description: "Source performance, zones & product leaders",
  },
  {
    title: "Moderators & Settings",
    href: "/settings",
    icon: Users2,
    permission: null,
    roles: ["OWNER"],
    description: "Team roles, permissions & shop preferences",
  },
];

/** Navigation items a signed-in member is allowed to see. */
export function visibleNavItems(role: MemberRole, permissions: Permissions): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      (item.permission === null || permissions[item.permission]) &&
      (!item.roles || item.roles.includes(role)),
  );
}

/** Fixed mobile bottom navigation (spec: Home, Orders, Create, Finance, More). */
export interface MobileNavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  isPrimaryAction?: boolean;
  permission: PermissionKey | null;
}

export const MOBILE_NAV_ITEMS: MobileNavItem[] = [
  { title: "Home", href: "/", icon: Home, permission: null },
  { title: "Orders", href: "/orders", icon: ShoppingBag, permission: "orders" },
  {
    title: "Create",
    href: "/orders/create",
    icon: PlusCircle,
    isPrimaryAction: true,
    permission: "orders",
  },
  { title: "Stock In", href: "/stock-in", icon: PackagePlus, permission: "inventory" },
  { title: "Finance", href: "/finance", icon: Wallet, permission: "finance" },
  { title: "More", href: "/more", icon: LayoutDashboard, permission: null },
];

/* -------------------------------------------------------------------------- */
/*  Order status presentation                                                 */
/* -------------------------------------------------------------------------- */

export interface StatusMeta {
  label: string;
  /** Tailwind classes for a soft pill badge. */
  className: string;
  dot: string;
  /** Whether the status means the money is collected. */
  isRevenue: boolean;
  /** Whether it counts as a completed/closed order. */
  isClosed: boolean;
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  PLACED: {
    label: "Placed",
    className: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30",
    dot: "bg-blue-500",
    isRevenue: false,
    isClosed: false,
  },
  CONFIRMED: {
    label: "Confirmed",
    className: "bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-400/30",
    dot: "bg-green-500",
    isRevenue: true,
    isClosed: false,
  },
  HOLD: {
    label: "Hold",
    className: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30",
    dot: "bg-amber-500",
    isRevenue: false,
    isClosed: false,
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/30",
    dot: "bg-red-500",
    isRevenue: false,
    isClosed: true,
  },
  IN_TRANSIT: {
    label: "In Transit",
    className: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/30",
    dot: "bg-indigo-500",
    isRevenue: true,
    isClosed: false,
  },
  DELIVERED: {
    label: "Delivered",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30",
    dot: "bg-emerald-500",
    isRevenue: true,
    isClosed: true,
  },
  RETURNED: {
    label: "Returned",
    className: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30",
    dot: "bg-rose-500",
    isRevenue: false,
    isClosed: true,
  },
};

/** Render order for the high-contrast dashboard status tiles. */
export const STATUS_CARD_ORDER: OrderStatus[] = [
  "PLACED",
  "CONFIRMED",
  "HOLD",
  "IN_TRANSIT",
  "DELIVERED",
  "RETURNED",
  "CANCELLED",
];

export interface StatusCardMeta {
  label: string;
  /** Solid gradient classes for the high-contrast summary tile. */
  gradient: string;
  /** Coloured soft shadow that lifts the tile off the page. */
  glow: string;
}

/** High-contrast tiles for the dashboard (spec colour mapping). */
export const ORDER_STATUS_CARD: Record<OrderStatus, StatusCardMeta> = {
  PLACED: { label: "Placed", gradient: "from-blue-500 to-blue-600", glow: "shadow-blue-500/30" },
  CONFIRMED: { label: "Confirmed", gradient: "from-green-500 to-green-600", glow: "shadow-green-500/30" },
  HOLD: { label: "Hold", gradient: "from-amber-500 to-amber-600", glow: "shadow-amber-500/30" },
  IN_TRANSIT: { label: "In Transit", gradient: "from-indigo-500 to-indigo-600", glow: "shadow-indigo-500/30" },
  DELIVERED: { label: "Delivered", gradient: "from-emerald-500 to-emerald-600", glow: "shadow-emerald-500/30" },
  RETURNED: { label: "Returned", gradient: "from-rose-500 to-rose-600", glow: "shadow-rose-500/30" },
  CANCELLED: { label: "Cancelled", gradient: "from-red-500 to-red-600", glow: "shadow-red-500/30" },
};

/** Statuses that represent a live, actionable order for the inbox team. */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "PLACED",
  "CONFIRMED",
  "HOLD",
  "IN_TRANSIT",
];

/* -------------------------------------------------------------------------- */
/*  Delivery zones & Pathao                                                   */
/* -------------------------------------------------------------------------- */

export type ZoneKey = "DHAKA_INSIDE" | "DHAKA_SUB" | "OUTSIDE_DHAKA";

export const DELIVERY_ZONES: { key: ZoneKey; label: string; charge: number }[] = [
  { key: "DHAKA_INSIDE", label: "Dhaka City", charge: 70 },
  { key: "DHAKA_SUB", label: "Dhaka Sub-area", charge: 100 },
  { key: "OUTSIDE_DHAKA", label: "Outside Dhaka", charge: 130 },
];

export const DEFAULT_DELIVERY_CHARGE: Record<ZoneKey, number> = {
  DHAKA_INSIDE: 70,
  DHAKA_SUB: 100,
  OUTSIDE_DHAKA: 130,
};

/** One-tap delivery charge presets used on the create-order screen. */
export interface DeliveryPreset {
  key: ZoneKey;
  label: string;
  charge: number;
  zone: ZoneKey;
}

export const DELIVERY_PRESETS: DeliveryPreset[] = [
  ...DELIVERY_ZONES.map((item) => ({ ...item, zone: item.key })),
];

export function deliveryZoneLabel(zone: string, charge?: number): string {
  if (zone === "DHAKA") return charge === 100 ? "Dhaka Sub-area" : "Dhaka City";
  return "Outside Dhaka";
}

export function deliveryOptionFor(zone: string, charge?: number): ZoneKey {
  if (zone === "DHAKA") return charge === 100 ? "DHAKA_SUB" : "DHAKA_INSIDE";
  return "OUTSIDE_DHAKA";
}

export function storedDeliveryZone(zone: ZoneKey): "DHAKA" | "OTHER" {
  return zone === "OUTSIDE_DHAKA" ? "OTHER" : "DHAKA";
}

export const PATHAO_STATUS_META: Record<string, { label: string; className: string }> = {
  Pickup_Requested: {
    label: "Pickup Requested",
    className: "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-400/30",
  },
  Pickup_Pending: {
    label: "Pickup Pending",
    className: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30",
  },
  Picked: { label: "Picked", className: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30" },
  At_Hub: { label: "At Hub", className: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/30" },
  At_the_Sorting_Hub: {
    label: "At the Sorting Hub",
    className: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/30",
  },
  In_Transit: { label: "In Transit", className: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/30" },
  Received_at_Last_Mile_Hub: {
    label: "Received at Last-Mile Hub",
    className: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30",
  },
  Assigned_For_Delivery: {
    label: "Assigned For Delivery",
    className: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30",
  },
  Assigned_for_Delivery: {
    label: "Assigned for Delivery",
    className: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30",
  },
  Delivered: { label: "Delivered", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30" },
  Partial_Delivery: {
    label: "Partial Delivery",
    className: "bg-teal-50 text-teal-700 ring-teal-600/20 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-400/30",
  },
  Return: { label: "Return", className: "bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/30" },
  Return_Ongoing: {
    label: "Return Ongoing",
    className: "bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/30",
  },
  Returned: { label: "Returned", className: "bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/30" },
  Payment_Invoice: {
    label: "Payment Invoice (Settled)",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30",
  },
  Cancelled: { label: "Cancelled", className: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30" },
};

/** Lookup used by the drawer timeline; falls back to the raw status. */
export function pathaoStatusMeta(status: string | null | undefined) {
  if (!status) return null;
  return PATHAO_STATUS_META[status] ?? { label: status.replace(/_/g, " "), className: "bg-muted text-muted-foreground ring-border" };
}

/**
 * Canonical Pathao parcel lifecycle — the happy path a consignment walks from
 * booking to settlement. The drawer renders this as a step-by-step timeline.
 */
export const PATHAO_LIFECYCLE_STEPS: { status: string; label: string }[] = [
  { status: "Pickup_Requested", label: "Pickup Requested" },
  { status: "Picked", label: "Picked" },
  { status: "At_the_Sorting_Hub", label: "At the Sorting Hub" },
  { status: "In_Transit", label: "In Transit" },
  { status: "Received_at_Last_Mile_Hub", label: "Received at Last-Mile Hub" },
  { status: "Assigned_for_Delivery", label: "Assigned for Delivery" },
  { status: "Delivered", label: "Delivered" },
];

/** Alternate terminal states that can short-circuit the happy path. */
export const PATHAO_ALTERNATE_STEPS: string[] = [
  "Partial_Delivery",
  "Return",
  "Return_Ongoing",
  "Returned",
  "Payment_Invoice",
  "Cancelled",
];

/**
 * The ordered lifecycle a parcel has walked for a given Pathao status. Used by
 * the drawer timeline to keep status progression consistent.
 */
export function pathaoLifecycleStepsFor(status: string | null | undefined): string[] {
  const happyPath = PATHAO_LIFECYCLE_STEPS.map((step) => step.status);
  const deliveredIndex = happyPath.indexOf("Delivered");
  const beforeDelivery = happyPath.slice(0, deliveredIndex);

  switch (status) {
    case "Delivered":
    case "Payment_Invoice":
      return happyPath;
    case "Partial_Delivery":
      return [...beforeDelivery, "Delivered", "Partial_Delivery"];
    case "Returned":
      return [...beforeDelivery, "Return", "Return_Ongoing", "Returned"];
    case "Return":
    case "Return_Ongoing":
      return [...beforeDelivery, "Return", "Return_Ongoing"];
    default: {
      const index = status ? happyPath.indexOf(status) : -1;
      return index >= 0 ? happyPath.slice(0, index + 1) : ["Pickup_Requested"];
    }
  }
}

/** Maps a Pathao status onto the internal order status board. */
export const PATHAO_TO_ORDER_STATUS: Record<string, OrderStatus> = {
  Pickup_Requested: "IN_TRANSIT",
  Pickup_Pending: "IN_TRANSIT",
  Picked: "IN_TRANSIT",
  At_Hub: "IN_TRANSIT",
  At_the_Sorting_Hub: "IN_TRANSIT",
  In_Transit: "IN_TRANSIT",
  Received_at_Last_Mile_Hub: "IN_TRANSIT",
  Assigned_For_Delivery: "IN_TRANSIT",
  Assigned_for_Delivery: "IN_TRANSIT",
  Delivered: "DELIVERED",
  Partial_Delivery: "DELIVERED",
  Payment_Invoice: "DELIVERED",
  Return: "IN_TRANSIT",
  Return_Ongoing: "IN_TRANSIT",
  Returned: "RETURNED",
  Cancelled: "CANCELLED",
};

/** Pathao Courier API hosts per environment. */
export const PATHAO_API_BASE: Record<"SANDBOX" | "PRODUCTION", string> = {
  SANDBOX: "https://courier-api-sandbox.pathao.com",
  PRODUCTION: "https://api-hermes.pathao.com",
};

/** Pathao requires a weight & parcel type on every booking. */
export const PATHAO_DEFAULT_ITEM_WEIGHT = 0.5;
export const PATHAO_DELIVERY_TYPE_NORMAL = 48;
export const PATHAO_ITEM_TYPE_PARCEL = 2;

/* -------------------------------------------------------------------------- */
/*  Finance                                                                   */
/* -------------------------------------------------------------------------- */

export const EXPENSE_CATEGORY_META: Record<
  ExpenseCategory,
  { label: string; className: string; color: string }
> = {
  AD_SPEND: { label: "Ad Spend", className: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30", color: "#7c3aed" },
  PACKAGING: { label: "Packaging", className: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30", color: "#d97706" },
  SALARY: { label: "Salary", className: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30", color: "#2563eb" },
  OTHER: { label: "Other", className: "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-400/30", color: "#64748b" },
};

/** Low-stock alert threshold used across the inventory matrix (spec: ≤ 5). */
export const LOW_STOCK_THRESHOLD = 5;

/* -------------------------------------------------------------------------- */
/*  Inventory stock movements                                                 */
/* -------------------------------------------------------------------------- */

export const INVENTORY_MOVEMENT_META: Record<
  InventoryMovementReason,
  { label: string; className: string }
> = {
  RESTOCK: { label: "Restock", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30" },
  MANUAL_ADJUSTMENT: { label: "Manual adjustment", className: "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-400/30" },
  ORDER_CONFIRMED: { label: "Order confirmed", className: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30" },
  ORDER_CANCELLED: { label: "Order cancelled", className: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30" },
  ORDER_RETURNED: { label: "Order returned", className: "bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/30" },
  DAMAGE: { label: "Damaged / lost", className: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30" },
};

/* -------------------------------------------------------------------------- */
/*  Roles & granular permissions                                              */
/* -------------------------------------------------------------------------- */

export const PERMISSION_META: { key: PermissionKey; label: string; description: string }[] = [
  { key: "orders", label: "Orders", description: "View, create and update orders" },
  { key: "products", label: "Products", description: "Manage catalog, variants and pricing" },
  { key: "customers", label: "Customers", description: "Access the customer directory" },
  { key: "finance", label: "Finance", description: "Revenue, expense and profit hisab" },
  { key: "inventory", label: "Inventory", description: "Stock levels and adjustments" },
];

export const ROLE_META: Record<MemberRole, { label: string; className: string; description: string }> = {
  OWNER: {
    label: "Super Admin (Owner)",
    className: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/30",
    description: "Full access — profit, buying cost, Pathao API keys & audit logs",
  },
  MODERATOR: {
    label: "Moderator",
    className: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30",
    description: "Orders, Magic Paste, Pathao booking & printing — no cost or profit access",
  },
  PACKING_STAFF: {
    label: "Packing Staff",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30",
    description: "Confirmed order queue, thermal stickers & A4 packing lists only",
  },
};

export const ALL_PERMISSIONS: Permissions = {
  orders: true,
  products: true,
  customers: true,
  finance: true,
  inventory: true,
};

export const NO_PERMISSIONS: Permissions = {
  orders: false,
  products: false,
  customers: false,
  finance: false,
  inventory: false,
};

/** Default toggles applied to each role when an owner invites a teammate. */
export const DEFAULT_ROLE_PERMISSIONS: Record<MemberRole, Permissions> = {
  OWNER: { ...ALL_PERMISSIONS },
  MODERATOR: { orders: true, products: false, customers: true, finance: false, inventory: true },
  PACKING_STAFF: { orders: true, products: false, customers: false, finance: false, inventory: false },
};

/**
 * Roles allowed to see sensitive money figures — product buying cost
 * (`costPrice`) and net profit. Moderators and Packing Staff are hidden from
 * these fields by spec.
 */
export function canViewCosts(role: MemberRole, permissions: Permissions): boolean {
  return role === "OWNER" || permissions.finance;
}

/** Only the Super Admin (Owner) may edit the Pathao API credentials. */
export function canManageCourierCredentials(role: MemberRole): boolean {
  return role === "OWNER";
}

/* -------------------------------------------------------------------------- */
/*  Misc                                                                      */
/* -------------------------------------------------------------------------- */

export const SHOP_BRAND_FALLBACK_COLOR = "#4f46e5";
export const BDT_SYMBOL = "৳";
