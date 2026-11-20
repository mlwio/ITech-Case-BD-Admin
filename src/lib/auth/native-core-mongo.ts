import "server-only";
import { ObjectId } from "mongodb";
import type { MemberRole, Permissions } from "@/lib/types";
import { getCoreMongoDb } from "@/lib/mongo-native";

interface UserDocument {
  _id: ObjectId;
  name: string;
  email: string;
  passwordHash?: string | null;
  phone?: string | null;
  inviteStatus?: string | null;
  inviteToken?: string | null;
  inviteExpiresAt?: Date | null;
}

interface ShopMemberDocument {
  _id: ObjectId;
  userId: ObjectId;
  shopId: ObjectId;
  role: string;
  canAccessOrders?: boolean;
  canAccessProducts?: boolean;
  canAccessCustomers?: boolean;
  canAccessFinance?: boolean;
  canAccessInventory?: boolean;
  isActive?: boolean;
  joinedAt?: Date | null;
}

export interface NativeAuthAccount {
  user: {
    id: string;
    name: string;
    email: string;
    passwordHash: string | null;
    phone: string | null;
    inviteStatus: string | null;
  };
  member: {
    id: string;
    shopId: string;
    role: MemberRole;
    permissions: Permissions;
    joinedAt: Date | null;
  } | null;
}

export async function findNativeAuthAccount(email: string): Promise<NativeAuthAccount | null> {
  const db = await getCoreMongoDb();
  const user = await db.collection<UserDocument>("users").findOne({ email });
  if (!user) return null;

  const member = await db.collection<ShopMemberDocument>("shop_members").findOne({
    userId: user._id,
    $or: [{ isActive: true }, { isActive: { $exists: false } }],
  });

  return {
    user: {
      id: user._id.toHexString(),
      name: user.name,
      email: user.email,
      passwordHash: user.passwordHash ?? null,
      phone: user.phone ?? null,
      inviteStatus: user.inviteStatus ?? null,
    },
    member: member
      ? {
          id: member._id.toHexString(),
          shopId: member.shopId.toHexString(),
          role: (member.role || "MODERATOR") as MemberRole,
          permissions: {
            orders: member.canAccessOrders ?? true,
            products: member.canAccessProducts ?? false,
            customers: member.canAccessCustomers ?? true,
            finance: member.canAccessFinance ?? false,
            inventory: member.canAccessInventory ?? false,
          },
          joinedAt: member.joinedAt ?? null,
        }
      : null,
  };
}

export async function findNativeSessionAccount(
  userId: string,
  shopId: string,
): Promise<NativeAuthAccount | null> {
  if (!ObjectId.isValid(userId) || !ObjectId.isValid(shopId)) return null;
  const db = await getCoreMongoDb();
  const users = db.collection<UserDocument>("users");
  const user = await users.findOne({ _id: new ObjectId(userId) });
  if (!user) return null;

  const member = await db.collection<ShopMemberDocument>("shop_members").findOne({
    userId: user._id,
    shopId: new ObjectId(shopId),
    $or: [{ isActive: true }, { isActive: { $exists: false } }],
  });
  if (!member) return null;

  return {
    user: {
      id: user._id.toHexString(),
      name: user.name,
      email: user.email,
      passwordHash: user.passwordHash ?? null,
      phone: user.phone ?? null,
      inviteStatus: user.inviteStatus ?? null,
    },
    member: {
      id: member._id.toHexString(),
      shopId: member.shopId.toHexString(),
      role: (member.role || "MODERATOR") as MemberRole,
      permissions: {
        orders: member.canAccessOrders ?? true,
        products: member.canAccessProducts ?? false,
        customers: member.canAccessCustomers ?? true,
        finance: member.canAccessFinance ?? false,
        inventory: member.canAccessInventory ?? false,
      },
      joinedAt: member.joinedAt ?? null,
    },
  };
}

export type NativePasswordSetupResult =
  | { kind: "not-eligible" }
  | { kind: "no-active-membership" }
  | { kind: "ok"; account: NativeAuthAccount };

export async function setupNativePassword(
  email: string,
  name: string,
  phone: string,
  passwordHash: string,
): Promise<NativePasswordSetupResult> {
  const db = await getCoreMongoDb();
  const users = db.collection<UserDocument>("users");
  const user = await users.findOne({ email });
  if (!user || user.passwordHash) return { kind: "not-eligible" };

  const members = db.collection<ShopMemberDocument>("shop_members");
  const member = await members.findOne({
    userId: user._id,
    $or: [{ isActive: true }, { isActive: { $exists: false } }],
  });
  if (!member) return { kind: "no-active-membership" };

  const now = new Date();
  const update = await users.updateOne(
    { _id: user._id, passwordHash: null },
    {
      $set: {
        name,
        phone,
        passwordHash,
        inviteStatus: "ACTIVE",
        lastActiveAt: now,
        updatedAt: now,
      },
    },
  );
  if (update.modifiedCount !== 1) return { kind: "not-eligible" };

  if (!member.joinedAt) {
    await members.updateOne({ _id: member._id }, { $set: { joinedAt: now } });
  }

  const account = await findNativeSessionAccount(user._id.toHexString(), member.shopId.toHexString());
  return account ? { kind: "ok", account } : { kind: "no-active-membership" };
}

export type NativeInviteCompletionResult =
  | { kind: "invalid" }
  | { kind: "revoked" }
  | { kind: "ok"; account: NativeAuthAccount };

export async function completeNativeInvite(
  token: string,
  input: { name: string; phone: string; passwordHash: string },
): Promise<NativeInviteCompletionResult> {
  const db = await getCoreMongoDb();
  const users = db.collection<UserDocument>("users");
  const now = new Date();
  const inviteFilter = {
    inviteToken: token,
    inviteStatus: "INVITED",
    inviteExpiresAt: { $gt: now },
  };
  const user = await users.findOne(inviteFilter);
  if (!user) return { kind: "invalid" };

  const members = db.collection<ShopMemberDocument>("shop_members");
  const member = await members.findOne({
    userId: user._id,
    $or: [{ isActive: true }, { isActive: { $exists: false } }],
  });
  if (!member) return { kind: "revoked" };

  const update = await users.updateOne(inviteFilter, {
    $set: {
      name: input.name,
      phone: input.phone,
      passwordHash: input.passwordHash,
      inviteStatus: "ACTIVE",
      inviteToken: null,
      inviteExpiresAt: null,
      lastActiveAt: now,
      updatedAt: now,
    },
  });
  if (update.modifiedCount !== 1) return { kind: "invalid" };

  if (!member.joinedAt) {
    await members.updateOne({ _id: member._id }, { $set: { joinedAt: now } });
  }

  const account = await findNativeSessionAccount(user._id.toHexString(), member.shopId.toHexString());
  return account ? { kind: "ok", account } : { kind: "revoked" };
}

export async function updateNativeAuthActivity(
  userId: string,
  memberId: string,
  hasJoined: boolean,
): Promise<void> {
  const db = await getCoreMongoDb();
  await db.collection<UserDocument>("users").updateOne(
    { _id: new ObjectId(userId) },
    { $set: { lastActiveAt: new Date() } },
  );

  if (!hasJoined) {
    await db.collection<ShopMemberDocument>("shop_members").updateOne(
      { _id: new ObjectId(memberId) },
      { $set: { joinedAt: new Date() } },
    );
  }
}
