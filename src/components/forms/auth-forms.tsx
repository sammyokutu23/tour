"use client";

import Link from "next/link";
import { ActionForm, SubmitButton } from "./action-form";
import { Field, Input, Checkbox } from "@/components/ui";
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction } from "@/app/actions/auth";

const err = (s: { fieldErrors?: Record<string, string[] | undefined> } | null, k: string) => s?.fieldErrors?.[k];

export function LoginForm({ next }: { next: string }) {
  return (
    <ActionForm action={loginAction}>
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-semibold text-forest underline">Forgot password?</Link>
      </div>
      <SubmitButton className="w-full" size="lg" pendingLabel="Signing in…">Sign in</SubmitButton>
    </ActionForm>
  );
}

export function RegisterForm({ next, accountType }: { next: string; accountType: "traveller" | "guide" | "operator" }) {
  return (
    <ActionForm
      action={registerAction}
      render={(s) => (
        <>
          <input type="hidden" name="next" value={next} />
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">I&apos;m joining as</legend>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["traveller", "Traveller"],
                  ["guide", "Guide"],
                  ["operator", "Operator"],
                ] as const
              ).map(([v, l]) => (
                <label key={v} className="flex cursor-pointer items-center justify-center rounded-xl border border-sand-300 bg-white px-2 py-2.5 text-sm font-semibold has-[:checked]:border-forest has-[:checked]:bg-forest has-[:checked]:text-sand">
                  <input type="radio" name="accountType" value={v} defaultChecked={accountType === v} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Full name" htmlFor="displayName" error={err(s, "displayName")}>
            <Input id="displayName" name="displayName" autoComplete="name" required aria-invalid={!!err(s, "displayName")} />
          </Field>
          <Field label="Email" htmlFor="email" error={err(s, "email")}>
            <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!err(s, "email")} />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 10 characters, including a letter and a number." error={err(s, "password")}>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} aria-invalid={!!err(s, "password")} />
          </Field>
          <Checkbox
            name="terms"
            required
            label={
              <>
                I agree to the <Link href="/legal/terms" className="font-semibold underline">terms</Link> and have read the{" "}
                <Link href="/legal/privacy" className="font-semibold underline">privacy policy</Link>.
              </>
            }
          />
          {err(s, "terms") && <p className="text-xs font-medium text-[#9b2c1a]">{err(s, "terms")?.[0]}</p>}
          <SubmitButton className="w-full" size="lg" pendingLabel="Creating account…">Create account</SubmitButton>
        </>
      )}
    />
  );
}

export function ForgotPasswordForm() {
  return (
    <ActionForm action={forgotPasswordAction}>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingLabel="Sending…">Send reset link</SubmitButton>
    </ActionForm>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  return (
    <ActionForm
      action={resetPasswordAction}
      render={(s) => (
        <>
          <input type="hidden" name="token" value={token} />
          <Field label="New password" htmlFor="password" hint="At least 10 characters, including a letter and a number." error={err(s, "_")}>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
          </Field>
          <SubmitButton className="w-full" size="lg" pendingLabel="Saving…">Set new password</SubmitButton>
        </>
      )}
    />
  );
}
