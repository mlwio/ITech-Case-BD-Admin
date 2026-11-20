import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getAuthSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

/**
 * Branded sign-in screen. Stays public (excluded from the middleware matcher)
 * and bounces already-authenticated visitors straight into the app.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; denied?: string };
}) {
  const nextPath = searchParams.next && searchParams.next.startsWith("/") ? searchParams.next : "/";
  const session = await getAuthSession();
  if (session) redirect(nextPath);

  return (
    <LoginForm
      nextPath={nextPath}
      deniedPath={searchParams.denied ?? null}
    />
  );
}
