import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getAuthSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

function safeNextPath(candidate?: string): string {
  if (!candidate) return "/dashboard";

  try {
    const target = new URL(candidate, "https://internal.invalid");
    const pathname = target.pathname.toLowerCase();
    if (
      target.origin !== "https://internal.invalid" ||
      pathname === "/login" ||
      pathname.startsWith("/login/") ||
      pathname.startsWith("/api/")
    ) {
      return "/dashboard";
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/dashboard";
  }
}

/**
 * Branded sign-in screen. Stays public (excluded from the middleware matcher)
 * and bounces already-authenticated visitors straight into the app.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; denied?: string };
}) {
  const nextPath = safeNextPath(searchParams.next);
  const session = await getAuthSession();
  if (session) redirect(nextPath);

  return (
    <LoginForm deniedPath={searchParams.denied ?? null} />
  );
}
