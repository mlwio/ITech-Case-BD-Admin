"use server";

/**
 * Team & access-control server actions (Owner only).
 *
 * When a database is attached these persist real logins — adding a teammate
 * creates a `User` row *without* a password plus an active `ShopMember`; the
 * teammate sets their own password the first time they sign in. Resetting a
 * password simply clears the hash so they can create a new one. Database
 * writes fail explicitly when persistence is unavailable.
 */

import { revalidatePath } from "next/cache";
import { corePrisma, isDatabaseConfigured } from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth/session";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/constants";
import type { MemberRole, PermissionKey, Permissions, ShopMember } from "@/lib/types";

export interface TeamActionResult {
  ok: boolean;
  mode: "database";
  message: string;
  member?: ShopMember;
}

const DENIED: TeamActionResult = {
  ok: false,
  mode: "database",
  message: "Only the shop owner can manage team access.",
};

async function requireOwnerSession() {
  const session = await getAuthSession();
  if (!session || session.role !== "OWNER" || !session.shopId) return null;
  return session;
}

function permissionData(permissions: Permissions) {
  return {
    canAccessOrders: permissions.orders,
    canAccessProducts: permissions.products,
    canAccessCustomers: permissions.customers,
    canAccessFinance: permissions.finance,
    canAccessInventory: permissions.inventory,
  };
}

type MemberRow = {
  id: string;
  shopId: string;
  userId: string;
  role: MemberRole;
  canAccessOrders: boolean;
  canAccessProducts: boolean;
  canAccessCustomers: boolean;
  canAccessFinance: boolean;
  canAccessInventory: boolean;
  isActive: boolean;
  invitedAt: Date;
  joinedAt: Date | null;
  user: {
    name: string;
    email: string;
    phone: string | null;
    avatar: string | null;
    lastActiveAt: Date | null;
  };
};

function mapMember(row: MemberRow): ShopMember {
  return {
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
    lastActiveAt: row.user.lastActiveAt?.toISOString() ?? null,
    joinedAt: (row.joinedAt ?? row.invitedAt).toISOString(),
  };
}

function revalidateTeam() {
  revalidatePath("/settings");
  revalidatePath("/more");
}

/* -------------------------------------------------------------------------- */
/*  Add a teammate — they set their own password on first sign-in             */
/* -------------------------------------------------------------------------- */

