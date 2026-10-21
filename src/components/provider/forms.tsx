"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import type { ActionState } from "@/app/actions/types";

const fe = (s: ActionState, k: string) => s?.fieldErrors?.[k];

export interface ExperienceDefaults {
  title?: string;
  summary?: string;
  description?: string;
  destination_id?: string;
  category_id?: string;
  duration_minutes?: number;
  pricing_model?: string;
  base_price_minor?: number;
  child_price_minor?: number | null;
  max_group_size?: number;
  min_age?: number | null;
  inclusions?: string[];
  exclusions?: string[];
  meeting_point?: string;
  meeting_lat?: number | null;
  meeting_lng?: number | null;
  preparation_notes?: string | null;
  accessibility_notes?: string | null;
  restrictions?: string | null;
  cancellation_policy?: string;
  min_notice_hours?: number;
  travel_styles?: string[];
}

export function ExperienceForm({
  action,
  defaults = {},
  destinations,
  categories,
  submitLabel,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  defaults?: ExperienceDefaults;
  destinations: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  submitLabel: string;
}) {
  const d = defaults;
  return (
    <ActionForm
      action={action}
      render={(s) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="title" error={fe(s, "title")} className="sm:col-span-2" required><Input id="title" name="title" defaultValue={d.title} maxLength={140} /></Field>
            <Field label="Short summary" htmlFor="summary" error={fe(s, "summary")} className="sm:col-span-2" required><Input id="summary" name="summary" defaultValue={d.summary} maxLength={300} /></Field>
            <Field label="Full description" htmlFor="description" error={fe(s, "description")} className="sm:col-span-2" required><Textarea id="description" name="description" defaultValue={d.description} className="min-h-32" /></Field>
            <Field label="Destination" htmlFor="destinationId" error={fe(s, "destinationId")} required>
              <Select id="destinationId" name="destinationId" defaultValue={d.destination_id ?? ""}><option value="">Select</option>{destinations.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
            </Field>
            <Field label="Category" htmlFor="categoryId" error={fe(s, "categoryId")} required>
              <Select id="categoryId" name="categoryId" defaultValue={d.category_id ?? ""}><option value="">Select</option>{categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
            </Field>
            <Field label="Duration (hours)" htmlFor="durationHours" error={fe(s, "durationMinutes")} required><Input id="durationHours" name="durationHours" type="number" min={0.25} max={24} step={0.25} defaultValue={d.duration_minutes ? d.duration_minutes / 60 : 3} /></Field>
            <Field label="Pricing" htmlFor="pricingModel">
              <Select id="pricingModel" name="pricingModel" defaultValue={d.pricing_model ?? "per_person"}><option value="per_person">Per person</option><option value="per_group">Per private group</option></Select>
            </Field>
            <Field label="Price (KES)" htmlFor="price" error={fe(s, "basePriceMinor")} required><Input id="price" name="price" type="number" min={1} step={1} defaultValue={d.base_price_minor ? d.base_price_minor / 100 : ""} /></Field>
            <Field label="Child price (KES, optional)" htmlFor="childPrice" hint="Per-person listings only"><Input id="childPrice" name="childPrice" type="number" min={0} defaultValue={d.child_price_minor != null ? d.child_price_minor / 100 : ""} /></Field>
            <Field label="Maximum group size" htmlFor="maxGroupSize" error={fe(s, "maxGroupSize")}><Input id="maxGroupSize" name="maxGroupSize" type="number" min={1} max={500} defaultValue={d.max_group_size ?? 8} /></Field>
            <Field label="Minimum age (optional)" htmlFor="minAge"><Input id="minAge" name="minAge" type="number" min={0} max={99} defaultValue={d.min_age ?? ""} /></Field>
            <Field label="Included (one per line)" htmlFor="inclusions"><Textarea id="inclusions" name="inclusions" defaultValue={d.inclusions?.join("\n")} /></Field>
            <Field label="Not included (one per line)" htmlFor="exclusions"><Textarea id="exclusions" name="exclusions" defaultValue={d.exclusions?.join("\n")} /></Field>
            <Field label="Meeting point" htmlFor="meetingPoint" error={fe(s, "meetingPoint")} className="sm:col-span-2" required><Input id="meetingPoint" name="meetingPoint" defaultValue={d.meeting_point} /></Field>
            <Field label="Meeting point latitude" htmlFor="meetingLat" hint="Optional, e.g. -0.7811" error={fe(s, "meetingLat")}><Input id="meetingLat" name="meetingLat" type="number" step="any" defaultValue={d.meeting_lat ?? ""} /></Field>
            <Field label="Meeting point longitude" htmlFor="meetingLng" hint="Optional, e.g. 36.3962" error={fe(s, "meetingLng")}><Input id="meetingLng" name="meetingLng" type="number" step="any" defaultValue={d.meeting_lng ?? ""} /></Field>
            <Field label="How to prepare" htmlFor="preparationNotes"><Textarea id="preparationNotes" name="preparationNotes" defaultValue={d.preparation_notes ?? ""} /></Field>
            <Field label="Accessibility" htmlFor="accessibilityNotes"><Textarea id="accessibilityNotes" name="accessibilityNotes" defaultValue={d.accessibility_notes ?? ""} /></Field>
            <Field label="Restrictions" htmlFor="restrictions"><Textarea id="restrictions" name="restrictions" defaultValue={d.restrictions ?? ""} /></Field>
            <div className="grid gap-4">
              <Field label="Cancellation policy" htmlFor="cancellationPolicy">
                <Select id="cancellationPolicy" name="cancellationPolicy" defaultValue={d.cancellation_policy ?? "moderate"}><option value="flexible">Flexible</option><option value="moderate">Moderate</option><option value="strict">Strict</option></Select>
              </Field>
              <Field label="Minimum notice (hours)" htmlFor="minNoticeHours"><Input id="minNoticeHours" name="minNoticeHours" type="number" min={0} max={720} defaultValue={d.min_notice_hours ?? 24} /></Field>
            </div>
            <Field label="Travel styles" htmlFor="travelStyles" hint="Comma separated, e.g. wildlife, culture" className="sm:col-span-2"><Input id="travelStyles" name="travelStyles" defaultValue={d.travel_styles?.join(", ")} /></Field>
          </div>
          <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
        </>
      )}
    />
  );
}

export function GuideServiceForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  defaults?: { title: string; description: string; durationMinutes: number; pricingModel: string; basePriceMinor: number; maxGroupSize: number; bufferMinutes: number; minNoticeHours: number; cancellationPolicy: string };
  submitLabel: string;
}) {
  const d = defaults;
  return (
    <ActionForm
      action={action}
      resetOnSuccess={!d}
      render={(s) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Service name" htmlFor="title" error={fe(s, "title")} className="sm:col-span-2" required><Input id="title" name="title" defaultValue={d?.title} placeholder="Full-day private guiding" /></Field>
            <Field label="Description" htmlFor="description" error={fe(s, "description")} className="sm:col-span-2" required><Textarea id="description" name="description" defaultValue={d?.description} /></Field>
            <Field label="Duration (hours)" htmlFor="durationHours" error={fe(s, "durationMinutes")}><Input id="durationHours" name="durationHours" type="number" min={1} max={16} step={0.5} defaultValue={d ? d.durationMinutes / 60 : 8} /></Field>
            <Field label="Pricing" htmlFor="pricingModel"><Select id="pricingModel" name="pricingModel" defaultValue={d?.pricingModel ?? "per_group"}><option value="per_group">Per group</option><option value="per_person">Per person</option></Select></Field>
            <Field label="Price (KES)" htmlFor="price" error={fe(s, "basePriceMinor")} required><Input id="price" name="price" type="number" min={1} defaultValue={d ? d.basePriceMinor / 100 : ""} /></Field>
            <Field label="Max group size" htmlFor="maxGroupSize"><Input id="maxGroupSize" name="maxGroupSize" type="number" min={1} max={60} defaultValue={d?.maxGroupSize ?? 6} /></Field>
            <Field label="Buffer after (minutes)" htmlFor="bufferMinutes" hint="Travel/prep time blocked after each booking"><Input id="bufferMinutes" name="bufferMinutes" type="number" min={0} max={600} defaultValue={d?.bufferMinutes ?? 60} /></Field>
            <Field label="Minimum notice (hours)" htmlFor="minNoticeHours"><Input id="minNoticeHours" name="minNoticeHours" type="number" min={0} max={720} defaultValue={d?.minNoticeHours ?? 48} /></Field>
            <Field label="Cancellation policy" htmlFor="cancellationPolicy"><Select id="cancellationPolicy" name="cancellationPolicy" defaultValue={d?.cancellationPolicy ?? "moderate"}><option value="flexible">Flexible</option><option value="moderate">Moderate</option><option value="strict">Strict</option></Select></Field>
          </div>
          <SubmitButton size="sm" pendingLabel="Saving…">{submitLabel}</SubmitButton>
        </>
      )}
    />
  );
}
