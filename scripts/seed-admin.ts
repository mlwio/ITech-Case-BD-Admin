import { loadEnvConfig } from "@next/env";
import { hashPassword } from "../src/lib/auth/password";
import { resolveCoreDatabaseUrl } from "../src/lib/db-urls";

loadEnvConfig(process.cwd());

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Administrator";
  const databaseUrl = resolveCoreDatabaseUrl();

  if (!databaseUrl) {
    throw new Error("Configure DATABASE_3_URL, CORE_DATABASE_URL, or MONGODB_URI for the core database.");
  }
  if (!email || !password) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD before running the admin seed.");
  }
  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
  }

  const { corePrisma } = await import("../src/lib/prisma");

  try {
    const shop = await corePrisma.shop.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!shop) {
      throw new Error("No shop exists in the core database; create the shop before seeding its owner.");
    }

    const passwordHash = await hashPassword(password);
    const user = await corePrisma.user.upsert({
      where: { email },
      update: { passwordHash, inviteStatus: "ACTIVE" },
      create: { name, email, passwordHash, inviteStatus: "ACTIVE" },
      select: { id: true },
    });

    await corePrisma.shopMember.upsert({
      where: { shopId_userId: { shopId: shop.id, userId: user.id } },
      update: {
        role: "OWNER",
        isActive: true,
        canAccessOrders: true,
        canAccessProducts: true,
        canAccessCustomers: true,
        canAccessFinance: true,
        canAccessInventory: true,
      },
      create: {
        shopId: shop.id,
        userId: user.id,
        role: "OWNER",
        isActive: true,
        joinedAt: new Date(),
        canAccessOrders: true,
        canAccessProducts: true,
        canAccessCustomers: true,
        canAccessFinance: true,
        canAccessInventory: true,
      },
    });

    console.log(`Admin seed complete for ${email}. Password was not logged.`);
  } finally {
    await corePrisma.$disconnect();
  }
}

seedAdmin().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Admin seed failed.");
  process.exitCode = 1;
});
