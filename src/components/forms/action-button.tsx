"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { buttonClass, cn, type ButtonSize, type ButtonVariant } from "@/components/ui";
import type { ActionState } from "@/app/actions/types";

/**
 * Invokes a bound Server Action from a button, with pending state and inline error/success text.
 * `confirm` shows an in-page confirmation step instead of a blocking browser dialog.
 */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  size = "sm",
  className,
  confirm,
  disabled,
  pendingLabel,
  ariaLabel,
  showSuccess = false,
}: {
  action: () => Promise<ActionState>;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  confirm?: string;
  disabled?: boolean;
  pendingLabel?: string;
  ariaLabel?: string;
  showSuccess?: boolean;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  const [confirming, setConfirming] = useState(false);

  const run = () =>
    start(async () => {
      setConfirming(false);
      setState(await action());
    });

  return (
    <span className="inline-flex flex-col gap-1">
      {confirming ? (
        <span className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-terracotta-100 px-3 py-2 text-xs text-terracotta-700" role="alert">
          {confirm}
          <button type="button" onClick={run} className={buttonClass("danger", "sm", "h-7 px-3 text-xs")}>Yes</button>
          <button type="button" onClick={() => setConfirming(false)} className={buttonClass("ghost", "sm", "h-7 px-3 text-xs")}>Cancel</button>
        </span>
      ) : (
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={pending || disabled}
          aria-busy={pending}
          onClick={() => (confirm ? setConfirming(true) : run())}
          className={buttonClass(variant, size, className)}
        >
          {pending && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
          {pending && pendingLabel ? pendingLabel : children}
        </button>
      )}
      {state?.error && <span role="alert" className="max-w-xs text-xs font-medium text-[#9b2c1a]">{state.error}</span>}
      {showSuccess && typeof state?.ok === "string" && <span role="status" className={cn("text-xs font-medium text-[#1d5b39]")}>{state.ok}</span>}
    </span>
  );
}
