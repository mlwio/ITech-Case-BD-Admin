"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Truck,
  UserRound,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import loginLogo from "@/Public/Logo/Logo login.jpeg";
import {
  checkAccountAction,
  completeProfileAction,
  loginAction,
  setPasswordAction,
} from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

interface LoginFormProps {
  nextPath: string;
  deniedPath: string | null;
}

/** Where people without an account are asked to reach the team. */
const FACEBOOK_PAGE_URL = "https://www.facebook.com/itechcasebd";

const HIGHLIGHTS = [
  { icon: Truck, label: "Pathao Courier v1", detail: "1-click booking & live parcel sync" },
  { icon: Wallet, label: "BDT Hisab", detail: "COD settlement & net profit ledger" },
  { icon: Zap, label: "AI Magic Paste", detail: "Messenger & WhatsApp order parsing" },
  { icon: ShieldCheck, label: "Role guards", detail: "Owner, Moderator & Packing Staff" },
];

export function LoginForm({ nextPath, deniedPath }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [step, setStep] = React.useState<"email" | "password" | "create" | "profile" | "notfound">(
    "email",
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [signedIn, setSignedIn] = React.useState(false);

  function goToEmailStep() {
    setStep("email");
    setPassword("");
    setConfirm("");
    setFullName("");
    setPhone("");
    setShowPassword(false);
  }

  /** Step 1 — resolve the email, then branch to sign-in or first-time setup. */
  async function handleEmailContinue(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await checkAccountAction(email);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setPassword("");
      setConfirm("");
      if (result.notFound) {
        setStep("notfound");
        return;
      }
      setStep(result.needsPasswordSetup ? "create" : "password");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Credentials are valid — play a short "signing you in" beat so the jump to
   * the dashboard reads as a smooth hand-off instead of an abrupt snap. The
   * delay is skipped entirely for users who prefer reduced motion.
   */
  async function finishSession(message: string) {
    setSignedIn(true);
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) {
      await new Promise((resolve) => setTimeout(resolve, 420));
    }
    toast.success(message);
    router.replace(nextPath);
    router.refresh();
  }

  /** Step 2 (existing account) — sign in with the password. */
  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await loginAction({ email, password });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      await finishSession(result.message);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /** Step 2 (new account) — create + confirm a password, then collect profile. */
  async function handleCreatePassword(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await setPasswordAction({ email, password, confirm });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (result.needsProfile) {
        if (result.name) setFullName(result.name);
        setStep("profile");
        return;
      }
      await finishSession(result.message);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /** Step 3 — capture name + phone, then the welcome email goes out automatically. */
  async function handleProfile(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await completeProfileAction({ email, password, name: fullName, phone });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      await finishSession(result.message);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950 px-4 py-10">
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl" />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl lg:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden flex-col justify-between gap-8 p-9 text-white lg:flex">
          <div>
            <Image
              src={loginLogo}
              alt="ITech Case BD"
              priority
              sizes="(min-width: 1024px) 320px, 220px"
              className="h-24 w-auto"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {HIGHLIGHTS.map((item) => (
              <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <item.icon className="h-4 w-4 text-indigo-300" />
                <p className="mt-2 text-xs font-medium">{item.label}</p>
                <p className="text-[11px] leading-snug text-white/55">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Form panel */}
        <div className="relative bg-card p-6 sm:p-9">
          <div className="mb-6 flex lg:hidden">
            <Image src={loginLogo} alt="ITech Case BD" sizes="220px" className="h-14 w-auto" />
          </div>

          <div className="mb-5">
            {step === "create" ? (
              <>
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <KeyRound className="h-5 w-5 text-primary" /> Create your password
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Set a password to finish setting up your account.
                </p>
              </>
            ) : step === "profile" ? (
              <>
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <UserRound className="h-5 w-5 text-primary" /> Tell us about you
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add your name and phone number to complete your account.
                </p>
              </>
            ) : step === "notfound" ? null : (
              <>
                <h2 className="text-xl font-semibold">{step === "email" ? "Sign in" : "Welcome back"}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {step === "email"
                    ? "Enter your work email to continue."
                    : "Enter the password for your account."}
                </p>
              </>
            )}
          </div>

          {deniedPath && (
            <Banner
              tone="amber"
              icon={AlertTriangle}
              text={`You don't have access to ${deniedPath}. Ask the shop owner to grant it.`}
            />
          )}

          {step === "email" && (
            <form onSubmit={handleEmailContinue} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@itechcasebd.com"
                    className="h-11 pl-9"
                  />
                </div>
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking…
                  </>
                ) : (
                  <>
                    Continue <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          )}

          {step === "notfound" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-900">No account for this email</p>
                  <p className="text-xs leading-relaxed text-amber-800">
                    <span className="break-all font-medium">{email}</span> isn&apos;t registered yet.
                    Message us on Facebook and we&apos;ll set up your access.
                  </p>
                </div>
              </div>

              <a
                href={FACEBOOK_PAGE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#1877f2] text-sm font-semibold text-white transition-colors hover:bg-[#166fe5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1877f2]/60 focus-visible:ring-offset-2"
              >
                <MessageCircle className="h-4 w-4" /> Contact us on Facebook
              </a>

              <button
                type="button"
                onClick={goToEmailStep}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Use a different email
              </button>
            </div>
          )}

          {step !== "email" && step !== "notfound" && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2.5">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{email}</span>
              <button
                type="button"
                onClick={goToEmailStep}
                className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
              >
                Change
              </button>
            </div>
          )}

          {step === "password" && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggle={() => setShowPassword((prev) => !prev)}
                  autoComplete="current-password"
                />
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                  </>
                ) : (
                  <>
                    Sign in <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          )}

          {step === "create" && (
            <form onSubmit={handleCreatePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Password</Label>
                <PasswordInput
                  id="new-password"
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggle={() => setShowPassword((prev) => !prev)}
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Re-enter password</Label>
                <PasswordInput
                  id="confirm-password"
                  value={confirm}
                  onChange={setConfirm}
                  show={showPassword}
                  onToggle={() => setShowPassword((prev) => !prev)}
                  autoComplete="new-password"
                />
              </div>

              <p className="text-[11px] text-muted-foreground">Use at least 6 characters.</p>

              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                  </>
                ) : (
                  <>
                    Create password &amp; continue <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          )}

          {step === "profile" && (
            <form onSubmit={handleProfile} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="full-name">Full name</Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="full-name"
                    type="text"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
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

              <p className="text-[11px] text-muted-foreground">
                We&apos;ll email your account confirmation to{" "}
                <span className="font-medium text-foreground">{email}</span>.
              </p>

              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Finishing…
                  </>
                ) : (
                  <>
                    Finish &amp; enter <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          )}

          {step !== "email" && step !== "notfound" && (
            <button
              type="button"
              onClick={goToEmailStep}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Use a different email
            </button>
          )}

          {/* Smooth hand-off: a brief success beat before the dashboard loads. */}
          {signedIn && (
            <div
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-card/95 backdrop-blur-sm animate-in fade-in duration-200"
              role="status"
              aria-live="polite"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 animate-in zoom-in-50 duration-300">
                <Check className="h-7 w-7" strokeWidth={3} />
              </div>
              <p className="text-sm font-medium text-foreground">Signing you in…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Banner({
  tone,
  icon: Icon,
  text,
}: {
  tone: "amber" | "indigo";
  icon: typeof AlertTriangle;
  text: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex items-start gap-2 rounded-lg border p-3 text-xs",
        tone === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-indigo-200 bg-indigo-50 text-indigo-800",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{text}</p>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
}) {
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
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
