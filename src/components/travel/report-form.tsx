"use client";

import { Flag } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Checkbox, Field, Select, Textarea, cn } from "@/components/ui";
import { reportAction } from "@/app/actions/travel";

/** Disclosure-based report form (keyboard accessible, no blocking browser dialogs). */
export function ReportForm({
  groupId,
  reportedUserId,
  messageId,
  label = "Report",
  compact = false,
}: {
  groupId?: string;
  reportedUserId?: string;
  messageId?: string;
  label?: string;
  compact?: boolean;
}) {
  const id = `report-${messageId ?? reportedUserId ?? groupId}`;
  return (
    <details className={cn("group", compact ? "inline-block" : "")}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-terracotta-700 hover:underline [&::-webkit-details-marker]:hidden">
        <Flag aria-hidden className="h-3.5 w-3.5" /> {label}
      </summary>
      <div className="mt-3 w-full min-w-72 max-w-md rounded-2xl border-2 border-forest bg-white p-4 text-left shadow-[var(--shadow-lift)]">
        <ActionForm action={reportAction} resetOnSuccess className="space-y-3">
          {groupId && <input type="hidden" name="groupId" value={groupId} />}
          {reportedUserId && <input type="hidden" name="reportedUserId" value={reportedUserId} />}
          {messageId && <input type="hidden" name="messageId" value={messageId} />}
          <Field label="What's happening?" htmlFor={`${id}-category`}>
            <Select id={`${id}-category`} name="category" defaultValue="safety">
              <option value="safety">Safety concern</option>
              <option value="harassment">Harassment or abuse</option>
              <option value="scam">Scam or request for money</option>
              <option value="impersonation">Impersonation or fake profile</option>
              <option value="spam">Spam</option>
              <option value="inappropriate">Inappropriate content</option>
              <option value="other">Something else</option>
            </Select>
          </Field>
          <Field label="Details" htmlFor={`${id}-details`} hint="Only our safety team sees this. The person won't be told who reported them.">
            <Textarea id={`${id}-details`} name="details" required minLength={10} maxLength={4000} className="min-h-20" />
          </Field>
          {reportedUserId && <Checkbox name="block" label="Also block this person" />}
          <SubmitButton size="sm" variant="danger" pendingLabel="Sending…">Send report</SubmitButton>
        </ActionForm>
      </div>
    </details>
  );
}
