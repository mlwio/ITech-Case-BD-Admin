import { NextResponse } from "next/server";
import { loginWithPassword } from "@/lib/auth/login-service";

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
    return fail("Invalid login request.", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail("Invalid login request.", 400);
  }

  const body = parsed as { email?: unknown; password?: unknown };
  const result = await loginWithPassword(body, request.headers);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
