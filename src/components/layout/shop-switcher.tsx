"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus, Store } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/format";
import { BrandLogo } from "@/components/layout/brand-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ShopOption {
  id: string;
  name: string;
  customDomain: string | null;
  logo: string | null;
  primaryColor: string;
}

interface ShopSwitcherProps {
  shops: ShopOption[];
  collapsed?: boolean;
  compact?: boolean;
  fill?: boolean;
  className?: string;
}

/**
 * Multi-shop switcher. Phase 1 ships with a single live shop ("ITech Case BD"),
 * but the control is fully wired so additional branches drop in without UI work.
 */
export function ShopSwitcher({
  shops,
  collapsed = false,
  compact = false,
  fill = true,
  className,
}: ShopSwitcherProps) {
  const [activeId, setActiveId] = React.useState(shops[0]?.id ?? "");
  const activeShop = shops.find((shop) => shop.id === activeId) ?? shops[0];
  const iconOnly = collapsed || compact;

  if (!activeShop) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Select shop: ${activeShop.name}`}
          title={iconOnly ? activeShop.name : undefined}
          className={cn(
            "group flex items-center gap-2.5 rounded-xl border border-sidebar-border bg-sidebar-muted/60 p-2 text-left transition-colors hover:bg-accent",
            fill && !compact && "w-full",
            collapsed && "justify-center border-transparent bg-transparent p-0 hover:bg-transparent",
            compact && "h-10 w-10 shrink-0 justify-center border-transparent bg-transparent p-0 hover:bg-accent sm:h-8 sm:w-8",
            className,
          )}
        >
          {iconOnly ? (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
              title={activeShop.name}
            >
              <Store className="h-4 w-4" />
            </span>
          ) : (
            <>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Store className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Active shop
                </span>
                <span className="block truncate text-xs font-semibold text-foreground">
                  {activeShop.name}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Your shops</DropdownMenuLabel>
        {shops.map((shop) => (
          <DropdownMenuItem
            key={shop.id}
            onSelect={() => {
              setActiveId(shop.id);
              if (shop.id !== activeId) toast.success(`Switched to ${shop.name}`);
            }}
            className="gap-2.5"
          >
            <ShopAvatar name={shop.name} logo={shop.logo} color={shop.primaryColor} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{shop.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {shop.customDomain ?? "No domain"}
              </span>
            </span>
            {shop.id === activeId && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => toast.info("Adding a second shop arrives in Phase 2")}
          className="text-muted-foreground"
        >
          <Plus className="h-4 w-4" />
          Add another shop
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ShopAvatarProps {
  name: string;
  logo?: string | null;
  color?: string;
  size?: "sm" | "md";
}

/**
 * Brand wordmark for ITech Case BD — gold "ITech Case" + silver "BD" on navy,
 * with a metallic "iC" mark. Sized to fit the sidebar row without extra height.
 */
export function BrandWordmark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-2 rounded-lg bg-[#0e1324] px-2.5 py-1 ring-1 ring-black/10",
        compact && "gap-1.5 rounded-none bg-transparent px-0 py-0 ring-0",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center",
          compact ? "h-7 w-[18px]" : "h-8 w-[21px]",
        )}
      >
        <BrandLogo className={compact ? "h-7 w-[18px]" : "h-8 w-[21px]"} />
      </span>
      <span className="flex min-w-0 items-baseline leading-none">
        <span
          className={cn(
            "truncate font-extrabold tracking-tight",
            compact ? "text-[11px]" : "text-[15px]",
          )}
          style={{
            backgroundImage: "linear-gradient(180deg, #f6e7a8 0%, #d4af37 45%, #9a7b1e 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          ITech Case
        </span>
        <span
          className={cn(
            "font-extrabold tracking-tight",
            compact ? "ml-0.5 text-[11px]" : "ml-1 text-[15px]",
          )}
          style={{
            backgroundImage: "linear-gradient(180deg, #f0f0f0 0%, #b8b8b8 50%, #7a7a7a 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          BD
        </span>
      </span>
    </span>
  );
}

/** Brand mark — renders the uploaded logo when present, otherwise the brand emblem or a gradient monogram. */
export function ShopAvatar({ name, logo, color = "#4f46e5", size = "md" }: ShopAvatarProps) {
  const dimension = size === "sm" ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm";

  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={`${name} logo`}
        className={cn("shrink-0 rounded-lg object-cover ring-1 ring-black/5", dimension)}
      />
    );
  }

  // ITech Case BD always uses its own brand emblem, never initials.
  if (name.toLowerCase().includes("itech")) {
    const logoDimension = size === "sm" ? "h-8 w-[21px]" : "h-9 w-6";
    return <BrandLogo className={cn("shrink-0", logoDimension)} />;
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-bold text-white shadow-sm ring-1 ring-black/5",
        dimension,
      )}
      style={{ backgroundImage: `linear-gradient(135deg, ${color}, ${shade(color, -18)})` }}
      aria-hidden
    >
      {initialsOf(name) || <Store className="h-4 w-4" />}
    </span>
  );
}

/** Darkens (or lightens) a hex colour by a percentage. */
function shade(hex: string, percent: number): string {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  const value = parseInt(full || "4f46e5", 16);
  const clamp = (channel: number) => Math.max(0, Math.min(255, channel));
  const r = clamp(((value >> 16) & 0xff) + (255 * percent) / 100);
  const g = clamp(((value >> 8) & 0xff) + (255 * percent) / 100);
  const b = clamp((value & 0xff) + (255 * percent) / 100);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
