"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Bell,
  CheckCircle2,
  Crown,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Phone,
  Plus,
  Printer,
  Save,
  Send,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  UserCog,
  UserPlus,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FadeIn } from "@/components/shared/motion";
import {
  DEFAULT_ROLE_PERMISSIONS,
  DELIVERY_ZONES,
  PERMISSION_META,
  ROLE_META,
} from "@/lib/constants";
import { formatPhone, initialsOf } from "@/lib/format";
import {
  inviteMemberAction,
  removeMemberAccessAction,
  resendModeratorInviteAction,
  resetMemberPasswordAction,
  setMemberActiveAction,
  updateMemberPermissionAction,
  updateMemberRoleAction,
} from "@/lib/actions/team";
import {
  MEMBER_ROLES,
  type MemberRole,
  type PermissionKey,
  type ShopMember,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface SettingsViewProps {
  members: ShopMember[];
  shopName: string;
  defaultDomain: string | null;
  defaultTab?: "team" | "preferences";
}

/** Plain-language capability matrix rendered beneath the team list. */
const ROLE_CAPABILITIES: Record<
  MemberRole,
  { icon: LucideIcon; iconClassName: string; allow: string[]; deny: string[] }
> = {
  OWNER: {
    icon: Crown,
    iconClassName: "bg-indigo-50 text-indigo-600",
    allow: [
      "Every module incl. audit logs",
      "Buying cost (COGS) & net profit",
      "Cash on Delivery reconciliation",
      "Pathao API keys & credentials",
      "Team roles & permissions",
    ],
    deny: [],
  },
  MODERATOR: {
    icon: ShoppingBag,
    iconClassName: "bg-blue-50 text-blue-600",
    allow: [
      "Create / edit orders & Magic Paste",
      "Book Pathao parcels & print stickers",
      "Customer directory",
      "Stock view & adjustments",
    ],
    deny: ["Product buying cost (COGS)", "Net profit & P&L statement", "Pathao API credentials"],
  },
  PACKING_STAFF: {
    icon: Printer,
    iconClassName: "bg-emerald-50 text-emerald-600",
    allow: [
      "Confirmed orders queue",
      "Thermal shipping stickers (4x6 / 3x2)",
      "A4 warehouse packing lists",
    ],
    deny: ["Creating or pricing orders", "Financials, COGS & profit", "Customers & Pathao settings"],
  },
};

export function SettingsView({
  members: initialMembers,
  shopName,
  defaultDomain,
  defaultTab = "team",
}: SettingsViewProps) {
  const router = useRouter();
  const [members, setMembers] = React.useState<ShopMember[]>(initialMembers);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<ShopMember | null>(null);
  const [removingPending, setRemovingPending] = React.useState(false);

  // Re-sync with the server after `router.refresh()` so persisted edits win.
  React.useEffect(() => {
    setMembers(initialMembers);
  }, [initialMembers]);

  async function changeRole(memberId: string, role: MemberRole) {
    const previous = members.find((member) => member.id === memberId);
    setMembers((prev) =>
      prev.map((member) =>
        member.id === memberId
          ? { ...member, role, permissions: { ...DEFAULT_ROLE_PERMISSIONS[role] } }
          : member,
      ),
    );

    setBusyId(memberId);
    const result = await updateMemberRoleAction(memberId, role);
    setBusyId(null);

    if (!result.ok) {
      if (previous) setMembers((prev) => prev.map((m) => (m.id === memberId ? previous : m)));
      toast.error(result.message);
      return;
    }
    toast.success("Role updated", { description: ROLE_META[role].label });
    router.refresh();
  }

  async function togglePermission(memberId: string, key: PermissionKey, value: boolean) {
    const previous = members.find((member) => member.id === memberId);
    setMembers((prev) =>
      prev.map((member) =>
        member.id === memberId
          ? { ...member, permissions: { ...member.permissions, [key]: value } }
          : member,
      ),
    );

    const result = await updateMemberPermissionAction(memberId, key, value);
    if (!result.ok) {
      if (previous) setMembers((prev) => prev.map((m) => (m.id === memberId ? previous : m)));
      toast.error(result.message);
      return;
    }
    router.refresh();
  }

  async function toggleActive(memberId: string, value: boolean) {
    const previous = members.find((member) => member.id === memberId);
    setMembers((prev) =>
      prev.map((member) => (member.id === memberId ? { ...member, isActive: value } : member)),
    );

    setBusyId(memberId);
    const result = await setMemberActiveAction(memberId, value);
    setBusyId(null);

    if (!result.ok) {
      if (previous) setMembers((prev) => prev.map((m) => (m.id === memberId ? previous : m)));
      toast.error(result.message);
      return;
    }
    toast.success(value ? "Access restored" : "Account paused", {
      description: value ? `${previous?.name ?? "Member"} can sign in again.` : "They can no longer sign in.",
    });
    router.refresh();
  }

  async function resetPassword(member: ShopMember) {
    setBusyId(member.id);
    const result = await resetMemberPasswordAction(member.id);
    setBusyId(null);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Password reset", {
      description: `${member.name} will create a new password at their next sign-in.`,
    });
    router.refresh();
  }

  async function resendInvite(member: ShopMember) {
    setBusyId(member.id);
    const result = await resendModeratorInviteAction(member.id);
    setBusyId(null);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Invitation re-sent", { description: result.message });
    router.refresh();
  }

  async function removeAccess() {
    if (!removing) return;
    const member = removing;
    setRemovingPending(true);
    const result = await removeMemberAccessAction(member.id);
    setRemovingPending(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setMembers((prev) => prev.filter((item) => item.id !== member.id));
    setRemoving(null);
    toast.success("Access removed", { description: result.message });
    router.refresh();
  }

  async function invite(input: { email: string }): Promise<boolean> {
    const result = await inviteMemberAction({ ...input, role: "MODERATOR" });
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }

    if (result.member) {
      const created = result.member;
      setMembers((prev) => [...prev.filter((member) => member.id !== created.id), created]);
    }
    toast.success("Moderator added", { description: result.message });
    router.refresh();
    return true;
  }

  return (
    <>
      <Tabs key={defaultTab} defaultValue={defaultTab}>
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
        <TabsTrigger value="team" className="h-10 sm:h-7">
          Moderators &amp; roles
        </TabsTrigger>
        <TabsTrigger value="preferences" className="h-10 sm:h-7">
          Shop preferences
        </TabsTrigger>
      </TabsList>

      <TabsContent value="team" className="space-y-3">
        <FadeIn>
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserCog className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">{members.length} team members</p>
                <p className="text-[11px] text-muted-foreground">
                  {members.filter((member) => member.isActive).length} active ·{" "}
                  {members.filter((member) => !member.isActive).length} paused
                </p>
              </div>
            </div>
            <InviteMemberDialog onInvite={invite} />
          </Card>
        </FadeIn>

        <div className="space-y-3">
          {members.map((member, index) => {
            const roleMeta = ROLE_META[member.role];
            const isOwner = member.role === "OWNER";
            return (
              <FadeIn key={member.id} delay={index * 0.03}>
                <Card className="overflow-hidden">
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-11 w-11">
                        <AvatarFallback className="text-sm">{initialsOf(member.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{member.name}</p>
                          {isOwner && (
                            <Badge variant="success" className="gap-1">
                              <BadgeCheck className="h-3 w-3" /> Owner
                            </Badge>
                          )}
                          {!isOwner && member.inviteStatus === "INVITED" && (
                            <Badge variant="warning" className="gap-1">
                              <Send className="h-3 w-3" /> Invite pending
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Mail className="h-3 w-3" /> {member.email}
                        </p>
                        {member.phone && (
                          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Phone className="h-3 w-3" /> {formatPhone(member.phone)}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Joined {new Date(member.joinedAt).toLocaleDateString("en-GB")}
                          {member.lastActiveAt ? ` · seen ${new Date(member.lastActiveAt).toLocaleDateString("en-GB")}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={member.role}
                        onValueChange={(value) => changeRole(member.id, value as MemberRole)}
                        disabled={isOwner}
                      >
                        <SelectTrigger className="h-10 w-[160px] sm:h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MEMBER_ROLES.map((role) => (
                            <SelectItem key={role} value={role} disabled={role === "OWNER"}>
                              {ROLE_META[role].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={member.isActive}
                          onCheckedChange={(value) => toggleActive(member.id, value)}
                          disabled={isOwner || busyId === member.id}
                          aria-label="Active"
                        />
                        <span className="w-12 text-xs font-medium text-muted-foreground">
                          {member.isActive ? "Active" : "Paused"}
                        </span>
                      </div>
                      {!isOwner && member.inviteStatus === "INVITED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-10 sm:h-8"
                          disabled={busyId === member.id}
                          onClick={() => resendInvite(member)}
                        >
                          <Send className="h-3.5 w-3.5" /> Resend invite
                        </Button>
                      )}
                      {!isOwner && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-10 sm:h-8"
                          disabled={busyId === member.id}
                          onClick={() => resetPassword(member)}
                        >
                          <KeyRound className="h-3.5 w-3.5" /> Reset password
                        </Button>
                      )}
                      {!isOwner && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-10 text-destructive hover:text-destructive sm:h-8"
                          disabled={busyId === member.id}
                          onClick={() => setRemoving(member)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove access
                        </Button>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <p className="text-xs font-semibold">Access permissions</p>
                      <span className="text-[11px] text-muted-foreground">· {roleMeta.description}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {PERMISSION_META.map((permission) => {
                        const enabled = isOwner ? true : member.permissions[permission.key];
                        return (
                          <label
                            key={permission.key}
                            className={cn(
                              "flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-2.5 transition-colors",
                              enabled ? "border-primary/30 bg-primary/5" : "border-border",
                              isOwner && "cursor-not-allowed opacity-70",
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block text-xs font-medium">{permission.label}</span>
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {permission.description}
                              </span>
                            </span>
                            <Switch
                              checked={enabled}
                              disabled={isOwner}
                              onCheckedChange={(value) =>
                                togglePermission(member.id, permission.key, value)
                              }
                              aria-label={permission.label}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              </FadeIn>
            );
          })}
        </div>

        <FadeIn delay={0.1}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" /> Role capability matrix
              </CardTitle>
              <CardDescription>
                What each role can reach. Moderators and Packing Staff are hidden from buying cost and profit.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-3">
              {MEMBER_ROLES.map((role) => {
                const capability = ROLE_CAPABILITIES[role];
                const Icon = capability.icon;
                return (
                  <div key={role} className="rounded-xl border border-border p-3.5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg",
                          capability.iconClassName,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{ROLE_META[role].label}</p>
                        <p className="text-[11px] text-muted-foreground">{ROLE_META[role].description}</p>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {capability.allow.map((item) => (
                        <li key={item} className="flex items-start gap-1.5 text-xs">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span>{item}</span>
                        </li>
                      ))}
                      {capability.deny.map((item) => (
                        <li key={item} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </FadeIn>

        <p className="px-1 text-[11px] text-muted-foreground">
          Role and permission changes save instantly. Add a moderator with just an email — they
          receive an invitation link to set their own name, phone, and password, then sign in at{" "}
          <span className="font-medium">/login</span>. Use{" "}
          <span className="font-medium">Resend invite</span> if the link expires and{" "}
          <span className="font-medium">Reset password</span> if they forget it.
        </p>
      </TabsContent>

      <TabsContent value="preferences" className="space-y-3">
        <FadeIn>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" /> Shop profile
              </CardTitle>
              <CardDescription>Shown on invoices and landing pages.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Shop name</Label>
                <Input defaultValue={shopName} />
              </div>
              <div className="space-y-1.5">
                <Label>Custom domain</Label>
                <Input defaultValue={defaultDomain ?? ""} placeholder="shop.itechcasebd.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input value="BDT ৳ (Bangladeshi Taka)" readOnly className="bg-muted/50" />
              </div>
              <div className="space-y-1.5">
                <Label>Support hotline</Label>
                <Input defaultValue="+8801700-000000" />
              </div>
            </CardContent>
          </Card>
        </FadeIn>

        <div className="grid gap-3 lg:grid-cols-2">
          <FadeIn delay={0.04}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" /> Delivery &amp; courier
                </CardTitle>
                <CardDescription>Default Pathao charges applied to new orders.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Default courier</span>
                    <Badge variant="secondary">Pathao</Badge>
                  </div>
                </div>
                {DELIVERY_ZONES.map((zone) => (
                  <div key={zone.key} className="flex items-center justify-between gap-3">
                    <Label className="text-xs">{zone.label}</Label>
                    <div className="relative w-32">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        ৳
                      </span>
                      <Input defaultValue={zone.charge} className="h-10 pl-7 tabular sm:h-8 sm:text-sm" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </FadeIn>

          <FadeIn delay={0.08}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" /> Notifications
                </CardTitle>
                <CardDescription>Keep the inbox team in the loop.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <PrefRow label="New order alerts" hint="Ping when a Messenger/TikTok order lands" defaultOn />
                <PrefRow label="Pathao status updates" hint="When a consignment moves or returns" defaultOn />
                <PrefRow label="Low stock warnings" hint="When a variant drops below its threshold" defaultOn />
                <PrefRow label="Daily hisab summary" hint="Revenue & profit recap at 10:00 PM" />
                <PrefRow label="Weekly performance report" hint="Every Sunday morning" defaultOn />
              </CardContent>
            </Card>
          </FadeIn>
        </div>

        <FadeIn delay={0.1}>
          <div className="flex justify-end">
            <Button
              onClick={() => toast.success("Preferences saved", { description: `${shopName} settings updated.` })}
            >
              <Save className="h-4 w-4" /> Save changes
            </Button>
          </div>
        </FadeIn>
      </TabsContent>
      </Tabs>

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove access?</DialogTitle>
            <DialogDescription>
              {removing ? (
                <>
                  <span className="font-medium text-foreground">{removing.name}</span> ({removing.email}) will
                  no longer be able to sign in to this shop.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <p className="text-[11px] text-muted-foreground">
            This revokes their moderator access immediately. You can add the same email again later if
            needed — they&apos;ll set up a new password at their next sign-in.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)} disabled={removingPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={removeAccess} disabled={removingPending}>
              {removingPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Removing…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" /> Remove access
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PrefRow({
  label,
  hint,
  defaultOn = false,
}: {
  label: string;
  hint: string;
  defaultOn?: boolean;
}) {
  const [on, setOn] = React.useState(defaultOn);
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={on} onCheckedChange={setOn} aria-label={label} />
    </div>
  );
}

function InviteMemberDialog({
  onInvite,
}: {
  onInvite: (input: { email: string }) => Promise<boolean>;
}) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function submit() {
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    setPending(true);
    const ok = await onInvite({ email: email.trim() });
    setPending(false);
    if (!ok) return;
    setEmail("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-10 sm:h-8">
          <UserPlus className="h-4 w-4" /> Add moderator
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a moderator</DialogTitle>
          <DialogDescription>
            Enter their email. We&apos;ll instantly send an invitation link so they can set their own
            name, phone, and password — no password to share.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="sadia@itechcasebd.com"
            />
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground">
            They&apos;ll get an invitation email with a secure link to complete registration, then sign
            in at <span className="font-medium text-foreground">/login</span> with the moderator role.
            If the link expires, use <span className="font-medium text-foreground">Resend invite</span>{" "}
            from the team list.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Adding…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> Add moderator
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
