import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { ExperienceForm, type ExperienceDefaults } from "@/components/provider/forms";
import { Alert, Badge, Card, Checkbox, Field, Input, PageHeader, PageSkeleton, Table, Td, Th } from "@/components/ui";
import { requestDb, requireProviderSession } from "@/server/auth/session";
import { listAllDestinationsBrief, listCategories } from "@/server/services/catalogue";
import { getOwnExperience } from "@/server/services/providers";
import { archiveExperienceAction, createSlotsAction, saveExperienceAction, slotCapacityAction, slotStatusAction, submitExperienceAction } from "@/app/actions/provider";
import { NotFoundError } from "@/domain/authz";
import { addDays, formatDate, formatTime, toZoned } from "@/lib/time";

export const metadata = { title: "Edit experience" };
type Params = Promise<{ id: string }>;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function EditListingPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Params }) {
  const { id } = await params;
  const session = await requireProviderSession(`/provider/listings/${id}`);
  const db = await requestDb();
  const data = await getOwnExperience(db, session.actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const e = data.experience as unknown as ExperienceDefaults & { status: string; moderation_notes: string | null; title: string; timezone: string; slug: string };
  const [destinations, categories] = await Promise.all([listAllDestinationsBrief(db), listCategories(db)]);
  const today = toZoned(new Date(), "Africa/Nairobi").date;

  return (
    <div className="space-y-6">
      <PageHeader
        title={e.title}
        description={<>Status: <Badge className="capitalize">{e.status.replace("_", " ")}</Badge></>}
        actions={
          <>
            {["draft", "rejected"].includes(e.status) && <ActionButton action={submitExperienceAction.bind(null, id)} variant="primary" showSuccess>Submit for review</ActionButton>}
            <ActionButton action={archiveExperienceAction.bind(null, id)} variant="ghost" confirm="Archive this listing? Future unbooked slots will close.">Archive</ActionButton>
          </>
        }
      />
      {e.moderation_notes && e.status !== "published" && <Alert tone="warning" title="Moderator note">{e.moderation_notes}</Alert>}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-bold text-forest">Time slots</h2>
        <ActionForm action={createSlotsAction.bind(null, id)} className="grid gap-3 rounded-2xl bg-sand p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.8fr_0.8fr]">
          <Field label="From" htmlFor="fromDate"><Input id="fromDate" name="fromDate" type="date" min={today} defaultValue={addDays(today, 1)} /></Field>
          <Field label="To" htmlFor="toDate"><Input id="toDate" name="toDate" type="date" min={today} defaultValue={addDays(today, 30)} /></Field>
          <Field label="Start time" htmlFor="startTime"><Input id="startTime" name="startTime" type="time" defaultValue="08:00" /></Field>
          <Field label="Capacity" htmlFor="capacity" hint="People, or groups for per-group pricing"><Input id="capacity" name="capacity" type="number" min={1} max={500} defaultValue={e.pricing_model === "per_group" ? 1 : e.max_group_size} /></Field>
          <fieldset className="sm:col-span-2 lg:col-span-4">
            <legend className="mb-2 text-sm font-semibold">On these days</legend>
            <div className="flex flex-wrap gap-3">{DAYS.map((d, i) => <Checkbox key={d} name="weekdays" value={String(i)} defaultChecked={i !== 0} label={d} />)}</div>
          </fieldset>
          <div className="sm:col-span-2 lg:col-span-4"><SubmitButton size="sm" pendingLabel="Adding…">Add slots</SubmitButton></div>
        </ActionForm>
        {data.slots.length ? (
          <Table className="mt-4">
            <thead><tr><Th>Date</Th><Th>Time</Th><Th>Reserved</Th><Th>Capacity</Th><Th>Status</Th></tr></thead>
            <tbody>
              {data.slots.map((s) => (
                <tr key={s.id}>
                  <Td>{formatDate(s.starts_at, { weekday: "short", day: "numeric", month: "short" }, e.timezone)}</Td>
                  <Td>{formatTime(s.starts_at, e.timezone)}–{formatTime(s.ends_at, e.timezone)}</Td>
                  <Td>{s.reserved}</Td>
                  <Td>
                    <ActionForm action={slotCapacityAction.bind(null, s.id)} className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`cap-${s.id}`}>Capacity</label>
                      <Input id={`cap-${s.id}`} name="capacity" type="number" min={Math.max(1, s.reserved)} defaultValue={s.capacity} className="h-8 w-20" />
                      <SubmitButton size="sm" variant="ghost" className="h-8">Save</SubmitButton>
                    </ActionForm>
                  </Td>
                  <Td>
                    {s.status === "cancelled" ? <Badge tone="danger">Cancelled</Badge> : (
                      <ActionButton action={slotStatusAction.bind(null, s.id, s.status === "open" ? "closed" : "open")} variant={s.status === "open" ? "secondary" : "primary"} className="h-8">{s.status === "open" ? "Close" : "Reopen"}</ActionButton>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <p className="mt-4 text-sm text-ink-muted">No upcoming slots. Add some so travellers can book.</p>}
        <p className="mt-2 text-xs text-ink-subtle">Closing a slot stops new bookings. Existing reservations stay valid — cancel them from the booking if needed, and the traveller is refunded.</p>
      </Card>
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-bold text-forest">Details</h2>
        <ExperienceForm action={saveExperienceAction.bind(null, id)} defaults={e} destinations={destinations} categories={categories} submitLabel="Save changes" />
      </Card>
    </div>
  );
}
