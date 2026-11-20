"use client";

import * as React from "react";
import { Sparkles, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseOrderMessage, type ParsedOrderDraft } from "@/lib/order-parser";
import { formatBDT } from "@/lib/format";
import { cn } from "@/lib/utils";

const SAMPLE_MESSAGE = `Assalamu alaikum, amar naam Rakibul Hasan
iPhone 15 Pro er midnight blue silicone case lagbe 2 ta
01711234567
House 12, Road 5, Dhanmondi, Dhaka 1205`;

interface MagicPasteBoxProps {
  onApply: (draft: ParsedOrderDraft) => void;
}

/** Any field worth acting on — we only auto-fill when the message carries signal. */
function hasSignal(draft: ParsedOrderDraft): boolean {
  return Boolean(
    draft.phone || draft.name || draft.address || draft.productHint || draft.categoryHint || draft.items?.length,
  );
}

/** AI Magic Paste — paste a customer message and auto-fill the whole order. */
export function MagicPasteBox({ onApply }: MagicPasteBoxProps) {
  const [text, setText] = React.useState("");
  const [applied, setApplied] = React.useState("");

  // Keep the latest `onApply` in a ref so the paste handler never goes stale.
  const onApplyRef = React.useRef(onApply);
  React.useEffect(() => {
    onApplyRef.current = onApply;
  });

  const draft = React.useMemo(() => (text.trim().length >= 4 ? parseOrderMessage(text) : null), [text]);
  const confidence = draft ? Math.round(draft.confidence * 100) : 0;
  const isApplied = applied.length > 0 && applied === text.trim();

  /** Pasting a full message auto-fills the form — no extra click needed. */
  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = event.clipboardData.getData("text").trim();
    if (pasted.length < 4) return;
    const parsed = parseOrderMessage(pasted);
    if (!hasSignal(parsed)) return;
    onApplyRef.current(parsed);
    setApplied(pasted);
  }

  function handleApply() {
    if (!draft || isApplied) return;
    onApplyRef.current(draft);
    setApplied(text.trim());
  }

  const fields: { label: string; value: string | null }[] = draft
    ? [
        { label: "Name", value: draft.name },
        { label: "Phone", value: draft.phone },
        { label: "Address", value: draft.address },
        {
          label: "Product",
          value: [draft.productHint, draft.categoryHint].filter(Boolean).join(" · ") || null,
        },
        { label: "Variant / Colour", value: draft.colorHint },
        { label: "Quantity", value: draft.quantity ? `${draft.quantity}` : null },
        {
          label: "Delivery",
          value: draft.deliveryCharge != null ? formatBDT(draft.deliveryCharge) : null,
        },
      ]
    : [];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-violet-500/5 p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-600 text-white">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            AI Magic Paste
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Paste a Bangla / Banglish / English message from Messenger or WhatsApp — we&apos;ll pull out
            the name, phone, address, product and quantity.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 text-xs sm:h-7"
          onClick={() => setText(SAMPLE_MESSAGE)}
        >
          Try a sample
        </Button>
      </div>

      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onPaste={handlePaste}
        placeholder={"e.g. \"Assalamu alaikum, iPhone 15 Pro er midnight blue case lagbe 2 ta, 01711234567, Dhanmondi Dhaka\""}
        className="mt-3 min-h-[104px] resize-y bg-card"
        aria-label="Paste customer message"
      />

      {draft && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Confidence</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  confidence >= 70 ? "bg-emerald-500" : confidence >= 40 ? "bg-amber-500" : "bg-rose-500",
                )}
                style={{ width: `${confidence}%` }}
              />
            </div>
            <span className="w-9 text-right text-[11px] font-semibold tabular">{confidence}%</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {fields.map((field) => (
              <span
                key={field.label}
                className={cn(
                  "inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset",
                  field.value
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30"
                    : "bg-muted text-muted-foreground ring-border",
                )}
              >
                <span className="font-medium">{field.label}:</span>
                <span className="truncate">{field.value ?? "not found"}</span>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-10 sm:h-8"
              disabled={!draft || isApplied || !hasSignal(draft)}
              onClick={handleApply}
            >
              <WandSparkles className="h-4 w-4" /> {isApplied ? "Applied to form" : "Apply to form"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 text-muted-foreground sm:h-8"
              onClick={() => {
                setText("");
                setApplied("");
              }}
            >
              <X className="h-4 w-4" /> Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
