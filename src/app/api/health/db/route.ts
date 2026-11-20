import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { pingNativeMongoDatabases } from "@/lib/mongo-native";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });
  }
  if (session.role !== "OWNER") {
    return NextResponse.json({ ok: false, message: "Owner access required." }, { status: 403 });
  }

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
