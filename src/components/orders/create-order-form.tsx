"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { MagicPasteBox } from "@/components/orders/magic-paste-box";
import { DuplicateOrderAlert, RiskBadge } from "@/components/orders/risk-awareness";
import {
  DEFAULT_DELIVERY_CHARGE,
  DELIVERY_PRESETS,
  deliveryOptionFor,
  deliveryZoneLabel,
  storedDeliveryZone,
} from "@/lib/constants";
import type { ZoneKey } from "@/lib/constants";
import { createOrderAction, type CreateOrderInput } from "@/lib/actions/orders";
import {
  estimateDeliveryCharge,
  matchCatalogVariant,
  type ParsedOrderDraft,
} from "@/lib/order-parser";
import { assessRisk, findDuplicateOrders, normalizePhone, type OrderHistoryEntry } from "@/lib/risk";
import { formatBDT, formatNumber, formatPhone } from "@/lib/format";
import { IPHONE_MODELS, productModel } from "@/lib/catalog-meta";
import {
  type Customer,
  type DeliveryZone,
  type Product,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface CartLine {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  unitPrice: number;
  unitCostPrice: number;
  stockQty: number;
  quantity: number;
}

const IPHONE_GENERATIONS = [...new Set(IPHONE_MODELS.map((model) => model.match(/^iPhone \d+/)?.[0]).filter(Boolean))] as string[];
const PHONE_FORM_FACTORS = ["Base", "Pro", "Plus", "Pro Max"] as const;

function fullModelName(generation: string, formFactor: (typeof PHONE_FORM_FACTORS)[number]): string {
  return formFactor === "Base" ? generation : `${generation} ${formFactor}`;
}

function generationForModel(model: string): string {
  return model.match(/^iPhone \d+/)?.[0] ?? "iPhone 11";
}

function formFactorForModel(model: string): (typeof PHONE_FORM_FACTORS)[number] {
  const suffix = model.replace(/^iPhone \d+\s*/, "");
  return PHONE_FORM_FACTORS.includes(suffix as (typeof PHONE_FORM_FACTORS)[number])
    ? (suffix as (typeof PHONE_FORM_FACTORS)[number])
    : "Base";
}

/** Silicone-case bundle pricing tiers (whole-order price per piece count). */
const BUNDLE_TIER_PRICES: Record<number, number> = { 1: 230, 2: 440, 3: 640, 4: 840, 5: 1000 };
/** Bundles of 5+ pieces ship free; 6+ pieces price at ৳200 each. */
const BUNDLE_FREE_DELIVERY_FROM = 5;
const BUNDLE_UNIT_PRICE_ABOVE = 200;

/** Whole-order price for `quantity` silicone cases. */
function bundlePriceFor(quantity: number): number {
  if (quantity <= 0) return 0;
  return BUNDLE_TIER_PRICES[quantity] ?? BUNDLE_UNIT_PRICE_ABOVE * quantity;
}

interface CreateOrderFormProps {
  customers: Customer[];
  products: Product[];
  /** Phone + status history used for the fraud read-out and duplicate check. */
  orderHistory: OrderHistoryEntry[];
  /** Auto-generated next order number, e.g. ITC-1074. */
  nextOrderNumber: string;
  createdByName: string;
}

export function CreateOrderForm({
  customers,
  products,
  orderHistory,
  nextOrderNumber,
  createdByName,
}: CreateOrderFormProps) {
  const router = useRouter();

  const [customerMode, setCustomerMode] = React.useState<"existing" | "new">("existing");
  const [customerQuery, setCustomerQuery] = React.useState("");
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string>("");
  const [newCustomer, setNewCustomer] = React.useState({ name: "", phone: "", address: "" });

  const [zone, setZone] = React.useState<ZoneKey>("DHAKA_INSIDE");
  const [deliveryCharge, setDeliveryCharge] = React.useState<number>(DEFAULT_DELIVERY_CHARGE.DHAKA_INSIDE);
  const [shippingZone, setShippingZone] = React.useState<DeliveryZone>("DHAKA");

  const [selectedGeneration, setSelectedGeneration] = React.useState(IPHONE_GENERATIONS[0] ?? "iPhone 11");
  const [selectedFormFactor, setSelectedFormFactor] =
    React.useState<(typeof PHONE_FORM_FACTORS)[number]>("Base");
  const [selectedVariantId, setSelectedVariantId] = React.useState("");
  const [addQuantity, setAddQuantity] = React.useState(1);
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [discount, setDiscount] = React.useState(0);
  const [note, setNote] = React.useState("");
  const [settled, setSettled] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;

  const activePhone = customerMode === "existing" ? selectedCustomer?.phone ?? "" : newCustomer.phone;
  const risk = React.useMemo(() => assessRisk(activePhone, orderHistory), [activePhone, orderHistory]);
  const duplicates = React.useMemo(
    () => findDuplicateOrders(activePhone, orderHistory, 72),
    [activePhone, orderHistory],
  );

  const selectedModelName = fullModelName(selectedGeneration, selectedFormFactor);
  const selectedProduct =
    products.find((product) => productModel(product.name) === selectedModelName) ?? null;
  const selectedVariant =
    selectedProduct?.variants.find((variant) => variant.id === selectedVariantId) ??
    selectedProduct?.variants.find((variant) => variant.stockQty > 0) ??
    selectedProduct?.variants[0] ??
    null;
  const availableFormFactors = new Set(
    products
      .map((product) => productModel(product.name))
      .filter((model) => generationForModel(model) === selectedGeneration)
      .map(formFactorForModel),
  );

  function selectGeneration(generation: string) {
    setSelectedGeneration(generation);
    const available = products
      .map((product) => productModel(product.name))
      .filter((model) => generationForModel(model) === generation)
      .map(formFactorForModel);
    const nextFormFactor = available.includes(selectedFormFactor)
      ? selectedFormFactor
      : PHONE_FORM_FACTORS.find((factor) => available.includes(factor)) ?? "Base";
    setSelectedFormFactor(nextFormFactor);
    setSelectedVariantId("");
    setAddQuantity(1);
  }

  function selectFormFactor(formFactor: (typeof PHONE_FORM_FACTORS)[number]) {
    setSelectedFormFactor(formFactor);
    setSelectedVariantId("");
    setAddQuantity(1);
  }

  const filteredCustomers = React.useMemo(() => {
    const needle = customerQuery.trim().toLowerCase();
    if (!needle) return customers.slice(0, 6);
    return customers
      .filter(
        (customer) =>
          customer.name.toLowerCase().includes(needle) || customer.phone.includes(needle),
      )
      .slice(0, 8);
  }, [customers, customerQuery]);

  const totalUnits = cart.reduce((sum, line) => sum + line.quantity, 0);
  // Quantity-based bundle pricing — the tier sets the whole-order subtotal.
  const subtotal = bundlePriceFor(totalUnits);
  const freeDelivery = totalUnits >= BUNDLE_FREE_DELIVERY_FROM;
  const effectiveDeliveryCharge = freeDelivery ? 0 : deliveryCharge;
  const cogs = cart.reduce((sum, line) => sum + line.unitCostPrice * line.quantity, 0);
  // A discount only ever comes off the cover (product) price — it is clamped to
  // the subtotal so it can never spill over into the delivery charge.
  const discountApplied = Math.min(Math.max(0, discount), subtotal);
  const total = Math.max(0, subtotal - discountApplied) + effectiveDeliveryCharge;
  const profit = total - cogs - effectiveDeliveryCharge;
  /** Effective per-piece price once the active bundle tier is applied. */
  const bundleUnitPrice = totalUnits > 0 ? subtotal / totalUnits : 0;

  function setDeliveryChoice(
    option: ZoneKey,
    charge = DEFAULT_DELIVERY_CHARGE[option],
    detectedZone?: DeliveryZone,
  ) {
    setZone(option);
    setDeliveryCharge(charge);
    setShippingZone(
      detectedZone ??
        (option === "OUTSIDE_DHAKA"
          ? shippingZone === "CHITTAGONG" || shippingZone === "SYLHET"
            ? shippingZone
            : storedDeliveryZone(option)
          : storedDeliveryZone(option)),
    );
  }

  function setDeliveryForCustomer(customerZone: DeliveryZone, address: string) {
    const charge =
      estimateDeliveryCharge(address, { assumeOutside: false }) ??
      (customerZone === "DHAKA" ? DEFAULT_DELIVERY_CHARGE.DHAKA_INSIDE : DEFAULT_DELIVERY_CHARGE.OUTSIDE_DHAKA);
    setDeliveryChoice(deliveryOptionFor(customerZone, charge), charge, customerZone);
  }

  /** Typing a known number in the "New" tab auto-selects that existing buyer. */
  function handleNewPhoneChange(value: string) {
    setNewCustomer((prev) => ({ ...prev, phone: value }));
    const normalized = normalizePhone(value);
    if (normalized.length !== 11) return;
    const existing = customers.find((customer) => normalizePhone(customer.phone) === normalized);
    if (!existing) return;
    setCustomerMode("existing");
    setCustomerQuery(existing.name);
    setSelectedCustomerId(existing.id);
    setDeliveryForCustomer(existing.zone, existing.address);
    toast.info(`Matched ${existing.name}`, { description: "Existing customer auto-selected." });
  }

  /** Mirror a matched draft item into the Model / Type / Colour selectors. */
  function syncPicker(model: string | null, variantId: string) {
    const generation = model?.match(/^iPhone \d+/)?.[0];
    if (generation && IPHONE_GENERATIONS.includes(generation)) {
      setSelectedGeneration(generation);
      setSelectedFormFactor(formFactorForModel(model as string));
    }
    setSelectedVariantId(variantId);
  }

  function addVariant(product: Product, variantId: string, quantity = 1) {
    const variant = product.variants.find((item) => item.id === variantId);
    if (!variant) return;
    if (variant.stockQty <= 0) {
      toast.error("This colour is out of stock");
      return;
    }

    const existing = cart.find((line) => line.variantId === variantId);
    if (existing && existing.quantity + quantity > variant.stockQty) {
      toast.error(`Only ${variant.stockQty} piece(s) are in stock`);
      return;
    }
    const safeQuantity = Math.min(Math.max(1, quantity), variant.stockQty);

    setCart((prev) => {
      const current = prev.find((line) => line.variantId === variantId);
      if (current) {
        return prev.map((line) =>
          line.variantId === variantId
            ? { ...line, quantity: Math.min(line.quantity + safeQuantity, variant.stockQty) }
            : line,
        );
      }
      return [
        ...prev,
        {
          variantId,
          productName: product.name,
          variantName: variant.name,
          sku: variant.sku,
          unitPrice: variant.sellingPrice,
          unitCostPrice: variant.costPrice,
          stockQty: variant.stockQty,
            quantity: safeQuantity,
        },
      ];
    });
    toast.success(`${product.name} added`, { description: variant.name });
  }

  function changeQty(variantId: string, delta: number) {
    const current = cart.find((line) => line.variantId === variantId);
    if (current && delta > 0 && current.quantity + delta > current.stockQty) {
      toast.error(`Only ${current.stockQty} piece(s) are in stock`);
      return;
    }

    setCart((prev) =>
      prev
        .map((line) =>
          line.variantId === variantId
            ? { ...line, quantity: Math.min(line.stockQty, Math.max(0, line.quantity + delta)) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  function applyDraft(draft: ParsedOrderDraft) {
    const phone = draft.phone ? normalizePhone(draft.phone) : "";
    const existing = phone
      ? customers.find((customer) => normalizePhone(customer.phone) === phone)
      : undefined;

    if (existing) {
      setCustomerMode("existing");
      setCustomerQuery(existing.name);
      setSelectedCustomerId(existing.id);
      setDeliveryForCustomer(existing.zone, existing.address);
    } else {
      setCustomerMode("new");
      setNewCustomer((prev) => ({
        name: draft.name ?? prev.name,
        phone: phone || prev.phone,
        address: draft.address ?? prev.address,
      }));
    }

    // Auto-set delivery zone + charge from the parsed district / address.
    if (draft.deliveryCharge != null) {
      const inferredZone = draft.deliveryZone ?? (draft.deliveryCharge === 130 ? "OTHER" : "DHAKA");
      setDeliveryChoice(deliveryOptionFor(inferredZone, draft.deliveryCharge), draft.deliveryCharge, inferredZone);
    } else if (draft.deliveryZone) {
      const option = deliveryOptionFor(draft.deliveryZone);
      setDeliveryChoice(option, DEFAULT_DELIVERY_CHARGE[option], draft.deliveryZone);
    }

    // Multi-item structured form — add every detected line.
    if (draft.items && draft.items.length > 0) {
      for (const item of draft.items) {
        const itemDraft: ParsedOrderDraft = {
          ...draft,
          productHint: item.model,
          categoryHint: item.category,
          colorHint: item.color,
          quantity: item.quantity,
        };
        const match = matchCatalogVariant(itemDraft, products);
        if (match) {
          const product = products.find((p) => p.id === match.productId);
          if (product) {
            addVariant(product, match.variantId, item.quantity ?? 1);
            syncPicker(item.model, match.variantId);
          }
        }
      }
    } else {
      // Legacy single-item path.
      const match = matchCatalogVariant(draft, products);
      if (match) {
        const product = products.find((p) => p.id === match.productId);
        if (product) {
          addVariant(product, match.variantId, draft.quantity ?? 1);
          syncPicker(draft.productHint, match.variantId);
        }
      }
    }

    const summary = [
      existing ? `Matched ${existing.name}` : draft.name ? `New customer ${draft.name}` : null,
      draft.deliveryCharge != null
        ? `Delivery: ${formatBDT(draft.deliveryCharge)}`
        : draft.deliveryZone
          ? `Zone: ${draft.deliveryZone}`
          : null,
    ]
      .filter(Boolean)
      .join(" · ");

    toast.success("Magic paste applied", {
      description: summary || "Review the fields below before saving.",
    });
  }

  async function submitOrder() {
    if (customerMode === "existing" && !selectedCustomer) {
      toast.error("Select a customer first");
      return;
    }
    if (customerMode === "new" && (!newCustomer.name.trim() || newCustomer.phone.trim().length < 11)) {
      toast.error("Enter the customer name and a valid 11-digit phone number");
      return;
    }
    if (cart.length === 0) {
      toast.error("Add at least one product to the order");
      return;
    }

    const input: CreateOrderInput = {
      orderNumber: nextOrderNumber,
      customerMode,
      customerId: customerMode === "existing" ? selectedCustomerId : undefined,
      newCustomer:
        customerMode === "new"
          ? {
              name: newCustomer.name.trim(),
              phone: newCustomer.phone.trim(),
              address: newCustomer.address.trim(),
                zone: shippingZone,
            }
          : undefined,
      items: cart.map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        unitPrice: bundleUnitPrice,
      })),
      source: "MESSENGER",
      deliveryZone: shippingZone,
      deliveryCharge: effectiveDeliveryCharge,
      discount: discountApplied,
      note: note.trim() || undefined,
      isPaymentSettled: settled,
      createdByName,
    };

    setSubmitting(true);
    try {
      const result = await createOrderAction(input);
      if (!result.ok) {
        toast.error(result.message || "Could not save the order");
        return;
      }

      toast.success(`${result.orderNumber ?? nextOrderNumber} created`, {
        description: `${formatBDT(total)} · ${formatNumber(totalUnits)} unit(s)`,
      });

      // The order saved (stock deducted) but Pathao booking was rejected — flag
      // it clearly so the one-tap retry on the orders board is obvious.
      if (result.booked === false) {
        toast.warning("Pathao booking needs a retry", {
          description:
            result.bookingWarning ??
            "The order is saved with stock deducted. Open it on the orders board and tap Retry booking.",
          duration: 9000,
        });
      }

      setCart([]);
      setDiscount(0);
      setNote("");
      setSettled(false);
      setSelectedCustomerId("");
      setCustomerQuery("");
      setNewCustomer({ name: "", phone: "", address: "" });
      router.push("/orders");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <MagicPasteBox onApply={applyDraft} />

      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {/* Customer */}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Customer</CardTitle>
                <CardDescription>Pick an existing buyer or add a new one</CardDescription>
              </div>
              <div className="flex rounded-lg bg-muted p-0.5">
                <button
                  type="button"
                  onClick={() => setCustomerMode("existing")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-2.5 text-xs font-medium transition-colors sm:px-2.5 sm:py-1",
                    customerMode === "existing" ? "bg-card shadow-sm" : "text-muted-foreground",
                  )}
                >
                  <Users className="h-3.5 w-3.5" /> Existing
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerMode("new")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-2.5 text-xs font-medium transition-colors sm:px-2.5 sm:py-1",
                    customerMode === "new" ? "bg-card shadow-sm" : "text-muted-foreground",
                  )}
                >
                  <UserPlus className="h-3.5 w-3.5" /> New
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {(risk || duplicates.length > 0) && (
                <div className="space-y-2">
                  <RiskBadge assessment={risk} />
                  <DuplicateOrderAlert hits={duplicates} />
                </div>
              )}

              {customerMode === "existing" ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={customerQuery}
                      onChange={(event) => setCustomerQuery(event.target.value)}
                      placeholder="Search by name or phone…"
                      className="pl-9"
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {filteredCustomers.map((customer) => {
                      const selected = customer.id === selectedCustomerId;
                      return (
                        <button
                          type="button"
                          key={customer.id}
                          onClick={() => {
                            setSelectedCustomerId(customer.id);
                            setDeliveryForCustomer(customer.zone, customer.address);
                          }}
                          className={cn(
                            "flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                            selected ? "border-primary bg-accent" : "border-border hover:bg-muted/60",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                              selected ? "border-primary bg-primary text-white" : "border-input",
                            )}
                          >
                            {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{customer.name}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {formatPhone(customer.phone)} ·{" "}
                              {deliveryZoneLabel(
                                customer.zone,
                                estimateDeliveryCharge(customer.address, { assumeOutside: false }) ?? undefined,
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                              {customer.totalOrders} orders · {customer.returnedCount} returned
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {filteredCustomers.length === 0 && (
                    <EmptyState
                      icon={Users}
                      title="No customer found"
                      description={'Switch to "New" and add them with a fresh phone number.'}
                    />
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="customer-name">Full name</Label>
                    <Input
                      id="customer-name"
                      value={newCustomer.name}
                      onChange={(event) =>
                        setNewCustomer((prev) => ({ ...prev, name: event.target.value }))
                      }
                      placeholder="e.g. Rakibul Hasan"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="customer-phone">Phone (11 digits)</Label>
                    <Input
                      id="customer-phone"
                      value={newCustomer.phone}
                      onChange={(event) => handleNewPhoneChange(event.target.value)}
                      placeholder="01712345678"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="customer-address">Delivery address</Label>
                    <Textarea
                      id="customer-address"
                      value={newCustomer.address}
                      onChange={(event) =>
                        setNewCustomer((prev) => ({ ...prev, address: event.target.value }))
                      }
                      placeholder="House, road, area, city — include landmarks for the rider"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Product picker */}
          <Card>
            <CardHeader>
              <CardTitle>Stock</CardTitle>
              <CardDescription>Select a model, model type and colour from available stock.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="overflow-x-auto pb-1">
                <div className="grid min-w-[660px] grid-cols-[1.1fr_1fr_1.5fr_88px_auto] items-end gap-2">
                  <div className="space-y-1.5">
                    <Label>Model</Label>
                    <Select value={selectedGeneration} onValueChange={selectGeneration}>
                      <SelectTrigger>
                        <SelectValue placeholder="iPhone model" />
                      </SelectTrigger>
                      <SelectContent>
                        {IPHONE_GENERATIONS.map((generation) => (
                          <SelectItem key={generation} value={generation}>
                            {generation}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select
                      value={selectedFormFactor}
                      onValueChange={(value) =>
                        selectFormFactor(value as (typeof PHONE_FORM_FACTORS)[number])
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Base / Pro" />
                      </SelectTrigger>
                      <SelectContent>
                        {PHONE_FORM_FACTORS.map((formFactor) => (
                          <SelectItem
                            key={formFactor}
                            value={formFactor}
                            disabled={!availableFormFactors.has(formFactor)}
                          >
                            {formFactor}
                            {!availableFormFactors.has(formFactor) ? " · no stock record" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Colour · stock</Label>
                    <Select
                      value={selectedVariant?.id ?? ""}
                      onValueChange={setSelectedVariantId}
                      disabled={!selectedProduct}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={selectedProduct ? "Select colour" : "No stock record"} />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedProduct?.variants.map((variant) => (
                          <SelectItem
                            key={variant.id}
                            value={variant.id}
                            disabled={variant.stockQty <= 0}
                          >
                            {variant.color} · {variant.stockQty} pcs
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedVariant && (
                      <p className="text-[11px] text-muted-foreground">
                        {selectedVariant.stockQty} pcs available
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="stock-quantity">Qty</Label>
                    <Input
                      id="stock-quantity"
                      type="number"
                      min={1}
                      max={selectedVariant?.stockQty ?? 1}
                      value={addQuantity}
                      disabled={!selectedVariant || selectedVariant.stockQty <= 0}
                      onChange={(event) =>
                        setAddQuantity(
                          Math.min(
                            Math.max(1, Number(event.target.value) || 1),
                            selectedVariant?.stockQty ?? 1,
                          ),
                        )
                      }
                    />
                  </div>

                  <Button
                    type="button"
                    disabled={!selectedProduct || !selectedVariant || selectedVariant.stockQty <= 0}
                    onClick={() => {
                      if (selectedProduct && selectedVariant) {
                        addVariant(selectedProduct, selectedVariant.id, addQuantity);
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
              </div>

              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Selected items</p>
                  <Badge variant="secondary">{formatNumber(totalUnits)} pcs</Badge>
                </div>
                {cart.length === 0 ? (
                  <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                    Selected model and colour will appear here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                      {cart.map((line) => (
                        <motion.div
                          key={line.variantId}
                          layout
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 12 }}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">
                              {productModel(line.productName)} · {line.variantName}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Stock {line.stockQty} pcs · {formatBDT(bundleUnitPrice)} each
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              className="h-9 w-9 shrink-0"
                              aria-label={`Remove one ${line.variantName}`}
                              onClick={() => changeQty(line.variantId, -1)}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <span className="w-7 text-center text-sm font-semibold tabular">
                              {line.quantity}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              className="h-9 w-9 shrink-0"
                              aria-label={`Add one ${line.variantName}`}
                              disabled={line.quantity >= line.stockQty}
                              onClick={() => changeQty(line.variantId, 1)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                            <button
                              type="button"
                              onClick={() => changeQty(line.variantId, -line.quantity)}
                              className="ml-1 rounded p-2 text-muted-foreground hover:bg-muted hover:text-rose-600"
                              aria-label={`Remove ${line.productName} ${line.variantName}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Order meta */}
          <Card>
            <CardHeader>
              <CardTitle>Order details</CardTitle>
              <CardDescription>Delivery charge and notes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Delivery area</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DELIVERY_PRESETS.map((preset) => {
                    const active = zone === preset.zone && deliveryCharge === preset.charge;
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => setDeliveryChoice(preset.zone, preset.charge)}
                        className={cn(
                          "rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors sm:py-1.5",
                          active
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted/60",
                        )}
                      >
                        {preset.label} · {formatBDT(preset.charge)}
                      </button>
                    );
                  })}
                </div>
                  <p className="text-xs text-muted-foreground">
                    {DELIVERY_PRESETS.find((preset) => preset.zone === zone)?.label} delivery:{" "}
                    {freeDelivery ? "Free (5+ bundle)" : formatBDT(deliveryCharge)}
                  </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="discount">Discount (৳)</Label>
                  <Input
                    id="discount"
                    type="number"
                    min={0}
                    max={subtotal > 0 ? subtotal : undefined}
                    value={discount || ""}
                    onChange={(event) => {
                      const next = Math.max(0, Number(event.target.value) || 0);
                      setDiscount(subtotal > 0 ? Math.min(next, subtotal) : next);
                    }}
                    placeholder="0"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Comes off the cover price — delivery charge stays the same.
                  </p>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Payment received</p>
                    <p className="text-[11px] text-muted-foreground">bKash / advance paid</p>
                  </div>
                  <Switch checked={settled} onCheckedChange={setSettled} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="note">Delivery note</Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="e.g. Call before delivery, office hours after 6 PM…"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Order summary</CardTitle>
                <CardDescription>
                  {nextOrderNumber} · by {createdByName}
                </CardDescription>
              </div>
              <Badge variant="secondary" className="tabular">
                {formatNumber(totalUnits)} pcs
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {cart.length === 0 ? (
                <EmptyState
                  icon={ShoppingCart}
                  title="Cart is empty"
                  description="Add variants from the catalog to build the order."
                />
              ) : (
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {cart.map((line) => (
                      <motion.div
                        key={line.variantId}
                        layout
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        className="rounded-lg border border-border p-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{line.productName}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {line.variantName} · {line.sku}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => changeQty(line.variantId, -line.quantity)}
                            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-rose-600"
                            aria-label={`Remove ${line.productName}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              className="h-9 w-9 shrink-0"
                              onClick={() => changeQty(line.variantId, -1)}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <span className="w-8 text-center text-sm font-semibold tabular">
                              {line.quantity}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              className="h-9 w-9 shrink-0"
                              onClick={() => changeQty(line.variantId, 1)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <span className="text-sm font-semibold tabular">
                            {formatBDT(bundleUnitPrice * line.quantity)}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              <Separator />

              <div className="space-y-1.5 text-sm">
                <SummaryRow label="Subtotal" value={formatBDT(subtotal)} />
                {totalUnits > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {totalUnits > 5 ? `${totalUnits} pcs × ৳${BUNDLE_UNIT_PRICE_ABOVE}` : `${totalUnits} pc bundle`}
                    {freeDelivery ? " · free delivery" : ""}
                  </p>
                )}
                {discountApplied > 0 && (
                  <SummaryRow
                    label="Discount"
                    value={`- ${formatBDT(discountApplied)}`}
                    className="text-emerald-600"
                  />
                )}
                  <SummaryRow
                    label={`Delivery (${DELIVERY_PRESETS.find((preset) => preset.zone === zone)?.label ?? "Dhaka City"})`}
                    value={freeDelivery ? "Free" : formatBDT(effectiveDeliveryCharge)}
                    className={freeDelivery ? "text-emerald-600" : undefined}
                  />
                <Separator className="my-1.5" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total payable</span>
                  <span className="text-lg font-semibold tabular">{formatBDT(total)}</span>
                </div>
                <SummaryRow
                  label="Estimated profit"
                  value={formatBDT(profit)}
                  className={profit >= 0 ? "text-emerald-600" : "text-rose-600"}
                />
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-2.5 text-[11px] text-muted-foreground">
                <Truck className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Courier is set to <strong className="text-foreground">Pathao</strong>.{" "}
                  {settled ? "Payment marked as settled." : "Cash on delivery — rider will collect."}
                </span>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setCart([])}
                  disabled={!cart.length || submitting}
                >
                  Clear
                </Button>
                <Button className="flex-1" onClick={submitOrder} disabled={submitting}>
                  {submitting ? "Saving…" : "Save order"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-medium tabular", className)}>{value}</span>
    </div>
  );
}
