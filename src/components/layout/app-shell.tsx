import { DesktopSidebar } from "@/components/layout/desktop-sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { getSessionContext } from "@/lib/session";

function WorkspaceUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <section
        role="alert"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-lg sm:p-8"
      >
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Workspace temporarily unavailable
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          We couldn&apos;t connect to the live workspace database. Your saved data has not been
          replaced. Please retry when the connection is available.
        </p>
        <a
          href="/settings"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Retry connection
        </a>
      </section>
    </main>
  );
}

/**
 * Application chrome: desktop rail (lg+), sticky mobile header, fixed mobile
 * bottom navigation and the shared content container.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await getSessionContext();
  } catch {
    return <WorkspaceUnavailable />;
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <DesktopSidebar shops={session.shops} user={session.user} counts={session.counts} />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader
          shops={session.shops}
          user={session.user}
          counts={session.counts}
          notifications={session.notifications}
        />

        <main className="mx-auto w-full max-w-[1400px] flex-1 animate-in fade-in slide-in-from-bottom-2 px-3 pb-24 pt-4 duration-300 ease-out sm:px-5 lg:px-8 lg:pb-10 lg:pt-20">
          {children}
        </main>
      </div>

      <BottomNav permissions={session.user.permissions} />
    </div>
  );
}
