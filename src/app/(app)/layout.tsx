import { AppShell } from "@/components/layout/app-shell";

/** All authenticated screens share the sidebar / bottom-nav chrome. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
