import { Suspense } from "react";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Alert, Card, Checkbox, Container, Field, Input, PageHeader, PageSkeleton, Select, Textarea } from "@/components/ui";
import { requestDb, requireSession, safeNext } from "@/server/auth/session";
import { getTravelProfile, listBlocked } from "@/server/services/travel-groups";
import { listAllDestinationsBrief } from "@/server/services/catalogue";
import { blockAction, saveTravelProfileAction } from "@/app/actions/travel";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Travel profile" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default function TravelProfilePage({ searchParams }: { searchParams: SP }) {
  return (
    <Container className="max-w-4xl py-10">
      <PageHeader title="Your travel profile" description="Help others get to know you — share only what you're comfortable with. Your email, phone number and bookings are never shown." />
      <Suspense fallback={<PageSkeleton />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Form({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await requireSession("/travel-together/profile");
  const db = await requestDb();
  const [p, destinations, interests, blocked] = await Promise.all([
    getTravelProfile(db, session.actor),
    listAllDestinationsBrief(db),
    db.query<{ slug: string; name: string }>("select slug, name from travel_interests order by sort_order"),
    listBlocked(db, session.actor),
  ]);
  const next = typeof sp.next === "string" ? safeNext(sp.next, "") : "";
  return (
    <div className="mt-8 space-y-6">
      {next && <Alert tone="info">Complete this to continue — you&apos;ll go straight back afterwards.</Alert>}
      <Card className="p-6">
        <ActionForm action={saveTravelProfileAction}>
          <input type="hidden" name="next" value={next} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who can see your travel profile?" htmlFor="visibility" className="sm:col-span-2">
              <Select id="visibility" name="visibility" defaultValue={p.visibility}>
                <option value="members">People in my groups</option>
                <option value="public">Anyone on Travel Together</option>
                <option value="private">Only me (others see your first name only)</option>
              </Select>
            </Field>
            <Field label="About you" htmlFor="bio" hint="A few lines about how you like to travel." className="sm:col-span-2">
              <Textarea id="bio" name="bio" defaultValue={p.bio ?? ""} maxLength={600} />
            </Field>
            <Field label="Profile photo URL (optional, https)" htmlFor="photoUrl"><Input id="photoUrl" name="photoUrl" type="url" defaultValue={p.photoUrl ?? ""} /></Field>
            <Field label="Preferred pace" htmlFor="pace">
              <Select id="pace" name="pace" defaultValue={p.pace ?? ""}><option value="">No preference</option><option value="relaxed">Relaxed</option><option value="balanced">Balanced</option><option value="adventurous">Adventurous</option></Select>
            </Field>
            <Field label="Trips you'd like to share (optional)" htmlFor="pastTrips" className="sm:col-span-2"><Textarea id="pastTrips" name="pastTrips" defaultValue={p.pastTrips ?? ""} maxLength={1000} className="min-h-16" /></Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Interests</legend>
            <div className="flex flex-wrap gap-2">
              {interests.rows.map((i) => (
                <label key={i.slug} className="cursor-pointer rounded-full border border-sand-300 px-3 py-1.5 text-sm has-[:checked]:border-forest has-[:checked]:bg-forest has-[:checked]:text-sand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold">
                  <input type="checkbox" name="interests" value={i.slug} defaultChecked={p.interests.includes(i.slug)} className="sr-only" />{i.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Places you&apos;d love to go</legend>
            <div className="grid gap-2 sm:grid-cols-3">{destinations.map((d) => <Checkbox key={d.slug} name="destinations" value={d.slug} defaultChecked={p.destinationSlugs.includes(d.slug)} label={d.name} />)}</div>
          </fieldset>
          <p className="text-xs text-ink-subtle">Languages come from your <a href="/dashboard/settings" className="underline">account settings</a>.</p>
          <div className="space-y-3 rounded-2xl bg-sand p-4">
            <Checkbox name="adult" defaultChecked={p.adultConfirmed} label="I confirm I am 18 or older. (Travel Together is for adults only.)" />
            <Checkbox name="guidelines" defaultChecked={p.guidelinesAccepted} label={<>I&apos;ve read and agree to the <a href="/travel-together/guidelines" target="_blank" className="font-semibold underline">community guidelines</a>.</>} />
          </div>
          <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
        </ActionForm>
      </Card>
      <Card className="p-6">
        <h2 className="text-lg font-bold text-forest">Blocked travellers</h2>
        <p className="mt-1 text-sm text-ink-muted">Blocked people can&apos;t join your groups, invite you, message you directly, and their messages are hidden from you in group chats.</p>
        {blocked.length ? (
          <ul className="mt-3 divide-y divide-sand-200">
            {blocked.map((b) => (
              <li key={b.blocked_id} className="flex items-center justify-between py-2 text-sm">
                <span>{b.name} <span className="text-xs text-ink-subtle">since {formatDate(b.created_at)}</span></span>
                <ActionButton action={blockAction.bind(null, b.blocked_id, false)} variant="ghost">Unblock</ActionButton>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-ink-subtle">You haven&apos;t blocked anyone.</p>}
      </Card>
    </div>
  );
}
