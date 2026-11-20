"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { visibleNavItems, type NavItem } from "@/lib/constants";
import type { MemberRole, PermissionKey } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface NavCounts {
  pendingOrders: number;
  pathaoQueue: number;
}

interface SidebarNavProps {
  role: MemberRole;
  permissions: Record<PermissionKey, boolean>;
  counts: NavCounts;
  collapsed?: boolean;
  onNavigate?: () => void;
  className?: string;
}

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // "/orders/create" must not light up "/orders".
  if (href === "/orders") return pathname === "/orders";
  return pathname.startsWith(`${href}/`);
}

export function SidebarNav({
  role,
  permissions,
  counts,
  collapsed = false,
  onNavigate,
  className,
}: SidebarNavProps) {
  const pathname = usePathname();

  const items = visibleNavItems(role, permissions);

  return (
    <nav className={cn("flex flex-col gap-0.5", className)} aria-label="Main">
      {items.map((item) => (
        <SidebarLink
          key={item.href}
          item={item}
          active={isActive(pathname, item.href)}
          counts={counts}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

interface SidebarLinkProps {
  item: NavItem;
  active: boolean;
  counts: NavCounts;
  collapsed?: boolean;
  onNavigate?: () => void;
  variant?: "sidebar" | "sheet";
}

export function SidebarLink({
  item,
  active,
  counts,
  collapsed = false,
  onNavigate,
  variant = "sidebar",
}: SidebarLinkProps) {
  const Icon = item.icon;
  const badgeValue =
    item.badge === "pending-orders"
      ? counts.pendingOrders
      : item.badge === "pathao-queue"
        ? counts.pathaoQueue
        : 0;

  return (
    <Link
      href={item.href}
      prefetch
      onClick={onNavigate}
      aria-label={collapsed ? item.title : undefined}
      title={collapsed ? item.title : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        variant === "sidebar"
          ? active
            ? "text-primary"
            : "text-sidebar-foreground/80 hover:bg-sidebar-muted hover:text-sidebar-foreground"
          : active
            ? "bg-accent text-accent-foreground"
            : "text-foreground/80 hover:bg-muted",
      )}
    >
      {active && variant === "sidebar" && (
        <motion.span
          layoutId="sidebar-active-pill"
          className="absolute inset-0 -z-10 rounded-lg bg-accent"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors",
          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground/70",
        )}
      />
      <span className={cn("flex-1 truncate", collapsed && "sr-only")}>{item.title}</span>
      {badgeValue > 0 && !collapsed && (
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular",
            active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {badgeValue}
        </span>
      )}
    </Link>
  );
}
