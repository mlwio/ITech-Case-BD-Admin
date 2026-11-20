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
import { sendMail } from "@/lib/mailer";
import { moderatorInviteEmail } from "@/lib/email-templates/moderator-invite";
import { resolveAppBaseUrl } from "@/lib/app-url";
import type { MemberRole, PermissionKey, Permissions, ShopMember } from "@/lib/types";

export interface TeamActionResult {
  ok: boolean;
  mode: "database";
  message: string;
  member?: ShopMember;
}

/** Invitation links stay valid for 7 days. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A single-use, unguessable token (32 random bytes, base64url) embedded in the
 * invite link. The CSPRNG makes collisions negligible without a unique index.
 */
function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Fire-and-forget invitation email. A mail failure must never block the
 * moderator row from being created, so this never throws.
 */
async function sendInviteEmail(email: string, inviteToken: string): Promise<void> {
  try {
    const inviteUrl = `${resolveAppBaseUrl()}/moderator/accept-invite?token=${inviteToken}`;
    const mail = moderatorInviteEmail({ email, inviteUrl });
    const sent = await sendMail({
      to: email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    if (!sent.ok) {
      console.warn(`[team] invite email not delivered (${sent.error})`);
    }
  } catch (error) {
    console.warn("[team] invite email threw", error);
  }
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
    inviteStatus: ShopMember["inviteStatus"] | null;
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
    inviteStatus:
      row.user.inviteStatus === "INVITED" ? "INVITED" : row.isActive ? "ACTIVE" : "DISABLED",
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

    // A fresh invitation token, recorded on the account so the emailed link can
    // be validated (and expires after 7 days).
    const inviteToken = generateInviteToken();
    const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

    // An account without any active team membership starts a fresh onboarding:
    // clear the old credential *and* the stale phone so the invite never
    // inherits a previous member's number. The moderator's real name, phone and
    // password are captured again when they accept the invite.
    const user = existing
      ? await corePrisma.user.update({
          where: { id: existing.id },
          data: {
            name,
            inviteToken,
            inviteExpiresAt,
            inviteStatus: "INVITED",
            ...(!anyMembership ? { passwordHash: null, phone: null } : {}),
          },
        })
      : await corePrisma.user.create({
          data: { name, email, inviteToken, inviteExpiresAt, inviteStatus: "INVITED" },
        });

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

    // Email #1 — the invitation. Best-effort: recorded state is already saved.
    await sendInviteEmail(user.email, inviteToken);

    revalidateTeam();
    return {
      ok: true,
      mode: "database",
      message: `${name} added — an invitation email is on its way to ${user.email}.`,
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

/* -------------------------------------------------------------------------- */
/*  Remove a moderator's access (revokes membership entirely)                 */
/* -------------------------------------------------------------------------- */

/**
 * Revokes a teammate's access to the shop by deleting their membership row.
 * The `User` record is kept (orders and audit entries reference `userId` as a
 * plain scalar across databases), but without an active membership the account
 * can no longer sign in — `getAuthSession` returns null. Re-inviting the same
 * email later restores access through the normal onboarding flow.
 */
export async function removeMemberAccessAction(memberId: string): Promise<TeamActionResult> {
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
      include: { user: true },
    });
    if (!target) return { ok: false, mode: "database", message: "Moderator not found." };

    if (target.role === "OWNER" || target.userId === session.userId) {
      return { ok: false, mode: "database", message: "The shop owner's access can't be removed." };
    }

    await corePrisma.shopMember.delete({ where: { id: target.id } });

    revalidateTeam();
    return {
      ok: true,
      mode: "database",
      message: `${target.user.name} no longer has access to this shop.`,
    };
  } catch (error) {
    // Log the real cause server-side; never leak internals to the client.
    console.error("[team]", error);
    return { ok: false, mode: "database", message: "Could not complete the team update. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Resend a moderator invitation                                             */
/* -------------------------------------------------------------------------- */

/**
 * Issues a fresh invitation token (extending the 7-day window) and re-sends
 * Email #1 to the moderator. Used when the original invite expired or was lost.
 */
export async function resendModeratorInviteAction(memberId: string): Promise<TeamActionResult> {
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
      include: { user: true },
    });
    if (!target) return { ok: false, mode: "database", message: "Moderator not found." };
    if (target.role === "OWNER") {
      return { ok: false, mode: "database", message: "The owner doesn't need an invitation." };
    }

    const inviteToken = generateInviteToken();
    const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await corePrisma.user.update({
      where: { id: target.userId },
      data: { inviteToken, inviteExpiresAt, inviteStatus: "INVITED" },
    });

    await sendInviteEmail(target.user.email, inviteToken);

    revalidateTeam();
    return {
      ok: true,
      mode: "database",
      message: `Invitation re-sent to ${target.user.email}.`,
    };
  } catch (error) {
    // Log the real cause server-side; never leak internals to the client.
    console.error("[team]", error);
    return { ok: false, mode: "database", message: "Could not complete the team update. Please try again." };
  }
}
