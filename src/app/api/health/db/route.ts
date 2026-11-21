import { NextResponse } from "next/server";
import { pingNativeMongoDatabases } from "@/lib/mongo-native";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const databases = await pingNativeMongoDatabases();
  const ok = databases.every((database) => database.configured && database.ok);
  return NextResponse.json(
    { ok, databases },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
