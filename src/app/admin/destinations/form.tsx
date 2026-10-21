import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import type { ActionState } from "@/app/actions/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw destination row
export function DestinationForm({ action, d = {} }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; d?: Record<string, any> }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" required><Input id="name" name="name" defaultValue={d.name} required /></Field>
        <Field label="Slug" htmlFor="slug" hint="lowercase-with-hyphens" required><Input id="slug" name="slug" defaultValue={d.slug} required /></Field>
        <Field label="Region" htmlFor="region" required><Input id="region" name="region" defaultValue={d.region} required /></Field>
        <Field label="County" htmlFor="county"><Input id="county" name="county" defaultValue={d.county ?? ""} /></Field>
        <Field label="Summary" htmlFor="summary" className="sm:col-span-2" required><Input id="summary" name="summary" defaultValue={d.summary} required /></Field>
        <Field label="Description" htmlFor="description" className="sm:col-span-2" required><Textarea id="description" name="description" defaultValue={d.description} className="min-h-32" required /></Field>
        <Field label="Latitude" htmlFor="latitude" required><Input id="latitude" name="latitude" type="number" step="any" defaultValue={d.latitude} required /></Field>
        <Field label="Longitude" htmlFor="longitude" required><Input id="longitude" name="longitude" type="number" step="any" defaultValue={d.longitude} required /></Field>
        <Field label="Travel styles" htmlFor="travelStyles" hint="Comma separated"><Input id="travelStyles" name="travelStyles" defaultValue={d.travel_styles?.join(", ")} /></Field>
        <Field label="Illustration" htmlFor="artVariant"><Select id="artVariant" name="artVariant" defaultValue={d.art_variant ?? "savanna"}>{["savanna", "coast", "mountain", "lake", "city", "desert", "forest"].map((v) => <option key={v}>{v}</option>)}</Select></Field>
        <Field label="Best time to visit" htmlFor="bestTimeToVisit" className="sm:col-span-2"><Textarea id="bestTimeToVisit" name="bestTimeToVisit" defaultValue={d.best_time_to_visit ?? ""} /></Field>
        <Field label="Getting there" htmlFor="travelInfo" className="sm:col-span-2"><Textarea id="travelInfo" name="travelInfo" defaultValue={d.travel_info ?? ""} /></Field>
      </div>
      <Checkbox name="isPublished" defaultChecked={d.is_published ?? true} label="Published" />
      <SubmitButton>Save destination</SubmitButton>
    </ActionForm>
  );
}
