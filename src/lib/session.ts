import { redirect } from "next/navigation";
import { getOrders, getShop } from "@/lib/data";
import { corePrisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth/session";
import type { ShopOption } from "@/components/layout/shop-switcher";
import type { NavCounts } from "@/components/layout/sidebar-nav";
import type { NotificationItem } from "@/components/layout/mobile-header";
import { ACTIVE_ORDER_STATUSES } from "@/lib/constants";
import type { MemberRole, Order, Permissions } from "@/lib/types";
import { formatRelative } from "@/lib/format";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  permissions: Permissions;
}

export interface SessionContext {
  user: CurrentUser;
  shops: ShopOption[];
  counts: NavCounts;
  notifications: NotificationItem[];
  source: "database";
}

/**
 * Resolves the signed-in identity from the active database membership.
 */
export async function getSessionContext(): Promise<SessionContext> {
  const [shopResult, ordersResult] = await Promise.all([
    getShop(),
    getOrders(),
  ]);

  const user = await resolveCurrentUser();

  const shops: ShopOption[] = [shopResult.data].map((shop) => ({
    id: shop.id,
    name: shop.name,
    logo: shop.logo,
    primaryColor: shop.primaryColor,
    customDomain: shop.customDomain,
  }));

  return {
    user,
    shops,
    counts: computeNavCounts(ordersResult.data),
    notifications: buildNotifications(ordersResult.data),
    source: ordersResult.source,
  };
}

async function resolveCurrentUser(): Promise<CurrentUser> {
  const auth = await getAuthSession();
  if (!auth) redirect("/login");

  let member;
  try {
    member = await corePrisma.shopMember.findFirst({
      where: { userId: auth.userId, shopId: auth.shopId, isActive: true },
    });
  } catch {
    // A brief database read failure must not replace a signed-in user's identity.
    return {
      id: auth.userId,
      name: auth.name,
      email: auth.email,
      role: auth.role,
      permissions: auth.permissions,
    };
  }

  if (!member) redirect("/login");

  const userRow = await corePrisma.user.findUnique({ where: { id: auth.userId } }).catch(() => null);
  return {
    id: member.userId,
    name: userRow?.name ?? auth.name,
    email: userRow?.email ?? auth.email,
    role: member.role,
    permissions: {
      orders: member.canAccessOrders,
      products: member.canAccessProducts,
      customers: member.canAccessCustomers,
      finance: member.canAccessFinance,
      inventory: member.canAccessInventory,
    },
  };
}

export function computeNavCounts(orders: Order[]): NavCounts {
  return {
    pendingOrders: orders.filter((order) =>
      (["PLACED", "CONFIRMED", "HOLD"] as const).includes(order.status as never),
    ).length,
    pathaoQueue: orders.filter((order) => order.status === "IN_TRANSIT").length,
  };
}

/** Lightweight alert feed derived from live orders (no extra tables needed). */
export function buildNotifications(orders: Order[]): NotificationItem[] {
  const items: NotificationItem[] = [];

  const fresh = orders
    .filter((order) => ACTIVE_ORDER_STATUSES.includes(order.status))
    .slice(0, 5);

  for (const order of fresh) {
    items.push({
      id: `n-${order.id}`,
      title: `${order.orderNumber} · ${order.status.replace("_", " ").toLowerCase()}`,
      detail: `${order.customer.name} — ${order.source.toLowerCase()} order`,
      time: formatRelative(order.placedAt),
    });
  }

  const returns = orders.filter((order) => order.status === "RETURNED");
  if (returns.length) {
    items.push({
      id: "n-returns",
      title: `${returns.length} returned parcels`,
      detail: "Pathao return received — inspect before restocking",
      time: formatRelative(returns[0].updatedAt),
    });
  }

  return items.slice(0, 6);
}
