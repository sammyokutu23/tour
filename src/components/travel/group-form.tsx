"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Alert, Badge, Checkbox, Field, Input, Select, Textarea, buttonClass, cn } from "@/components/ui";
import { DestinationArt } from "@/components/art/destination-art";
import type { ActionState } from "@/app/actions/types";

const STEPS = ["Basics", "Interests", "Budget", "Group rules", "Preview & publish"] as const;

/** Which step each server-side field error belongs to, so we can jump straight to it. */
const FIELD_STEP: Record<string, number> = {
  name: 0, description: 0, destinationId: 0, startDate: 0, endDate: 0, maxMembers: 0, language: 0, visibility: 0, coverArt: 0,
  interests: 1,
  minBudgetMinor: 2, maxBudgetMinor: 2, budgetIncludes: 2, expenseStyle: 2,
  travelPace: 3, activityLevel: 3, sharedTransport: 3, accommodation: 3, arrivalNotes: 3, communicationNotes: 3, cancellationNotes: 3, bookingDeadline: 3, approvalPolicy: 3,
};

export interface GroupFormDefaults {
  name?: string;
  description?: string;
  destination_id?: string;
  start_date?: string;
  end_date?: string;
  max_members?: number;
  language?: string;
  visibility?: string;
  interests?: string[];
  min_budget_minor?: number | null;
  max_budget_minor?: number | null;
  budget_includes?: string[];
  expense_style?: string;
  travel_pace?: string;
  activity_level?: string;
  shared_transport?: string;
  accommodation?: string;
  arrival_notes?: string | null;
  communication_notes?: string | null;
  cancellation_notes?: string | null;
  booking_deadline?: string | null;
  approval_policy?: string;
  cover_art?: string;
  status?: string;
}

