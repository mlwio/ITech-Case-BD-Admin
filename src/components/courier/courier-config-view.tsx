"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  CircleDot,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Store,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { FadeIn } from "@/components/shared/motion";
import {
  savePathaoCredentialsAction,
  selectPickupStoreAction,
  testPathaoConnectionAction,
} from "@/lib/actions/courier";
import { formatDateTime } from "@/lib/format";
import { PATHAO_API_BASE } from "@/lib/constants";
import { PATHAO_ENVIRONMENTS, type CourierCredentialPublic, type PathaoEnvironment, type PathaoStore } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CourierConfigViewProps {
  credential: CourierCredentialPublic;
  shopName: string;
  queued: number;
  booked: number;
}

const FALLBACK_ORIGIN = "https://yourdomain.com";

export function CourierConfigView({ credential, shopName, queued, booked }: CourierConfigViewProps) {
  const router = useRouter();

  // Secrets are never sent to the browser — the form starts blank and a blank
  // field leaves the saved value unchanged on save.
  const [form, setForm] = React.useState({
    clientId: credential.clientId,
    clientSecret: "",
    username: credential.username,
    password: "",
    storeId: credential.storeId,
    environment: credential.environment,
    webhookSecret: "",
  });
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [selecting, setSelecting] = React.useState<string | null>(null);
  const [stores, setStores] = React.useState<PathaoStore[]>([]);
  const [activeStoreId, setActiveStoreId] = React.useState<string | null>(credential.pickupStoreId);
  const [testError, setTestError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [origin, setOrigin] = React.useState(FALLBACK_ORIGIN);

  React.useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const webhookUrl = `${origin}/api/webhooks/pathao`;
  const configured = Boolean(
    form.clientId &&
      form.username &&
      (form.clientSecret || credential.hasClientSecret) &&
      (form.password || credential.hasPassword),
  );
  const connected = Boolean(credential.hasAccessToken || credential.lastTestStatus === "SUCCESS");

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await savePathaoCredentialsAction({ ...form });
      if (!result.ok) {
        toast.error(result.message || "Could not save the credentials");
        return;
      }
      toast.success("Credentials saved", { description: result.message });
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestError(null);
    try {
      const result = await testPathaoConnectionAction();
      if (!result.ok) {
        setTestError(result.message);
        toast.error("Connection failed", { description: result.message });
        return;
      }
      setStores(result.stores ?? []);
      toast.success("Connected to Pathao", {
        description: result.message,
      });
      router.refresh();
    } catch (error) {
      const message = (error as Error).message;
      setTestError(message);
      toast.error(message);
    } finally {
      setTesting(false);
    }
  }

  async function handleSelectStore(store: PathaoStore) {
    setSelecting(store.storeId);
    try {
      const result = await selectPickupStoreAction(store.storeId, store.storeName);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setActiveStoreId(store.storeId);
      update("storeId", store.storeId);
      toast.success("Pickup store active", { description: result.message });
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSelecting(null);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Webhook URL copied");
    } catch {
      toast.error("Clipboard unavailable — copy the URL manually");
    }
  }

  const checklist = [
    { label: "Merchant credentials saved", done: configured },
    { label: "Token issued & pickup stores synced", done: connected },
    { label: "Active pickup store selected", done: Boolean(activeStoreId) },
    { label: "Webhook secret set for signature verification", done: Boolean(form.webhookSecret || credential.hasWebhookSecret) },
  ];

  return (
    <div className="space-y-3">
      {/* Status strip */}
      <FadeIn>
        <Card className="overflow-hidden">
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl",
                  connected ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600",
                )}
              >
                {connected ? <BadgeCheck className="h-5 w-5" /> : <PlugZap className="h-5 w-5" />}
              </span>
              <div>
                <p className="text-sm font-semibold">
                  {connected ? "Pathao connected" : "Pathao not connected yet"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {connected
                    ? `Token cached · ${credential.lastTestedAt ? formatDateTime(credential.lastTestedAt) : "just now"}`
                    : "Add your merchant credentials, then test the connection"}
                </p>
              </div>
            </div>

            <Separator orientation="vertical" className="hidden self-stretch lg:block" />

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Environment
                </p>
                <Badge variant={form.environment === "PRODUCTION" ? "success" : "warning"} className="mt-1">
                  {form.environment === "PRODUCTION" ? "Production" : "Sandbox"}
                </Badge>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Active store
                </p>
                <p className="mt-1 font-medium">
                  {credential.pickupStoreName ?? (activeStoreId ? activeStoreId : "None selected")}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Queue / booked
                </p>
                <p className="mt-1 font-medium tabular">
                  {queued} waiting · {booked} consignments
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr]">
        {/* Credentials */}
        <FadeIn delay={0.04}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" /> Merchant credentials
              </CardTitle>
              <CardDescription>
                Issued by Pathao for the {shopName} merchant account. Stored encrypted at rest in
                PostgreSQL.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <FieldRow label="Client ID" htmlFor="pathao-client-id">
                <Input
                  id="pathao-client-id"
                  value={form.clientId}
                  onChange={(event) => update("clientId", event.target.value)}
                  placeholder="e.g. 7N1aBcD2"
                  autoComplete="off"
                />
              </FieldRow>

              <FieldRow label="Client Secret" htmlFor="pathao-client-secret">
                <Input
                  id="pathao-client-secret"
                  type="password"
                  value={form.clientSecret}
                  onChange={(event) => update("clientSecret", event.target.value)}
                  placeholder={credential.hasClientSecret ? "•••••••• (saved — leave blank to keep)" : "••••••••••••"}
                  autoComplete="off"
                />
              </FieldRow>

              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label="Username (Merchant Email)" htmlFor="pathao-username">
                  <Input
                    id="pathao-username"
                    value={form.username}
                    onChange={(event) => update("username", event.target.value)}
                    placeholder="merchant@itechcasebd.com"
                    autoComplete="off"
                  />
                </FieldRow>
                <FieldRow label="Password" htmlFor="pathao-password">
                  <Input
                    id="pathao-password"
                    type="password"
                    value={form.password}
                    onChange={(event) => update("password", event.target.value)}
                    placeholder={credential.hasPassword ? "•••••••• (saved — leave blank to keep)" : "••••••••"}
                    autoComplete="off"
                  />
                </FieldRow>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label="Store ID" htmlFor="pathao-store-id">
                  <Input
                    id="pathao-store-id"
                    value={form.storeId}
                    onChange={(event) => update("storeId", event.target.value)}
                    placeholder="Auto-filled after sync"
                    inputMode="numeric"
                  />
                </FieldRow>
                <FieldRow label="Environment">
                  <Select
                    value={form.environment}
                    onValueChange={(value) => update("environment", value as PathaoEnvironment)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PATHAO_ENVIRONMENTS.map((env) => (
                        <SelectItem key={env} value={env}>
                          {env === "SANDBOX" ? "Sandbox" : "Production"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>
              </div>

              <div className="rounded-lg border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Base URL:</span>{" "}
                <code className="break-all">{PATHAO_API_BASE[form.environment]}</code>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {saving ? "Saving…" : "Save credentials"}
                </Button>
                <Button variant="success" onClick={handleTest} disabled={testing || !configured}>
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {testing ? "Testing…" : "Test Connection & Sync Pickup Stores"}
                </Button>
              </div>
              {!configured && (
                <p className="text-[11px] text-muted-foreground">
                  Fill in all four credential fields to enable the connection test.
                </p>
              )}
            </CardContent>
          </Card>
        </FadeIn>

        {/* Webhook + checklist */}
        <div className="space-y-3">
          <FadeIn delay={0.08}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Webhook className="h-4 w-4 text-primary" /> Webhook & signature
                </CardTitle>
                <CardDescription>
                  Paste this URL into Pathao → Settings → Webhook so every parcel update lands here.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Pathao Webhook URL</Label>
                  <div className="flex items-stretch gap-2">
                    <Input readOnly value={webhookUrl} className="font-mono text-[11px]" />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={handleCopy}
                      aria-label="Copy webhook URL"
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <FieldRow label="Webhook Secret" htmlFor="pathao-webhook-secret">
                  <Input
                    id="pathao-webhook-secret"
                    value={form.webhookSecret}
                    onChange={(event) => update("webhookSecret", event.target.value)}
                    placeholder={
                      credential.hasWebhookSecret
                        ? "•••••••• (saved — leave blank to keep)"
                        : "Used to verify the X-PATHAO-Signature header"
                    }
                    autoComplete="off"
                  />
                </FieldRow>

                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span>
                    Every request is verified with an HMAC-SHA256 signature over the raw body using
                    this secret. Leave it blank to accept unsigned sandbox callbacks.
                  </span>
                </div>
              </CardContent>
            </Card>
          </FadeIn>

          <FadeIn delay={0.12}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Setup checklist
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {checklist.map((item) => (
                  <div key={item.label} className="flex items-center gap-2.5 text-xs">
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-inset",
                        item.done
                          ? "bg-emerald-50 text-emerald-600 ring-emerald-600/20"
                          : "bg-muted text-muted-foreground ring-border",
                      )}
                    >
                      {item.done ? <Check className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
                    </span>
                    <span className={cn(item.done ? "text-foreground" : "text-muted-foreground")}>
                      {item.label}
                    </span>
                  </div>
                ))}
                {credential.lastTestMessage && (
                  <>
                    <Separator className="my-2" />
                    <p
                      className={cn(
                        "text-[11px]",
                        credential.lastTestStatus === "FAILED" ? "text-rose-600" : "text-muted-foreground",
                      )}
                    >
                      Last test: {credential.lastTestMessage}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </FadeIn>
        </div>
      </div>

      {/* Pickup stores */}
      <FadeIn delay={0.16}>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-primary" /> Pickup stores
                </CardTitle>
                <CardDescription>
                  Synced from <code className="text-[11px]">/aladdin/api/v1/stores</code> — pick the
                  address Pathao riders should collect from.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={handleTest}
                disabled={testing || !configured}
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sync stores
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {testError && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Pathao rejected the request</p>
                  <p className="mt-0.5">{testError}</p>
                </div>
              </div>
            )}

            {stores.length === 0 ? (
              <EmptyState
                icon={Store}
                title="No pickup stores synced yet"
                description="Run “Test Connection & Sync Pickup Stores” to pull your Pathao store list."
                action={
                  <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || !configured}>
                    <RefreshCw className="h-3.5 w-3.5" /> Sync now
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {stores.map((store) => {
                  const isActive = activeStoreId === store.storeId;
                  return (
                    <button
                      key={store.storeId}
                      type="button"
                      onClick={() => handleSelectStore(store)}
                      disabled={selecting !== null}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors disabled:opacity-70",
                        isActive
                          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                          : "border-border bg-card hover:border-primary/40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold">{store.storeName}</p>
                        {isActive ? (
                          <Badge variant="success" className="shrink-0 gap-1">
                            <Check className="h-3 w-3" /> Active
                          </Badge>
                        ) : selecting === store.storeId ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{store.storeAddress}</p>
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <Badge variant="muted" className="tabular">
                          #{store.storeId}
                        </Badge>
                        <span>
                          {store.cityName} · {store.zoneName}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.2}>
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CircleDot className="h-3 w-3" /> Tokens are cached and auto-refreshed before they expire
          </span>
          <a
            href="https://merchant.pathao.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
          >
            Open Pathao Merchant Panel <ExternalLink className="h-3 w-3" />
          </a>
        </Card>
      </FadeIn>
    </div>
  );
}

function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-semibold">
        {label}
      </Label>
      {children}
    </div>
  );
}
