import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, LogOut, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_META, visibleNavItems } from "@/lib/constants";
import { logoutAction } from "@/lib/actions/auth";
import { getSessionContext } from "@/lib/session";
import { getShop } from "@/lib/data";
import { initialsOf } from "@/lib/format";

export const metadata: Metadata = { title: "More" };
export const dynamic = "force-dynamic";

export default async function MorePage() {
  const [session, shopResult] = await Promise.all([getSessionContext(), getShop()]);
  const shop = shopResult.data;

  const items = visibleNavItems(session.user.role, session.user.permissions).filter(
    (item) => item.href !== "/",
  );

  return (
    <div>
      <PageHeader
        title="More"
        description="Everything else — products, storefront, analytics and your team settings."
      />

      <Card className="mb-3 flex items-center gap-3 p-4">
        <Avatar className="h-11 w-11">
          <AvatarFallback className="text-sm">{initialsOf(session.user.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{session.user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
        </div>
        <Badge className={ROLE_META[session.user.role].className}>{ROLE_META[session.user.role].label}</Badge>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-elevated"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">{item.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>

      <Card className="mt-3 space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> {shop.name}
        </div>
        <div className="grid gap-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Custom domain</span>
            <span className="font-medium text-foreground">{shop.customDomain ?? "Not connected"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Currency</span>
            <span className="font-medium text-foreground">BDT ৳</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Default courier</span>
            <span className="font-medium text-foreground">Pathao</span>
          </div>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="outline" size="sm" className="w-full">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </form>
      </Card>
    </div>
  );
}