function Submit({ intent, children, variant }: { intent: "draft" | "publish"; children: React.ReactNode; variant: "primary" | "secondary" }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("intent") === intent;
  return (
    <button type="submit" name="intent" value={intent} disabled={pending} className={buttonClass(variant, "lg")}>
      {mine && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function GroupForm({
  action,
  destinations,
  interests,
  defaults = {},
  minDate,
  isEdit = false,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  destinations: { id: string; name: string; region: string }[];
  interests: { slug: string; name: string }[];
  defaults?: GroupFormDefaults;
  minDate: string;
  isEdit?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<Record<string, string | string[]>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const d = defaults;
  const err = (k: string) => state?.fieldErrors?.[k];

  // When the server reports field errors, jump to the step that contains the first one.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    const first = Object.keys(state?.fieldErrors ?? {})[0];
    if (first && FIELD_STEP[first] !== undefined) setStep(FIELD_STEP[first]);
  }

  const go = (to: number) => {
    const form = formRef.current;
    if (!form) return;
    if (to > step) {
      const fields = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-step="${step}"] [name]`);
      for (const f of fields) if (!f.checkValidity()) return f.reportValidity();
      if (step === 1 && !form.querySelector('input[name="interests"]:checked')) {
        alertInterest();
        return;
      }
    }
    if (to === 4) {
      const fd = new FormData(form);
      const p: Record<string, string | string[]> = {};
      for (const k of new Set(fd.keys())) p[k] = fd.getAll(k).length > 1 || k === "interests" || k === "budgetIncludes" ? fd.getAll(k).map(String) : String(fd.get(k));
      setPreview(p);
    }
    setStep(to);
    form.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const [interestError, setInterestError] = useState(false);
  const alertInterest = () => setInterestError(true);

  const dest = destinations.find((x) => x.id === preview.destinationId);
  const val = (k: string) => (Array.isArray(preview[k]) ? (preview[k] as string[]).join(", ") : (preview[k] as string) || "—");

  return (
    <form ref={formRef} action={formAction} className="scroll-mt-28 space-y-6" noValidate={false}>
      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => (i < step ? setStep(i) : go(i))}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold",
                i === step ? "bg-forest text-sand" : i < step ? "bg-forest-100 text-forest" : "bg-sand-200 text-ink-muted",
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs">{i < step ? <Check aria-hidden className="h-3 w-3" /> : i + 1}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {typeof state?.ok === "string" && <Alert tone="success">{state.ok}</Alert>}

      <section data-step="0" hidden={step !== 0} className="space-y-4">
        <h2 className="text-2xl text-forest">The basics</h2>
        <Field label="Group name" htmlFor="name" error={err("name")} required>
          <Input id="name" name="name" defaultValue={d.name} required minLength={3} maxLength={80} placeholder="Mara safari, early December" />
        </Field>
        <Field label="Short description" htmlFor="description" error={err("description")} hint="What's the plan, and who would enjoy it?" required>
          <Textarea id="description" name="description" defaultValue={d.description} required minLength={20} maxLength={2000} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Destination" htmlFor="destinationId" error={err("destinationId")} required>
            <Select id="destinationId" name="destinationId" defaultValue={d.destination_id ?? ""} required>
              <option value="" disabled>Choose a destination</option>
              {destinations.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.region})</option>)}
            </Select>
          </Field>
          <Field label="Preferred language" htmlFor="language" error={err("language")} required>
            <Input id="language" name="language" defaultValue={d.language ?? "English"} required />
          </Field>
          <Field label="Start date" htmlFor="startDate" error={err("startDate")} required>
            <Input id="startDate" name="startDate" type="date" min={minDate} defaultValue={d.start_date} required />
          </Field>
          <Field label="End date" htmlFor="endDate" error={err("endDate")} required>
            <Input id="endDate" name="endDate" type="date" min={minDate} defaultValue={d.end_date} required />
          </Field>
          <Field label="Maximum group size (including you)" htmlFor="maxMembers" error={err("maxMembers")} required>
            <Input id="maxMembers" name="maxMembers" type="number" min={2} max={30} defaultValue={d.max_members ?? 6} required />
          </Field>
          <Field label="Cover illustration" htmlFor="coverArt" hint="Or upload your own photo below.">
            <Select id="coverArt" name="coverArt" defaultValue={d.cover_art ?? "savanna"}>
              {["savanna", "coast", "mountain", "lake", "city", "desert", "forest"].map((a) => <option key={a} value={a}>{a[0].toUpperCase() + a.slice(1)}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Cover photo (optional)" htmlFor="cover" hint="JPEG, PNG or WebP up to 5 MB. Only use photos you own.">
          <Input id="cover" name="cover" type="file" accept="image/jpeg,image/png,image/webp" className="py-2" />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Who can join?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["public", "Open", "Listed. Eligible travellers join instantly."],
              ["approval", "Request to join", "Listed. You approve each traveller."],
              ["private", "Invite only", "Never listed. Join by invitation only."],
            ].map(([v, t, desc]) => (
              <label key={v} className="cursor-pointer rounded-2xl border border-sand-300 bg-white p-3 text-sm has-[:checked]:border-forest has-[:checked]:ring-2 has-[:checked]:ring-forest">
                <input type="radio" name="visibility" value={v} defaultChecked={(d.visibility ?? "approval") === v} className="sr-only" required />
                <span className="block font-semibold text-forest">{t}</span>
                <span className="text-xs text-ink-muted">{desc}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section data-step="1" hidden={step !== 1} className="space-y-4">
        <h2 className="text-2xl text-forest">Interests &amp; activities</h2>
        <p className="text-sm text-ink-muted">Pick what the group will enjoy. These power the search filters and matching.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Interests">
          {interests.map((i) => (
            <label key={i.slug} className="cursor-pointer rounded-full border border-sand-300 bg-white px-3.5 py-2 text-sm font-medium has-[:checked]:border-forest has-[:checked]:bg-forest has-[:checked]:text-sand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold">
              <input type="checkbox" name="interests" value={i.slug} defaultChecked={d.interests?.includes(i.slug)} onChange={() => setInterestError(false)} className="sr-only" />
              {i.name}
            </label>
          ))}
        </div>
        {(interestError || err("interests")) && <p role="alert" className="text-sm font-medium text-[#9b2c1a]">Choose at least one interest.</p>}
      </section>

      <section data-step="2" hidden={step !== 2} className="space-y-4">
        <h2 className="text-2xl text-forest">Budget (an estimate)</h2>
        <p className="text-sm text-ink-muted">Give travellers a rough idea of costs per person. This is a guide, not a price — nobody is asked about their income or finances.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum per person (KES)" htmlFor="minBudget" error={err("minBudgetMinor")}>
            <Input id="minBudget" name="minBudget" type="number" min={0} step={500} defaultValue={d.min_budget_minor != null ? d.min_budget_minor / 100 : ""} />
          </Field>
          <Field label="Maximum per person (KES)" htmlFor="maxBudget" error={err("maxBudgetMinor")}>
            <Input id="maxBudget" name="maxBudget" type="number" min={0} step={500} defaultValue={d.max_budget_minor != null ? d.max_budget_minor / 100 : ""} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">The estimate includes</legend>
          <div className="flex flex-wrap gap-4">
            {["accommodation", "transport", "activities", "meals"].map((x) => <Checkbox key={x} name="budgetIncludes" value={x} defaultChecked={d.budget_includes?.includes(x) ?? x === "activities"} label={x[0].toUpperCase() + x.slice(1)} />)}
          </div>
        </fieldset>
        <Field label="How will costs work?" htmlFor="expenseStyle">
          <Select id="expenseStyle" name="expenseStyle" defaultValue={d.expense_style ?? "individual"}>
            <option value="individual">Everyone pays for themselves</option>
            <option value="mixed">Mostly individual, a few things split</option>
            <option value="shared">We plan to split shared costs</option>
          </Select>
        </Field>
        <p className="text-xs text-ink-subtle">The platform never charges members on someone else&apos;s behalf. Each traveller books and pays for their own place.</p>
      </section>

      <section data-step="3" hidden={step !== 3} className="space-y-4">
        <h2 className="text-2xl text-forest">Group rules &amp; expectations</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pace" htmlFor="travelPace">
            <Select id="travelPace" name="travelPace" defaultValue={d.travel_pace ?? "balanced"}><option value="relaxed">Relaxed</option><option value="balanced">Balanced</option><option value="adventurous">Adventurous</option></Select>
          </Field>
          <Field label="Activity level" htmlFor="activityLevel">
            <Select id="activityLevel" name="activityLevel" defaultValue={d.activity_level ?? "moderate"}><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="challenging">Challenging</option></Select>
          </Field>
          <Field label="Shared transport" htmlFor="sharedTransport">
            <Select id="sharedTransport" name="sharedTransport" defaultValue={d.shared_transport ?? "optional"}><option value="none">Everyone arranges their own</option><option value="optional">Optional, if people want</option><option value="planned">We&apos;ll plan shared transport</option></Select>
          </Field>
          <Field label="Accommodation" htmlFor="accommodation">
            <Select id="accommodation" name="accommodation" defaultValue={d.accommodation ?? "own"}><option value="own">Everyone books their own</option><option value="optional_shared">Optional coordination (never required)</option></Select>
          </Field>
          <Field label="How decisions are made" htmlFor="approvalPolicy" hint="Majority: an idea is agreed once more than half of members vote yes.">
            <Select id="approvalPolicy" name="approvalPolicy" defaultValue={d.approval_policy ?? "majority"}><option value="majority">Majority vote</option><option value="organizer">Organizers decide (votes are advisory)</option></Select>
          </Field>
          <Field label="Booking deadline (optional)" htmlFor="bookingDeadline" error={err("bookingDeadline")}>
            <Input id="bookingDeadline" name="bookingDeadline" type="date" min={minDate} defaultValue={d.booking_deadline ?? ""} />
          </Field>
        </div>
        <Field label="Arrival & departure expectations" htmlFor="arrivalNotes"><Textarea id="arrivalNotes" name="arrivalNotes" defaultValue={d.arrival_notes ?? ""} maxLength={500} placeholder="e.g. Be in Narok by 10:00 on day one." className="min-h-16" /></Field>
        <Field label="Communication" htmlFor="communicationNotes"><Textarea id="communicationNotes" name="communicationNotes" defaultValue={d.communication_notes ?? ""} maxLength={500} placeholder="e.g. Please check the group chat every couple of days." className="min-h-16" /></Field>
        <Field label="Cancellation expectations" htmlFor="cancellationNotes"><Textarea id="cancellationNotes" name="cancellationNotes" defaultValue={d.cancellation_notes ?? ""} maxLength={500} placeholder="e.g. Let the group know at least a week ahead if you drop out." className="min-h-16" /></Field>
        <p className="text-xs text-ink-subtle">Rules must not exclude people on the basis of protected characteristics or ask for sensitive personal information.</p>
      </section>

      <section data-step="4" hidden={step !== 4} className="space-y-5">
        <h2 className="text-2xl text-forest">Preview</h2>
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-sand-300 bg-white">
          <div className="h-36"><DestinationArt variant={(preview.coverArt as "savanna") || "savanna"} seed="preview" /></div>
          <div className="space-y-2 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-terracotta-700">{dest?.name ?? "—"}</p>
            <p className="text-xl font-bold text-forest">{val("name")}</p>
            <p className="text-sm text-ink-muted">{val("startDate")} → {val("endDate")} · up to {val("maxMembers")} people · {val("language")}</p>
            <p className="text-sm">{val("description")}</p>
            <div className="flex flex-wrap gap-1.5">{(Array.isArray(preview.interests) ? preview.interests : []).map((i) => <Badge key={i} tone="forest">{interests.find((x) => x.slug === i)?.name ?? i}</Badge>)}</div>
            <p className="text-sm text-ink-muted">Budget estimate: {preview.minBudget || "—"} – {preview.maxBudget || "—"} KES per person · {val("expenseStyle")} costs · {val("travelPace")} pace</p>
            <p className="text-sm text-ink-muted">Joining: {preview.visibility === "public" ? "open" : preview.visibility === "private" ? "invite only" : "request to join"} · Decisions: {preview.approvalPolicy === "organizer" ? "organizers decide" : "majority vote"}</p>
          </div>
        </div>
        <label className="flex items-start gap-3 rounded-2xl bg-sand p-4 text-sm">
          <input type="checkbox" name="guidelines" className="mt-0.5 h-4 w-4 accent-forest" />
          <span>I agree to the <a href="/travel-together/guidelines" target="_blank" className="font-semibold underline">community guidelines</a> and understand that I&apos;m responsible for moderating my group.</span>
        </label>
        <div className="flex flex-wrap gap-3">
          {(!isEdit || d.status === "draft") && <Submit intent="publish" variant="primary">{isEdit ? "Publish group" : "Publish group"}</Submit>}
          <Submit intent="draft" variant="secondary">{isEdit && d.status !== "draft" ? "Save changes" : "Save as draft"}</Submit>
        </div>
      </section>

      <div className="flex justify-between border-t border-sand-200 pt-4">
        <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className={buttonClass("ghost", "md")}>
          <ChevronLeft aria-hidden className="h-4 w-4" /> Back
        </button>
        {step < 4 && (
          <button type="button" onClick={() => go(step + 1)} className={buttonClass("primary", "md")}>
            Next: {STEPS[step + 1]} <ChevronRight aria-hidden className="h-4 w-4" />
          </button>
        )}
      </div>
    </form>
  );
}
