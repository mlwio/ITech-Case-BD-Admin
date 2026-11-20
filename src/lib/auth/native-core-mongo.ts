import "server-only";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { MemberRole, Permissions } from "@/lib/types";

interface UserDocument {
  _id: ObjectId;
  name: string;
  email: string;
  passwordHash?: string | null;
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
  };
  member: {
    id: string;
    shopId: string;
    role: MemberRole;
    permissions: Permissions;
    joinedAt: Date | null;
  } | null;
}

type MongoGlobal = typeof globalThis & {
  __itechCoreAuthMongoClient?: MongoClient;
  __itechCoreAuthMongoConnection?: Promise<MongoClient>;
};

const globalForMongo = globalThis as MongoGlobal;

async function coreDatabase(): Promise<Db> {
  const uri = process.env.DATABASE_3_URL || process.env.CORE_DATABASE_URL;
  if (!uri) throw new Error("Core database URL is not configured.");

  if (!globalForMongo.__itechCoreAuthMongoClient) {
    globalForMongo.__itechCoreAuthMongoClient = new MongoClient(uri, {
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false,
      connectTimeoutMS: 8_000,
      serverSelectionTimeoutMS: 8_000,
      socketTimeoutMS: 10_000,
      maxPoolSize: 5,
    });
  }

  if (!globalForMongo.__itechCoreAuthMongoConnection) {
    const client = globalForMongo.__itechCoreAuthMongoClient;
    globalForMongo.__itechCoreAuthMongoConnection = client.connect().catch((error: unknown) => {
      globalForMongo.__itechCoreAuthMongoClient = undefined;
      globalForMongo.__itechCoreAuthMongoConnection = undefined;
      void client.close().catch(() => undefined);
      throw error;
    });
  }

  const client = await globalForMongo.__itechCoreAuthMongoConnection;
  return client.db();
}

export async function findNativeAuthAccount(email: string): Promise<NativeAuthAccount | null> {
  const db = await coreDatabase();
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

export async function updateNativeAuthActivity(
  userId: string,
  memberId: string,
  hasJoined: boolean,
): Promise<void> {
  const db = await coreDatabase();
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
