"use client";

import { useActionState, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Alert, Field, Select, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/forms/action-form";
import { inviteLinkAction } from "@/app/actions/travel";

/** Creates an invitation link and shows the raw token exactly once (only its hash is stored). */
export function InviteLinkForm({ groupId }: { groupId: string }) {
  const [state, action] = useActionState(inviteLinkAction.bind(null, groupId), null);
  const [copied, setCopied] = useState(false);
  const token = state?.data?.token as string | undefined;
  const url = token ? `${typeof window === "undefined" ? "" : window.location.origin}/travel-together/invite/${token}` : null;
  return (
    <form action={action} className="mt-3 space-y-3">
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Uses" htmlFor="maxUses">
          <Select id="maxUses" name="maxUses" defaultValue="1">{[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}</Select>
        </Field>
        <Field label="Expires after" htmlFor="days">
          <Select id="days" name="days" defaultValue="7">{[1, 3, 7, 14, 30].map((n) => <option key={n} value={n}>{n} day{n === 1 ? "" : "s"}</option>)}</Select>
        </Field>
      </div>
      <SubmitButton variant="secondary" pendingLabel="Creating…">Create link</SubmitButton>
      {url && (
        <div className="rounded-xl bg-forest-50 p-3">
          <p className="mb-2 text-xs font-semibold text-forest">Copy this link now — it won&apos;t be shown again.</p>
          <div className="flex gap-2">
            <input readOnly value={url} aria-label="Invitation link" className="h-10 min-w-0 flex-1 rounded-lg border border-sand-300 bg-white px-2 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className={buttonClass("primary", "sm", "h-10")}
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              }}
            >
              {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
