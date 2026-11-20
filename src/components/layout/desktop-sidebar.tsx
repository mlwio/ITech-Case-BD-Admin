"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Menu, UserRound, UserCog, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShopSwitcher, type ShopOption, BrandWordmark } from "@/components/layout/shop-switcher";
import { SidebarNav, type NavCounts } from "@/components/layout/sidebar-nav";
import { ThemeToggleMenuItem } from "@/components/layout/theme-toggle";
import { ROLE_META } from "@/lib/constants";
import { logoutAction } from "@/lib/actions/auth";
import { initialsOf } from "@/lib/format";
import type { PermissionKey } from "@/lib/types";

interface DesktopSidebarProps {
  shops: ShopOption[];
  user: { name: string; role: keyof typeof ROLE_META; permissions: Record<PermissionKey, boolean> };
  counts: NavCounts;
}

/** Header stays on one line; navigation drops down from beneath the logo. */
export function DesktopSidebar({ shops, user, counts }: DesktopSidebarProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 hidden h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md lg:flex">
        <Button
          type="button"
          variant={open ? "secondary" : "ghost"}
          size="icon"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="desktop-navigation"
          onClick={() => setOpen((value) => !value)}
          className="h-9 w-9 shrink-0 rounded-lg"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>

        <Link
          href="/"
          prefetch
          aria-label="Home"
          onClick={() => setOpen(false)}
          className="shrink-0 rounded-lg px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <BrandWordmark />
        </Link>

        <ShopSwitcher shops={shops} compact className="ml-1" />

        <div className="ml-auto flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label="Open profile settings"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-white">
                    {initialsOf(user.name)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" className="w-60">
              <DropdownMenuLabel className="flex flex-col">
                <span className="truncate">{user.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {ROLE_META[user.role].label}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/settings?tab=preferences")}>
                <UserRound className="h-4 w-4" /> Profile settings
              </DropdownMenuItem>
              {user.role === "OWNER" && (
                <DropdownMenuItem onSelect={() => router.push("/settings?tab=team")}>
                  <UserCog className="h-4 w-4" /> Moderator settings
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <ThemeToggleMenuItem />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-rose-600 focus:text-rose-600"
                onSelect={() => logoutAction()}
              >
                <LogOut className="h-4 w-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close navigation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setOpen(false)}
              className="fixed inset-x-0 bottom-0 top-14 z-20 hidden bg-foreground/20 lg:block"
            />

            <motion.aside
              id="desktop-navigation"
              aria-label="Main navigation"
              initial={{ opacity: 0, y: -14, scaleY: 0.96 }}
              animate={{ opacity: 1, y: 0, scaleY: 1 }}
              exit={{ opacity: 0, y: -10, scaleY: 0.97 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: "top left" }}
              className="fixed left-0 top-14 z-30 hidden max-h-[calc(100vh-3.5rem)] w-72 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-br-2xl border-b border-r border-sidebar-border bg-sidebar shadow-2xl lg:flex"
            >
              <div className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
                <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Workspace
                </p>
                <SidebarNav
                  role={user.role}
                  permissions={user.permissions}
                  counts={counts}
                  onNavigate={() => setOpen(false)}
                />
              </div>

              <div className="border-t border-sidebar-border px-4 py-3">
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Phase 1 · v0.1.0 — Pathao courier, BDT hisab &amp; multi-shop ready.
                </p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
