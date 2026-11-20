"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { MOBILE_NAV_ITEMS } from "@/lib/constants";
import type { PermissionKey } from "@/lib/types";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  permissions: Record<PermissionKey, boolean>;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/orders") return pathname === "/orders";
  if (href === "/more") return pathname === "/more" || pathname === "/settings";
  return pathname.startsWith(href);
}

/** Fixed app-like bottom navigation (mobile only): Home · Orders · Create · Finance · More. */
export function BottomNav({ permissions }: BottomNavProps) {
  const pathname = usePathname();

  const items = MOBILE_NAV_ITEMS.filter(
    (item) => item.permission === null || permissions[item.permission],
  );

  return (
    <nav
      aria-label="Bottom"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card shadow-nav pb-safe lg:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-6">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);

          if (item.isPrimaryAction) {
            return (
              <li key={item.href} className="relative flex justify-center">
                <Link
                  href={item.href}
                  prefetch
                  aria-label={item.title}
                  className="absolute -top-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-600 text-white shadow-elevated ring-4 ring-background transition-transform active:scale-95"
                >
                  <Plus className="h-6 w-6" strokeWidth={2.5} />
                </Link>
                <span className="pointer-events-none pt-9 text-[10px] font-medium text-muted-foreground">
                  {item.title}
                </span>
              </li>
            );
          }

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch
                aria-current={active ? "page" : undefined}
                className="relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium"
              >
                {active && (
                  <motion.span
                    layoutId="bottom-nav-indicator"
                    className="absolute -top-px h-0.5 w-8 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 500, damping: 34 }}
                  />
                )}
                <motion.span
                  animate={{ scale: active ? 1.06 : 1, y: active ? -1 : 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 24 }}
                >
                  <Icon
                    className={cn("h-[22px] w-[22px]", active ? "text-primary" : "text-muted-foreground")}
                    strokeWidth={active ? 2.4 : 2}
                  />
                </motion.span>
                <span className={cn(active ? "text-primary" : "text-muted-foreground")}>{item.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
