import Link from "next/link";
import { Suspense } from "react";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Badge, Card, Checkbox, Field, Input, PageHeader, PageSkeleton, Select } from "@/components/ui";
import { requestDb, requireProviderSession } from "@/server/auth/session";
import { getOwnAvailability } from "@/server/services/providers";
import { addExceptionAction, removeExceptionAction, weeklyHoursAction } from "@/app/actions/provider";
import { formatDate, formatTime, toZoned } from "@/lib/time";

export const metadata = { title: "Availability" };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function AvailabilityPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Availability" description="Travellers can only book guide time inside your working hours, outside blocked dates and existing bookings. Changing hours never cancels bookings." />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const session = await requireProviderSession("/provider/availability");
  const { rules, exceptions, reservations } = await getOwnAvailability(await requestDb(), session.actor);
  const byDay = new Map(rules.map((r) => [r.weekday, r]));
  const today = toZoned(new Date(), "Africa/Nairobi").date;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-bold text-forest">Weekly working hours</h2>
        <ActionForm action={weeklyHoursAction}>
          <div className="space-y-2">
            {DAYS.map((d, i) => {
              const r = byDay.get(i);
              return (
                <div key={d} className="grid grid-cols-[130px_1fr_1fr] items-center gap-3">
                  <Checkbox name={`on-${i}`} defaultChecked={!!r} label={d} />
                  <label className="sr-only" htmlFor={`start-${i}`}>{d} start</label>
                  <Input id={`start-${i}`} name={`start-${i}`} type="time" defaultValue={r?.start_time ?? "08:00"} className="h-9" />
                  <label className="sr-only" htmlFor={`end-${i}`}>{d} end</label>
                  <Input id={`end-${i}`} name={`end-${i}`} type="time" defaultValue={r?.end_time ?? "17:00"} className="h-9" />
                </div>
              );
            })}
          </div>
          <SubmitButton pendingLabel="Saving…">Save hours</SubmitButton>
        </ActionForm>
      </Card>
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-bold text-forest">Leave, blocked dates &amp; extra time</h2>
          <ActionForm action={addExceptionAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            <Field label="Date" htmlFor="date"><Input id="date" name="date" type="date" min={today} required /></Field>
            <Field label="Type" htmlFor="kind"><Select id="kind" name="kind"><option value="unavailable">Unavailable (leave/blocked)</option><option value="available">Extra availability</option></Select></Field>
            <Field label="From (optional)" htmlFor="startTime" hint="Leave both empty to block the whole day"><Input id="startTime" name="startTime" type="time" /></Field>
            <Field label="To (optional)" htmlFor="endTime"><Input id="endTime" name="endTime" type="time" /></Field>
            <Field label="Note" htmlFor="reason" className="sm:col-span-2"><Input id="reason" name="reason" maxLength={200} /></Field>
            <div className="sm:col-span-2"><SubmitButton size="sm" pendingLabel="Saving…">Add</SubmitButton></div>
          </ActionForm>
          {exceptions.length > 0 && (
            <ul className="mt-4 divide-y divide-sand-200 text-sm">
              {exceptions.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <Badge tone={e.kind === "unavailable" ? "danger" : "success"}>{e.kind === "unavailable" ? "Blocked" : "Extra"}</Badge>{" "}
                    {formatDate(e.date)} {e.start_time ? `${e.start_time}–${e.end_time}` : "(all day)"} {e.reason && <span className="text-ink-subtle">· {e.reason}</span>}
                  </span>
                  <ActionButton action={removeExceptionAction.bind(null, e.id)} variant="ghost">Remove</ActionButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="mb-3 text-lg font-bold text-forest">Reserved time</h2>
          {reservations.length ? (
            <ul className="space-y-2 text-sm">
              {reservations.map((r, i) => (
                <li key={i} className="flex justify-between gap-2 rounded-xl bg-sand px-3 py-2">
                  <span>{formatDate(r.lower, { weekday: "short", day: "numeric", month: "short" })} · {formatTime(r.lower)}–{formatTime(r.upper)} <span className="text-xs text-ink-subtle">(incl. buffer)</span></span>
                  <Link href={`/provider/bookings/${r.booking_id}`} className="font-mono text-xs underline">{r.reference}</Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-muted">No reservations yet.</p>}
        </Card>
      </div>
    </div>
  );
}
