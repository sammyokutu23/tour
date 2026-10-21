"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Alert, buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui";
import type { ActionState } from "@/app/actions/types";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  name,
  value,
  disabled,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} aria-busy={pending} className={buttonClass(variant, size, className)}>
      {pending && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}

/**
 * Wraps a Server Action with pending, error and success feedback. Field errors are exposed to
 * children through `render` so each input can show its own message.
 */
export function ActionForm({
  action,
  children,
  className,
  successMessage,
  resetOnSuccess,
  confirm,
  render,
  id,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children?: ReactNode;
  className?: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
  /** Asks for confirmation in-page before submitting destructive actions. */
  confirm?: string;
  render?: (state: ActionState) => ReactNode;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={formRef}
      id={id}
      action={formAction}
      className={className ?? "space-y-4"}
      onSubmit={(e) => {
        if (!confirm) return;
        const box = e.currentTarget.querySelector<HTMLInputElement>("input[data-confirm]");
        if (box && !box.checked) {
          e.preventDefault();
          box.focus();
          box.closest("label")?.classList.add("ring-2", "ring-terracotta", "rounded-lg");
        }
      }}
      noValidate
    >
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.ok && (successMessage || typeof state.ok === "string") && <Alert tone="success">{typeof state.ok === "string" ? state.ok : successMessage}</Alert>}
      {render ? render(state) : children}
      {confirm && (
        <label className="flex items-start gap-2 p-1 text-sm text-ink-muted">
          <input type="checkbox" data-confirm className="mt-0.5 h-4 w-4 accent-terracotta-700" />
          <span>{confirm}</span>
        </label>
      )}
    </form>
  );
}
