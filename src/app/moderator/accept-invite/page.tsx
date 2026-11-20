import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, MessageCircle } from "lucide-react";
import { corePrisma, isDatabaseConfigured } from "@/lib/prisma";
import { ModeratorInviteForm } from "@/components/auth/moderator-invite-form";

export const metadata: Metadata = { title: "Moderator Invitation" };
export const dynamic = "force-dynamic";

/** Where people with a bad/expired invite are asked to reach the team. */
const FACEBOOK_PAGE_URL = "https://www.facebook.com/itechcasebd";

/**
 * Public onboarding page reached from the invite email. Validates the
 * `?token=` against `corePrisma` and, when valid, renders the registration
 * form. Stays outside the auth middleware matcher (no session yet).
 */
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";

  let invitedEmail: string | null = null;

  if (token && isDatabaseConfigured) {
    try {
      const user = await corePrisma.user.findFirst({
        where: { inviteToken: token, inviteStatus: "INVITED" },
      });
      if (user && user.inviteExpiresAt && user.inviteExpiresAt.getTime() > Date.now()) {
        invitedEmail = user.email;
      }
    } catch (error) {
      console.error("[moderator:accept-invite]", error);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950 px-4 py-10">
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl" />

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl">
        <div className="bg-[#0f1427] px-6 py-6">
          <p className="text-lg font-bold tracking-wide text-white">ITech Case BD</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-[#c9a24a]">
            Moderator Onboarding
          </p>
        </div>

        <div className="p-6 sm:p-7">
          {invitedEmail ? (
            <>
              <h1 className="text-xl font-semibold">Complete your registration</h1>
              <p className="mt-1 mb-5 text-sm text-muted-foreground">
                Set your details to activate your moderator account.
              </p>
              <ModeratorInviteForm email={invitedEmail} token={token} />
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-900">
                    Invitation link invalid or expired
                  </p>
                  <p className="text-xs leading-relaxed text-amber-800">
                    This invitation link is no longer valid. It may have already been used, or it has
                    expired. Please ask the shop owner to send a fresh invite.
                  </p>
                </div>
              </div>

              <a
                href={FACEBOOK_PAGE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#1877f2] text-sm font-semibold text-white transition-colors hover:bg-[#166fe5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1877f2]/60 focus-visible:ring-offset-2"
              >
                <MessageCircle className="h-4 w-4" /> Contact Owner on Facebook
              </a>

              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
