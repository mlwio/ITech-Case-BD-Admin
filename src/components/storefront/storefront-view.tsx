"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  LayoutTemplate,
  Palette,
  Rocket,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { deliveryZoneLabel } from "@/lib/constants";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { FadeIn } from "@/components/shared/motion";
import { formatBDT, formatNumber } from "@/lib/format";
import type { Order, Product, Shop } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StorefrontViewProps {
  shop: Shop;
  products: Product[];
  orders: Order[];
}

const BRAND_SWATCHES = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#7c3aed", "#0f172a"];

const TEMPLATES = [
  {
    id: "cod-single",
    name: "Single Product COD",
    description: "One hero offer with cash-on-delivery form — best for Facebook ads.",
    tag: "Highest converting",
  },
  {
    id: "catalog",
    name: "Mini Catalog",
    description: "Grid of all cases with filters for model, colour and price.",
    tag: "Full store",
  },
  {
    id: "bundle",
    name: "Combo / Bundle",
    description: "Case + glass protector combo with quantity picker.",
    tag: "AOV booster",
  },
];

export function StorefrontView({ shop, products, orders }: StorefrontViewProps) {
  const [primaryColor, setPrimaryColor] = React.useState(shop.primaryColor);
  const [domain, setDomain] = React.useState(shop.customDomain ?? "");
  const [published, setPublished] = React.useState(true);
  const [template, setTemplate] = React.useState(TEMPLATES[0].id);

  const heroProduct = products[0];
  const landingOrders = React.useMemo(
    () => orders.filter((order) => order.source === "LANDING_PAGE"),
    [orders],
  );
  const landingRevenue = landingOrders
    .filter((order) => ["CONFIRMED", "IN_TRANSIT", "DELIVERED"].includes(order.status))
    .reduce((sum, order) => sum + order.totalAmount, 0);

  function copyStoreLink() {
    toast.success("Store link copied", { description: "Paste it into your Facebook / TikTok bio." });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <FadeIn>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-primary" /> Brand &amp; appearance
                </CardTitle>
                <CardDescription>Your storefront picks these up instantly.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {shop.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{shop.name}</p>
                    <p className="text-[11px] text-muted-foreground">Logo &amp; store name</p>
                  </div>
                  <Button variant="outline" size="sm" className="h-10 sm:h-8">
                    <ImageIcon className="h-3.5 w-3.5" /> Change logo
                  </Button>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Primary colour</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    {BRAND_SWATCHES.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={color}
                        onClick={() => setPrimaryColor(color)}
                        className={cn(
                          "h-10 w-10 rounded-full ring-2 ring-offset-2 ring-offset-card transition-transform hover:scale-105 sm:h-8 sm:w-8",
                          primaryColor === color ? "ring-foreground" : "ring-transparent",
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <div className="ml-1 flex items-center gap-2">
                      <Input
                        value={primaryColor}
                        onChange={(event) => setPrimaryColor(event.target.value)}
                        className="h-10 w-24 font-mono text-sm sm:h-8 sm:text-xs"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </FadeIn>

          <FadeIn delay={0.04}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" /> Custom domain
                </CardTitle>
                <CardDescription>Point your own domain so customers trust the checkout.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      https://
                    </span>
                    <Input
                      value={domain}
                      onChange={(event) => setDomain(event.target.value)}
                      placeholder="shop.itechcasebd.com"
                      className="pl-[62px]"
                    />
                  </div>
                  <Button
                    onClick={() =>
                      toast.success("Domain saved", {
                        description: domain
                          ? `${domain} will be live once DNS propagates.`
                          : "Add a domain to continue.",
                      })
                    }
                  >
                    Save domain
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="font-mono">
                    itechcasebd.com
                  </Badge>
                  <span>default storefront</span>
                </div>
              </CardContent>
            </Card>
          </FadeIn>

          <FadeIn delay={0.08}>
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Rocket className="h-4 w-4 text-primary" /> Publish
                  </CardTitle>
                  <CardDescription>
                    {published ? "Your storefront is live to customers." : "Storefront is in draft mode."}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={published} onCheckedChange={setPublished} />
                  <span className="text-xs font-medium">{published ? "Live" : "Draft"}</span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-10 sm:h-8" onClick={copyStoreLink}>
                  <Copy className="h-3.5 w-3.5" /> Copy store link
                </Button>
                <Button asChild variant="outline" size="sm" className="h-10 sm:h-8">
                  <a href={`https://${domain || "itechcasebd.com"}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> Preview
                  </a>
                </Button>
              </CardContent>
            </Card>
          </FadeIn>
        </div>

        <div className="lg:col-span-2">
          <FadeIn delay={0.06}>
            <Card className="lg:sticky lg:top-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-primary" /> Live preview
                </CardTitle>
                <CardDescription>Customer view on a mobile phone</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                <div className="w-[248px] overflow-hidden rounded-[2rem] border-[6px] border-foreground/85 bg-card shadow-elevated">
                  <div className="h-5 bg-foreground/85" />
                  <div className="space-y-3 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold">{shop.name}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[9px] font-semibold text-white"
                        style={{ backgroundColor: primaryColor }}
                      >
                        COD
                      </span>
                    </div>
                    <div
                      className="flex h-32 items-center justify-center rounded-xl text-white"
                      style={{
                        background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}99)`,
                      }}
                    >
                      <Sparkles className="h-8 w-8 opacity-80" />
                    </div>
                    <div>
                      <p className="line-clamp-1 text-[11px] font-semibold">
                        {heroProduct?.name ?? "iPhone Silicone Case"}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        {heroProduct?.variants[0]?.name ?? "Midnight Blue"} · Premium protection
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold" style={{ color: primaryColor }}>
                        {formatBDT(heroProduct?.variants[0]?.sellingPrice ?? 690)}
                      </span>
                      <span className="text-[9px] text-muted-foreground line-through">
                        {formatBDT((heroProduct?.variants[0]?.sellingPrice ?? 690) + 200)}
                      </span>
                    </div>
                    <div
                      className="rounded-lg py-2 text-center text-[11px] font-semibold text-white"
                      style={{ backgroundColor: primaryColor }}
                    >
                      অর্ডার করুন · Order Now
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[8px] text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-1 text-center">Cash on Delivery</span>
                      <span className="rounded bg-muted px-1.5 py-1 text-center">7-day return</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </FadeIn>
        </div>
      </div>

      <FadeIn delay={0.06}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-4 w-4 text-primary" /> Landing page templates
            </CardTitle>
            <CardDescription>Pick a layout, then customise colours and products.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {TEMPLATES.map((item) => {
              const active = template === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTemplate(item.id)}
                  className={cn(
                    "relative rounded-xl border p-4 text-left transition-all",
                    active
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border hover:border-primary/40 hover:bg-muted/40",
                  )}
                >
                  {active && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  <div
                    className="mb-3 h-20 rounded-lg"
                    style={{
                      background: `linear-gradient(135deg, ${primaryColor}22, ${primaryColor}0a)`,
                    }}
                  />
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{item.description}</p>
                  <Badge variant="secondary" className="mt-2">
                    {item.tag}
                  </Badge>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.08}>
        <Card>
          <CardHeader>
            <CardTitle>Landing page performance</CardTitle>
            <CardDescription>
              {formatNumber(landingOrders.length)} orders · {formatBDT(landingRevenue)} booked
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 sm:px-0">
            {landingOrders.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 sm:pl-5">Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="hidden sm:table-cell">Zone</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {landingOrders.slice(0, 8).map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="pl-4 text-sm font-medium sm:pl-5">
                        {order.orderNumber}
                      </TableCell>
                      <TableCell className="truncate text-sm">{order.customer.name}</TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                        {deliveryZoneLabel(order.deliveryZone, order.deliveryCharge)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular">
                        {formatBDT(order.totalAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={LayoutTemplate}
                title="No landing page orders yet"
                description="Publish a campaign page and share the link on Facebook or TikTok."
              />
            )}
          </CardContent>
        </Card>
      </FadeIn>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="px-1 text-[11px] text-muted-foreground"
      >
        Bengali + English copy is supported out of the box — great for Facebook Messenger funnels.
      </motion.p>
    </div>
  );
}