export async function inviteMemberAction(input: {
  name?: string;
  email: string;
  role: MemberRole;
  permissions?: Permissions;
}): Promise<TeamActionResult> {
  const session = await requireOwnerSession();
  if (!session) return DENIED;

  // Name is optional at invite time — the teammate fills in their own name and
  // phone during first-time onboarding. When the owner skips it we fall back to
  // the email's local part as a readable placeholder.
  const rawName = (input.name ?? "").trim();
  const email = input.email.trim().toLowerCase();

  if (!email) {
    return { ok: false, mode: "database", message: "Email is required." };
  }
  const name = rawName || email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, mode: "database", message: "Enter a valid email address." };
  }
  if (input.role === "OWNER") {
    return { ok: false, mode: "database", message: "There can only be one shop owner." };
  }

  if (!isDatabaseConfigured) {
    return {
      ok: false,
      mode: "database",
      message: "Team management requires a database connection.",
    };
  }

  try {
    const permissions = input.permissions ?? DEFAULT_ROLE_PERMISSIONS[input.role];

    const existing = await corePrisma.user.findUnique({ where: { email } });
    if (existing?.id === session.userId) {
      return { ok: false, mode: "database", message: "The owner account cannot be added as a moderator." };
    }

    if (existing) {
      const existingMember = await corePrisma.shopMember.findUnique({
        where: { shopId_userId: { shopId: session.shopId, userId: existing.id } },
      });
      if (existingMember) {
        return {
          ok: false,
          mode: "database",
          message: "This account is already on the team. Use the team controls to manage access or reset its password.",
        };
      }
    }

    const anyMembership = existing
      ? await corePrisma.shopMember.findFirst({ where: { userId: existing.id } })
      : null;
    // An account without any active team membership starts with a fresh
    // password setup, rather than inheriting an old credential.
    const user = existing
      ? await corePrisma.user.update({
          where: { id: existing.id },
          data: { name, ...(!anyMembership ? { passwordHash: null } : {}) },
        })
      : await corePrisma.user.create({ data: { name, email } });

    const row = await corePrisma.shopMember.create({
      data: {
        shopId: session.shopId,
        userId: user.id,
        role: input.role,
        isActive: true,
        ...permissionData(permissions),
      },
      include: { user: true },
    });

    revalidateTeam();
    return {
      ok: true,
      mode: "database",
      message: `${name} added — they'll create their own password at first sign-in.`,
      member: mapMember(row),
    };
  } catch (error) {
    // Log the real cause server-side; never leak internals to the client.
    console.error("[team]", error);
    return { ok: false, mode: "database", message: "Could not complete the team update. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Role & permission changes                                                 */
/* -------------------------------------------------------------------------- */

export async function updateMemberRoleAction(
  memberId: string,
  role: MemberRole,
): Promise<TeamActionResult> {
  const session = await requireOwnerSession();
  if (!session) return DENIED;

  if (role === "OWNER") {
    return { ok: false, mode: "database", message: "Ownership can't be reassigned from here." };
  }

  if (!isDatabaseConfigured) {
    return { ok: false, mode: "database", message: "Team management requires a database connection." };
  }

  try {
    const target = await corePrisma.shopMember.findFirst({
      where: { id: memberId, shopId: session.shopId },
    });
    if (!target) return { ok: false, mode: "database", message: "Member not found." };

    const row = await corePrisma.shopMember.update({
      where: { id: target.id },
      data: { role, ...permissionData(DEFAULT_ROLE_PERMISSIONS[role]) },
      include: { user: true },
    });
    revalidateTeam();
    return { ok: true, mode: "database", message: "Role updated.", member: mapMember(row) };
  } catch (error) {
    // Log the real cause server-side; never leak internals to the client.
    console.error("[team]", error);
    return { ok: false, mode: "database", message: "Could not complete the team update. Please try again." };
  }
}

export async function updateMemberPermissionAction(
  memberId: string,
  key: PermissionKey,
  value: boolean,
): Promise<TeamActionResult> {
  const session = await requireOwnerSession();
  if (!session) return DENIED;

  if (!isDatabaseConfigured) {
    return { ok: false, mode: "database", message: "Team management requires a database connection." };
  }

  const field = {
    orders: "canAccessOrders",
    products: "canAccessProducts",
    customers: "canAccessCustomers",
    finance: "canAccessFinance",
    inventory: "canAccessInventory",
  } as const;

  try {
    const target = await corePrisma.shopMember.findFirst({
      where: { id: memberId, shopId: session.shopId },
    });
    if (!target) return { ok: false, mode: "database", message: "Member not found." };

    const row = await corePrisma.shopMember.update({
      where: { id: target.id },
      data: { [field[key]]: value },
      include: { user: true },
    });
    revalidateTeam();
    return { ok: true, mode: "database", message: "Permission updated.", member: mapMember(row) };
  } catch (error) {
    // Log the real cause server-side; never leak internals to the client.
    console.error("[team]", error);
    return { ok: false, mode: "database", message: "Could not complete the team update. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Activate / deactivate & password reset                                    */
/* -------------------------------------------------------------------------- */

export async function setMemberActiveAction(
  memberId: string,
  isActive: boolean,
): Promise<TeamActionResult> {
  const session = await requireOwnerSession();
  if (!session) return DENIED;

  if (!isDatabaseConfigured) {
    return {
      ok: false,
      mode: "database",
      message: "Team management requires a database connection.",
    };
  }

  try {
    const target = await corePrisma.shopMember.findFirst({
      where: { id: memberId, shopId: session.shopId },
    });
    if (!target) return { ok: false, mode: "database", message: "Member not found." };
    if (target.role === "OWNER" && !isActive) {
      return { ok: false, mode: "database", message: "The shop owner can't be deactivated." };
    }

    const row = await corePrisma.shopMember.update({
      where: { id: target.id },
      data: { isActive },
      include: { user: true },
    });
    revalidateTeam();
    return {
      ok: true,
      mode: "database",
      message: isActive ? "Access restored." : "Account paused — they can no longer sign in.",
      member: mapMember(row),
    };
  } catch (error) {
    // Log the real cause server-side; never leak internals to the client.
    console.error("[team]", error);
    return { ok: false, mode: "database", message: "Could not complete the team update. Please try again." };
  }
}

/**
 * Clears a teammate's password so they can create a fresh one the next time
 * they sign in. Used both for "forgot password" and forced rotation.
 */
export async function resetMemberPasswordAction(memberId: string): Promise<TeamActionResult> {
  const session = await requireOwnerSession();
  if (!session) return DENIED;

  if (!isDatabaseConfigured) {
    return {
      ok: false,
      mode: "database",
      message: "Team management requires a database connection.",
    };
  }

  try {
    const target = await corePrisma.shopMember.findFirst({
      where: { id: memberId, shopId: session.shopId, role: { not: "OWNER" } },
    });
    if (!target) return { ok: false, mode: "database", message: "Moderator not found." };

    await corePrisma.user.update({ where: { id: target.userId }, data: { passwordHash: null } });

    revalidateTeam();
    return {
      ok: true,
      mode: "database",
      message: "Password cleared — they'll set a new one at their next sign-in.",
    };
  } catch (error) {
    // Log the real cause server-side; never leak internals to the client.
    console.error("[team]", error);
    return { ok: false, mode: "database", message: "Could not complete the team update. Please try again." };
  }
}
