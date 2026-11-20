"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Phone,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ModeratorInviteFormProps {
  /** The invited email — locked, shown read-only. */
  email: string;
  /** Single-use invite token from the URL. */
  token: string;
}

/**
 * Moderator registration form behind the invite link. Captures name, phone and
 * a password, then POSTs to the public registration endpoint. The email is
 * fixed to the invited address so it cannot be tampered with.
 */
export function ModeratorInviteForm({ email, token }: ModeratorInviteFormProps) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/moderators/complete-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, phone, password, confirm }),
      });
      const result = (await response.json()) as { ok: boolean; message: string };
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      setDone(true);
      toast.success(result.message);
      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduceMotion) {
        await new Promise((resolve) => setTimeout(resolve, 420));
      }
      router.replace("/");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative space-y-4">
      <div className="space-y-1.5">
        <Label>Email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="email"
            value={email}
            readOnly
            disabled
            className="h-11 cursor-not-allowed bg-muted/60 pl-9"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          This is your login ID and cannot be changed.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="full-name">Full name</Label>
        <div className="relative">
          <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="full-name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your full name"
            className="h-11 pl-9"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone number</Label>
        <div className="relative">
          <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="01XXXXXXXXX"
            className="h-11 pl-9"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Create password</Label>
        <PasswordInput
          id="password"
          value={password}
          onChange={setPassword}
          show={showPassword}
          onToggle={() => setShowPassword((prev) => !prev)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <PasswordInput
          id="confirm-password"
          value={confirm}
          onChange={setConfirm}
          show={showPassword}
          onToggle={() => setShowPassword((prev) => !prev)}
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        Use at least 8 characters. We&apos;ll email your account details to{" "}
        <span className="font-medium text-foreground">{email}</span>.
      </p>

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Completing…
          </>
        ) : (
          <>
            Complete registration <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>

      {done && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl bg-card/95 backdrop-blur-sm animate-in fade-in duration-200"
          role="status"
          aria-live="polite"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 animate-in zoom-in-50 duration-300">
            <Check className="h-7 w-7" strokeWidth={3} />
          </div>
          <p className="text-sm font-medium text-foreground">Registration complete…</p>
        </div>
      )}
    </form>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  show,
  onToggle,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        type={show ? "text" : "password"}
        autoComplete="new-password"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="••••••••"
        className="h-11 pl-9 pr-10"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
