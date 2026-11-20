import { NextResponse } from "next/server";
import { parseOrderMessage } from "@/lib/order-parser";
import { getAuthSession } from "@/lib/auth/session";
import { checkRateLimit, clientIpFromHeaders, formatRetryAfter } from "@/lib/security/rate-limit";
import { sanitizeText } from "@/lib/security/validate";

/**
 * "AI Magic Paste" parser endpoint.
 *
 * Accepts a raw customer message (Bangla, Banglish or English) and returns the
 * structured draft the order desk can auto-fill. Runs fully offline — no paid
 * API, no external calls — so it is safe to hit on every paste.
 *
 * Zero-trust: requires an authenticated session and is rate limited per IP.
 */
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 4_000;

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIpFromHeaders(request.headers);
  const gate = checkRateLimit(`parse-order:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!gate.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${formatRetryAfter(gate.retryAfterMs)}.` },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const text =
    payload && typeof payload === "object" && typeof (payload as { text?: unknown }).text === "string"
      ? (payload as { text: string }).text
      : "";

  const clean = sanitizeText(text, MAX_MESSAGE_LENGTH);
  if (!clean) {
    return NextResponse.json({ error: "Provide a non-empty `text` field" }, { status: 400 });
  }

  return NextResponse.json({ draft: parseOrderMessage(clean) });
}
