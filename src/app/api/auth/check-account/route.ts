import { NextResponse } from "next/server";
import { checkLoginAccount } from "@/lib/auth/login-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(message: string, status: number) {
  return NextResponse.json(
    { ok: false, message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return fail("Invalid account lookup request.", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail("Invalid account lookup request.", 400);
  }

  const body = parsed as { email?: unknown };
  const result = await checkLoginAccount(body.email, request.headers);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
