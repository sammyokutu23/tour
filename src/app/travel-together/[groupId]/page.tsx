import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CalendarDays, Languages, ListChecks, MapPin, MessagesSquare, Settings2, Users, Wallet } from "lucide-react";
import { GroupCover, PlacesBar, VisibilityBadge, budgetLabel } from "@/components/travel/group-card";
import { ReportForm } from "@/components/travel/report-form";
import { GuideAvatar } from "@/components/catalogue/cards";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { ActionButton } from "@/components/forms/action-button";
import { Alert, Badge, Card, Container, DefinitionList, DemoBadge, Field, Input, LinkButton, PageSkeleton, Textarea } from "@/components/ui";
import { getActor, requestDb } from "@/server/auth/session";
import { getGroup, getTravelProfile } from "@/server/services/travel-groups";
import { track } from "@/server/services/analytics";
import { cancelGroupAction, joinAction, leaveGroupAction, respondInvitationAction, withdrawRequestAction } from "@/app/actions/travel";
import { NotFoundError } from "@/domain/authz";
import { INTEREST_LABEL } from "@/domain/travel-groups";
import { daysBetween, formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "Travel group", robots: { index: false } };
type Params = Promise<{ groupId: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

const LABELS: Record<string, string> = {
  individual: "Everyone pays for themselves",
  mixed: "Mostly individual, some shared costs",
  shared: "Plans to split shared costs",
  easy: "Easy",
  moderate: "Moderate",
  challenging: "Challenging",
  none: "Everyone arranges their own",
  optional: "Optional shared transport",
  planned: "Shared transport planned",
  own: "Everyone books their own",
  optional_shared: "Optional coordination",
  organizer: "Organizers decide (votes are advisory)",
  majority: "Majority vote",
};

export default function GroupPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Container className="py-10"><PageSkeleton /></Container>}>
      <Group params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Group({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { groupId } = await params;
  const sp = await searchParams;
  const db = await requestDb();
  const actor = await getActor();
  const g = await getGroup(db, actor, groupId).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  await track(db, "group_viewed", { visibility: g.visibility }, actor?.userId ?? null);
  const profile = actor ? await getTravelProfile(db, actor) : null;
  const isMember = !!g.viewer.role;
  const isOrganizer = g.viewer.role === "organizer" || g.viewer.role === "co_organizer";
  const nights = daysBetween(g.startDate, g.endDate);
  const budget = budgetLabel(g);
  const eligible = !!profile?.adultConfirmed && !!profile?.guidelinesAccepted;

  return (
    <>
      <section className="relative isolate overflow-hidden bg-forest-950">
        <GroupCover id={g.id} hasCover={g.hasCover} art={g.coverArt} className="absolute inset-0 -z-10 opacity-80" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-forest-950/95 via-forest-950/50 to-forest-950/10" />
        <Container className="flex min-h-[320px] flex-col justify-end pb-10 pt-24">
          <div className="flex flex-wrap gap-2">
            <VisibilityBadge visibility={g.visibility} />
            {g.isDemo && <DemoBadge />}
            {g.status !== "published" && <Badge tone={g.status === "draft" ? "gold" : "danger"} className="capitalize">{g.status}</Badge>}
          </div>
          <h1 className="mt-3 max-w-3xl text-balance text-4xl text-sand sm:text-5xl">{g.name}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sand/85">
            <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden className="h-4 w-4 text-gold" />{g.destination.name}</span>
            <span className="inline-flex items-center gap-1.5"><CalendarDays aria-hidden className="h-4 w-4 text-gold" />{formatDate(g.startDate)} – {formatDate(g.endDate)} ({nights + 1} days)</span>
            <span className="inline-flex items-center gap-1.5"><Languages aria-hidden className="h-4 w-4 text-gold" />{g.language}</span>
          </p>
        </Container>
      </section>

      <Container className="py-10">
        <div className="mb-6 space-y-3">
          {sp.created === "publish" && <Alert tone="success" title="Your group is live">Invite people or wait for requests. You&apos;ll be notified when someone wants to join.</Alert>}
          {sp.created === "draft" && <Alert tone="info" title="Saved as a draft">Only you can see it. Publish it from Edit when you&apos;re ready.</Alert>}
          {g.status === "draft" && !sp.created && <Alert tone="info">This group is a draft and visible only to you.</Alert>}
          {g.status === "suspended" && <Alert tone="error" title="Paused by our safety team">{g.statusReason ?? "This group is under review."} Chat and joining are closed meanwhile.</Alert>}
          {g.status === "cancelled" && <Alert tone="warning" title="This group was cancelled">{g.statusReason}</Alert>}
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-8">
            {isMember && (
              <nav aria-label="Group sections" className="grid gap-3 sm:grid-cols-3">
                <LinkButton href={`/travel-together/${g.id}/itinerary`} variant="primary"><ListChecks aria-hidden className="h-4 w-4" />Shared itinerary</LinkButton>
                <LinkButton href={`/travel-together/${g.id}/chat`} variant="secondary"><MessagesSquare aria-hidden className="h-4 w-4" />Group chat</LinkButton>
                <LinkButton href={`/travel-together/${g.id}/members`} variant="secondary"><Users aria-hidden className="h-4 w-4" />Members</LinkButton>
              </nav>
            )}

            <section>
              <h2 className="mb-2 text-2xl text-forest">About this trip</h2>
              <p className="whitespace-pre-line leading-relaxed">{g.description}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">{g.interests.map((i) => <Badge key={i} tone="forest">{INTEREST_LABEL[i] ?? i}</Badge>)}</div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <Card className="p-5">
                <h3 className="flex items-center gap-2 font-bold text-forest"><Wallet aria-hidden className="h-4 w-4 text-terracotta-700" />Budget estimate</h3>
                <p className="mt-2 text-2xl font-bold text-forest">{budget ?? "Not set"}</p>
                <p className="text-xs text-ink-subtle">per person · an estimate, not a price</p>
                {g.budgetIncludes.length > 0 && <p className="mt-2 text-sm text-ink-muted">Includes: {g.budgetIncludes.join(", ")}</p>}
                <p className="mt-1 text-sm text-ink-muted">{LABELS[g.expenseStyle]}</p>
              </Card>
              <Card className="p-5">
                <h3 className="mb-1 font-bold text-forest">Group rules</h3>
                <DefinitionList items={[
                  { term: "Pace", detail: <span className="capitalize">{g.pace}</span> },
                  { term: "Activity level", detail: LABELS[g.activityLevel] },
                  { term: "Transport", detail: LABELS[g.sharedTransport] },
                  { term: "Accommodation", detail: LABELS[g.accommodation] },
                  { term: "Decisions", detail: LABELS[g.approvalPolicy] },
                  ...(g.bookingDeadline ? [{ term: "Book by", detail: formatDate(g.bookingDeadline) }] : []),
                ]} />
              </Card>
            </section>

            {(g.arrivalNotes || g.communicationNotes || g.cancellationNotes) && (
              <section className="space-y-3">
                <h2 className="text-xl text-forest">Expectations</h2>
                {g.arrivalNotes && <p className="rounded-xl bg-white p-4 text-sm"><strong>Arrival & departure:</strong> {g.arrivalNotes}</p>}
                {g.communicationNotes && <p className="rounded-xl bg-white p-4 text-sm"><strong>Communication:</strong> {g.communicationNotes}</p>}
                {g.cancellationNotes && <p className="rounded-xl bg-white p-4 text-sm"><strong>If plans change:</strong> {g.cancellationNotes}</p>}
              </section>
            )}

            <section>
              <h2 className="mb-3 text-2xl text-forest">Who&apos;s going</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {g.members.map((m) => (
                  <li key={m.userId} className="flex items-start gap-3 rounded-2xl border border-sand-300/70 bg-white p-3">
                    <GuideAvatar name={m.visible ? m.name : "?"} photoUrl={m.photoUrl} className="h-11 w-11 text-sm" />
                    <div className="min-w-0">
                      <p className="font-semibold text-forest">{m.name}{m.userId === g.viewer.userId ? " (you)" : ""}</p>
                      <p className="text-xs capitalize text-ink-subtle">{m.role.replace("_", "-")}</p>
                      {m.visible && m.bio && <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{m.bio}</p>}
                      {m.visible && m.interests.length > 0 && <p className="mt-1 text-xs text-ink-subtle">{m.interests.map((i) => INTEREST_LABEL[i] ?? i).slice(0, 3).join(" · ")}</p>}
                      {!m.visible && <p className="mt-1 text-xs text-ink-subtle">Profile shared with group members only</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:h-fit">
            <Card className="p-5">
              <PlacesBar memberCount={g.memberCount} maxMembers={g.maxMembers} />
              <div className="mt-4">
                <JoinPanel g={g} eligible={eligible} signedIn={!!actor} />
              </div>
            </Card>

            {isOrganizer && g.status !== "cancelled" && (
              <Card className="p-5">
                <h2 className="flex items-center gap-2 font-bold text-forest"><Settings2 aria-hidden className="h-4 w-4" />Organizer tools</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <LinkButton href={`/travel-together/${g.id}/edit`} variant="secondary" size="sm">Edit group</LinkButton>
                  <LinkButton href={`/travel-together/${g.id}/members`} variant="secondary" size="sm">Members & invitations</LinkButton>
                  <LinkButton href="/travel-together/requests" variant="secondary" size="sm">Join requests</LinkButton>
                </div>
                {g.viewer.role === "organizer" && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-semibold text-terracotta-700">Cancel this group</summary>
                    <ActionForm action={cancelGroupAction.bind(null, g.id)} className="mt-3 space-y-3" confirm="I understand all members will be notified and the group will close.">
                      <Field label="Reason (shared with members)" htmlFor="reason"><Input id="reason" name="reason" required minLength={3} /></Field>
                      <SubmitButton size="sm" variant="danger">Cancel group</SubmitButton>
                    </ActionForm>
                  </details>
                )}
              </Card>
            )}

            <Card className="p-5 text-sm">
              <p className="font-semibold text-forest">Stay safe</p>
              <p className="mt-1 text-ink-muted">Keep chats and payments on the platform. Never share PINs or send money to other travellers.</p>
              <div className="mt-3 flex flex-wrap gap-4">
                {actor && <ReportForm groupId={g.id} label="Report this group" />}
                <Link href="/travel-together/guidelines" className="text-xs font-semibold text-forest underline">Guidelines</Link>
              </div>
            </Card>
          </aside>
        </div>
      </Container>
    </>
  );
}

function JoinPanel({ g, eligible, signedIn }: { g: Awaited<ReturnType<typeof getGroup>>; eligible: boolean; signedIn: boolean }) {
  const full = g.placesLeft === 0;
  if (g.viewer.role) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl bg-forest-50 px-3 py-2 text-sm font-semibold text-forest">{g.viewer.role === "member" ? "You're going on this trip 🎉" : "You organise this group"}</p>
        {g.viewer.role === "member" ? (
          <ActionButton action={leaveGroupAction.bind(null, g.id)} variant="ghost" confirm="Leave this group? You'll lose access to its chat and plan." className="text-terracotta-700">Leave group</ActionButton>
        ) : (
          <p className="text-xs text-ink-subtle">To leave, first make another member the organizer from the Members page.</p>
        )}
      </div>
    );
  }
  if (g.status !== "published") return <p className="text-sm text-ink-muted">This group isn&apos;t accepting members.</p>;
  if (!signedIn) {
    return (
      <div className="space-y-2">
        <LinkButton href={`/login?next=/travel-together/${g.id}`} className="w-full">Sign in to join</LinkButton>
        <p className="text-center text-xs text-ink-subtle">New here? <Link href={`/register?next=/travel-together/${g.id}`} className="font-semibold underline">Create a free account</Link></p>
      </div>
    );
  }
  if (g.viewer.memberStatus === "banned") return <p className="text-sm text-ink-muted">You can&apos;t join this group.</p>;
  if (!eligible) {
    return (
      <Alert tone="info">
        Travel Together is for adults. <Link href={`/travel-together/profile?next=/travel-together/${g.id}`} className="font-semibold underline">Confirm you&apos;re 18+ and accept the guidelines</Link> to join.
      </Alert>
    );
  }
  if (g.viewer.invitationId) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-forest">You&apos;ve been invited to this group.</p>
        <div className="flex gap-2">
          <ActionButton action={respondInvitationAction.bind(null, g.viewer.invitationId, "accept")} variant="primary" size="md" disabled={full}>Accept invitation</ActionButton>
          <ActionButton action={respondInvitationAction.bind(null, g.viewer.invitationId, "decline")} variant="ghost" size="md">Decline</ActionButton>
        </div>
      </div>
    );
  }
  if (g.viewer.requested) {
    return (
      <div className="space-y-2">
        <p className="rounded-xl bg-[#eef4fa] px-3 py-2 text-sm text-[#1f4a6e]">Request sent — waiting for the organizer.</p>
        <ActionButton action={withdrawRequestAction.bind(null, g.id)} variant="ghost">Withdraw request</ActionButton>
      </div>
    );
  }
  if (full) return <p className="text-sm text-ink-muted">This group is full. Check back in case a place opens up.</p>;
  if (g.visibility === "public") {
    return (
      <ActionForm action={joinAction.bind(null, g.id)}>
        <p className="text-sm text-ink-muted">Joining is instant. You can leave at any time, and nothing is booked or charged by joining.</p>
        <SubmitButton className="w-full" size="lg" pendingLabel="Joining…">Join this group</SubmitButton>
      </ActionForm>
    );
  }
  return (
    <ActionForm action={joinAction.bind(null, g.id)}>
      <Field label="Message to the organizer (optional)" htmlFor="message" hint="Say hello and why the trip suits you. Don't share contact details here.">
        <Textarea id="message" name="message" maxLength={500} className="min-h-20" />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingLabel="Sending…">Request to join</SubmitButton>
    </ActionForm>
  );
}
