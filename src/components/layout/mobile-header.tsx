"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, LogOut, Menu, Plus, Search, Settings, UserCog } from "lucide-react";
import { toast } from "sonner";
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
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ShopSwitcher, type ShopOption } from "@/components/layout/shop-switcher";
import { SidebarNav, type NavCounts } from "@/components/layout/sidebar-nav";
import { ThemeToggleMenuItem } from "@/components/layout/theme-toggle";
import { ROLE_META } from "@/lib/constants";
import { logoutAction } from "@/lib/actions/auth";
import type { PermissionKey } from "@/lib/types";
import { formatNumber, initialsOf } from "@/lib/format";

export interface HeaderUser {
  name: string;
  role: keyof typeof ROLE_META;
  permissions: Record<PermissionKey, boolean>;
}

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  time: string;
}

interface MobileHeaderProps {
  shops: ShopOption[];
  user: HeaderUser;
  counts: NavCounts;
  notifications: NotificationItem[];
}

/** Sticky app header shown below `lg` — mirrors a native mobile app bar. */
export function MobileHeader({ shops, user, counts, notifications }: MobileHeaderProps) {
  const router = useRouter();
  const [navOpen, setNavOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card pt-safe lg:hidden">
      <div className="flex h-14 items-center gap-2 px-3">
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[82%] max-w-xs gap-0 p-0">
            <SheetHeader className="border-b border-sidebar-border pb-4">
              <SheetTitle className="text-left">ITech Case BD</SheetTitle>
              <p className="text-xs text-muted-foreground">Order Management Suite</p>
            </SheetHeader>
            <div className="px-3 pt-3">
              <ShopSwitcher shops={shops} />
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
              <SidebarNav role={user.role} permissions={user.permissions} counts={counts} onNavigate={() => setNavOpen(false)} />
            </div>
            <div className="border-t border-sidebar-border p-3">
              <UserCard name={user.name} role={user.role} />
            </div>
          </SheetContent>
        </Sheet>

        <Link href="/" prefetch className="min-w-0 flex-1">
          <ShopSwitcher
            shops={shops}
            className="border-transparent bg-transparent p-0 hover:bg-transparent"
          />
        </Link>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Search"
          onClick={() => toast.info("Global search arrives in Phase 2")}
        >
          <Search className="h-[18px] w-[18px]" />
        </Button>

        <NotificationsMenu notifications={notifications} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label="Account menu"
            >
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary text-white">{initialsOf(user.name)}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
            {user.role === "OWNER" && (
              <>
                <DropdownMenuItem onSelect={() => router.push("/settings")}>
                  <UserCog className="h-4 w-4" /> Profile &amp; team
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/settings")}>
                  <Settings className="h-4 w-4" /> Shop settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <ThemeToggleMenuItem />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-rose-600 focus:text-rose-600"
              onSelect={() => logoutAction()}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Quick action strip */}
      <div className="flex items-center gap-2 overflow-x-auto px-3 pb-2 no-scrollbar">
        <Button size="sm" className="h-10 shrink-0 sm:h-8" onClick={() => router.push("/orders/create")}>
          <Plus className="h-4 w-4" /> New Order
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-10 shrink-0 sm:h-8"
          onClick={() => router.push("/orders")}
        >
          Pending · {formatNumber(counts.pendingOrders)}
        </Button>
        <Button size="sm" variant="outline" className="h-10 shrink-0 sm:h-8" onClick={() => router.push("/courier")}>
          Pathao queue · {formatNumber(counts.pathaoQueue)}
        </Button>
      </div>
    </header>
  );
}

export function NotificationsMenu({ notifications }: { notifications: NotificationItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Notifications" className="relative">
          <Bell className="h-[18px] w-[18px]" />
          {notifications.length > 0 && (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-card" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          <span className="text-[11px] text-muted-foreground">{notifications.length} new</span>
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          <AnimatePresence initial={false}>
            {notifications.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="flex gap-2.5 border-b border-border px-3 py-2.5 last:border-0"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">{item.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{item.detail}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/80">{item.time}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserCard({ name, role }: { name: string; role: keyof typeof ROLE_META }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-sidebar-muted/70 p-2">
      <Avatar className="h-10 w-10">
        <AvatarFallback className="bg-primary text-white">{initialsOf(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-sidebar-foreground">{name}</p>
        <p className="truncate text-[10px] font-medium text-muted-foreground">{ROLE_META[role].label}</p>
      </div>
    </div>
  );
}
