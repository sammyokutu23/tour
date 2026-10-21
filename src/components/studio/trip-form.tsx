"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import type { ActionState } from "@/app/actions/types";

export const INTERESTS = ["wildlife", "culture", "beach", "marine", "history", "hiking", "adventure", "birding", "nature", "food", "photography", "relaxation", "cycling"];

export interface TripFormDefaults {
  title?: string;
  primaryDestinationId?: string | null;
  startDate?: string;
  endDate?: string;
  adults?: number;
  children?: number;
  budgetMajor?: number | null;
  interests?: string[];
  pace?: string;
  tourType?: string;
  languages?: string[];
  accessibilityNotes?: string | null;
  dietaryNotes?: string | null;
  accommodationNotes?: string | null;
  transportNotes?: string | null;
}

const e = (s: ActionState, k: string) => s?.fieldErrors?.[k];

export function TripForm({
  action,
  destinations,
  defaults = {},
  submitLabel,
  minDate,
  compact = false,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  destinations: { id: string; name: string; region: string }[];
  defaults?: TripFormDefaults;
  submitLabel: string;
  minDate: string;
  compact?: boolean;
}) {
  return (
    <ActionForm
      action={action}
      render={(s) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Trip name" htmlFor="title" error={e(s, "title")} className="sm:col-span-2" required>
              <Input id="title" name="title" defaultValue={defaults.title ?? "My Kenya trip"} maxLength={140} required />
            </Field>
            <Field label="Main destination" htmlFor="primaryDestinationId" hint="You can add activities anywhere in Kenya.">
              <Select id="primaryDestinationId" name="primaryDestinationId" defaultValue={defaults.primaryDestinationId ?? ""}>
                <option value="">Not decided yet</option>
                {destinations.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.region})</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Arrival" htmlFor="startDate" error={e(s, "startDate")} required>
                <Input id="startDate" name="startDate" type="date" min={minDate} defaultValue={defaults.startDate} required />
              </Field>
              <Field label="Departure" htmlFor="endDate" error={e(s, "endDate")} required>
                <Input id="endDate" name="endDate" type="date" min={minDate} defaultValue={defaults.endDate} required />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Adults" htmlFor="adults" error={e(s, "adults")}>
                <Input id="adults" name="adults" type="number" min={1} max={60} defaultValue={defaults.adults ?? 2} />
              </Field>
              <Field label="Children" htmlFor="children" hint="Under 12" error={e(s, "children")}>
                <Input id="children" name="children" type="number" min={0} max={60} defaultValue={defaults.children ?? 0} />
              </Field>
              <Field label="Budget (KES)" htmlFor="budget" error={e(s, "budgetMinor")}>
                <Input id="budget" name="budget" type="number" min={0} step={1000} inputMode="numeric" defaultValue={defaults.budgetMajor ?? ""} placeholder="Optional" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pace" htmlFor="pace">
                <Select id="pace" name="pace" defaultValue={defaults.pace ?? "balanced"}>
                  <option value="relaxed">Relaxed</option>
                  <option value="balanced">Balanced</option>
                  <option value="adventurous">Adventurous</option>
                </Select>
              </Field>
              <Field label="Tour type" htmlFor="tourType">
                <Select id="tourType" name="tourType" defaultValue={defaults.tourType ?? "private"}>
                  <option value="private">Private</option>
                  <option value="shared">Shared / small group</option>
                </Select>
              </Field>
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Interests</legend>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((i) => (
                <label key={i} className="cursor-pointer rounded-full border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium capitalize has-[:checked]:border-forest has-[:checked]:bg-forest has-[:checked]:text-sand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold">
                  <input type="checkbox" name="interests" value={i} defaultChecked={defaults.interests?.includes(i)} className="sr-only" />
                  {i}
                </label>
              ))}
            </div>
          </fieldset>

          {!compact && (
            <details className="rounded-2xl border border-sand-300 bg-white p-4" open={!!(defaults.accessibilityNotes || defaults.dietaryNotes)}>
              <summary className="cursor-pointer text-sm font-semibold text-forest">Languages, accessibility, dietary and logistics (optional)</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Preferred guide languages" htmlFor="languages" hint="Comma separated, e.g. English, French">
                  <Input id="languages" name="languages" defaultValue={defaults.languages?.join(", ")} />
                </Field>
                <Field label="Accessibility needs" htmlFor="accessibilityNotes" hint="Shared with providers you book.">
                  <Input id="accessibilityNotes" name="accessibilityNotes" defaultValue={defaults.accessibilityNotes ?? ""} maxLength={1000} />
                </Field>
                <Field label="Dietary requirements" htmlFor="dietaryNotes" hint="Shared with providers you book.">
                  <Input id="dietaryNotes" name="dietaryNotes" defaultValue={defaults.dietaryNotes ?? ""} maxLength={1000} />
                </Field>
                <Field label="Accommodation preferences" htmlFor="accommodationNotes">
                  <Input id="accommodationNotes" name="accommodationNotes" defaultValue={defaults.accommodationNotes ?? ""} maxLength={1000} />
                </Field>
                <Field label="Transport preferences" htmlFor="transportNotes" className="sm:col-span-2">
                  <Textarea id="transportNotes" name="transportNotes" defaultValue={defaults.transportNotes ?? ""} maxLength={1000} className="min-h-16" />
                </Field>
              </div>
            </details>
          )}
          <SubmitButton size="lg" pendingLabel="Saving…">{submitLabel}</SubmitButton>
        </>
      )}
    />
  );
}
