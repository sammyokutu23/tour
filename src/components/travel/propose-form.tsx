"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Checkbox, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { proposeAction } from "@/app/actions/travel";

export interface ProposeOptions {
  experiences: { title: string; priceLabel: string; slots: { id: string; label: string }[] }[];
  guides: { name: string; services: { id: string; label: string }[] }[];
  days: { date: string; label: string }[];
}

export function ProposeForm({ groupId, options }: { groupId: string; options: ProposeOptions }) {
  const [kind, setKind] = useState<"experience" | "guide" | "note">("experience");
  const bookable = options.experiences.filter((e) => e.slots.length);
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="What are you proposing?" className="grid grid-cols-3 gap-1 rounded-full border border-sand-300 bg-white p-1">
        {([
          ["experience", "Experience"],
          ["guide", "Guide"],
          ["note", "Idea / note"],
        ] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={cn("rounded-full py-1.5 text-sm font-semibold", kind === k ? "bg-forest text-sand" : "text-ink-muted hover:bg-forest-50")}>
            {l}
          </button>
        ))}
      </div>
      <ActionForm action={proposeAction.bind(null, groupId)} resetOnSuccess className="space-y-3" key={kind}>
        <input type="hidden" name="kind" value={kind} />
        {kind === "experience" &&
          (bookable.length ? (
            <Field label="Experience and time" htmlFor="slotId" hint="Only times within the trip dates with open places are listed.">
              <Select id="slotId" name="slotId" required>
                {bookable.map((e) => (
                  <optgroup key={e.title} label={`${e.title} · ${e.priceLabel}`}>
                    {e.slots.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </optgroup>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="rounded-xl bg-sand p-3 text-sm text-ink-muted">No experiences have open times during these dates at this destination. Propose a guide day or an idea instead.</p>
          ))}
        {kind === "guide" && (
          <>
            <Field label="Guide service" htmlFor="serviceId">
              <Select id="serviceId" name="serviceId" required>
                {options.guides.map((g) => (
                  <optgroup key={g.name} label={g.name}>
                    {g.services.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Day" htmlFor="g-date"><Select id="g-date" name="date">{options.days.map((d) => <option key={d.date} value={d.date}>{d.label}</option>)}</Select></Field>
              <Field label="Start" htmlFor="g-time"><Input id="g-time" name="startTime" type="time" step={900} defaultValue="08:00" /></Field>
            </div>
          </>
        )}
        {kind === "note" && (
          <>
            <Field label="Idea" htmlFor="n-title"><Input id="n-title" name="title" required minLength={2} maxLength={140} placeholder="Dinner together on the last night" /></Field>
            <Field label="Day" htmlFor="n-date"><Select id="n-date" name="date">{options.days.map((d) => <option key={d.date} value={d.date}>{d.label}</option>)}</Select></Field>
          </>
        )}
        <Field label="Why you'd like it (optional)" htmlFor="p-notes"><Textarea id="p-notes" name="notes" maxLength={1000} className="min-h-16" /></Field>
        <Checkbox name="optional" label="Optional — people can skip it" />
        <SubmitButton pendingLabel="Sharing…" disabled={kind === "experience" && !bookable.length}>Propose to the group</SubmitButton>
        <p className="text-xs text-ink-subtle">Proposing and voting never books or charges anything.</p>
      </ActionForm>
    </div>
  );
}
