import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AlertTriangle, Car, CheckCircle2, Clock, MapPin, ThumbsDown, ThumbsUp, UserRound } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { ProposeForm, type ProposeOptions } from "@/components/travel/propose-form";
import { TripMap, type MapMarker } from "@/components/map/trip-map";
import { Alert, Badge, Card, Container, Input, PageHeader, PageSkeleton, cn, type BadgeTone } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { getGroupItinerary, type BookingSummary } from "@/server/services/travel-groups";
import { studioCatalogue } from "@/server/services/studio-catalogue";
import { bookAgreedAction, commentAction, decideProposalAction, voteAction } from "@/app/actions/travel";
import { NotFoundError } from "@/domain/authz";
import { estimateTravelMinutes } from "@/domain/geo";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDuration, formatTime } from "@/lib/time";

export const metadata = { title: "Shared itinerary" };
type Params = Promise<{ groupId: string }>;

export default function GroupItineraryPage({ params }: { params: Params }) {
  return (
    <Container className="py-10">
      <Suspense fallback={<PageSkeleton />}>
        <Itinerary params={params} />
      </Suspense>
    </Container>
  );
}

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  proposed: { label: "Proposed · organizer decides", tone: "info" },
  voting: { label: "Open for voting", tone: "gold" },
  approved: { label: "Agreed", tone: "success" },
  rejected: { label: "Not going ahead", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function bookingLabel(b: BookingSummary | undefined): { label: string; tone: BadgeTone } | null {
  if (!b) return { label: "Not booked yet", tone: "neutral" };
  if (b.confirmed > 0 && b.pending === 0) return { label: `Confirmed for ${b.confirmed}`, tone: "success" };
  if (b.pending > 0) return { label: `Awaiting provider/payment (${b.pending})${b.confirmed ? ` · ${b.confirmed} confirmed` : ""}`, tone: "info" };
  return null;
}

async function Itinerary({ params }: { params: Params }) {
  const { groupId } = await params;
  const session = await requireSession(`/travel-together/${groupId}/itinerary`);
  const db = await requestDb();
  const data = await getGroupItinerary(db, session.actor, groupId).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { group, graph, viewer } = data;
  const isOrganizer = viewer.role !== "member";
  const active = group.status === "published";

  // Catalogue options for proposals: experiences with open times within the trip, and guides serving the destination.
  const destSlug = graph.primaryDestination?.slug;
  const plan = { ...data.plan, adults: data.activeMembers, children: 0 };
  const [exp, guides] = destSlug
    ? await Promise.all([studioCatalogue(db, plan, [destSlug], {}), studioCatalogue(db, plan, [destSlug], { tab: "guides" })])
    : [{ experiences: [] }, { guides: [] }];
  const tz = graph.primaryDestination?.timezone ?? "Africa/Nairobi";
  const options: ProposeOptions = {
    experiences: exp.experiences.map((e) => ({
      title: e.title,
      priceLabel: `${formatMoney(e.basePriceMinor)}${e.pricingModel === "per_group" ? "/group" : "/pp"}`,
      slots: e.slots
        .filter((s) => e.pricingModel === "per_group" || s.remaining >= 1)
        .map((s) => ({ id: s.id, label: `${formatDate(s.startsAt, { weekday: "short", day: "numeric", month: "short", year: undefined }, tz)} · ${formatTime(s.startsAt, tz)}${e.pricingModel === "per_group" ? "" : ` · ${s.remaining} places`}` })),
    })),
    guides: guides.guides.map((g) => ({ name: g.name, services: g.services.map((s) => ({ id: s.id, label: `${s.title} · ${formatDuration(s.durationMinutes)} · ${formatMoney(s.basePriceMinor)}${s.pricingModel === "per_group" ? "/group" : "/pp"}` })) })),
    days: graph.days.map((d) => ({ date: d.date, label: `Day ${d.dayNumber} · ${formatDate(d.date, { weekday: "short", day: "numeric", month: "short", year: undefined })}` })),
  };

  const itemToProposal = new Map(data.proposals.filter((p) => p.itinerary_item_id).map((p) => [p.itinerary_item_id!, p]));
  const issuesByItem = new Map<string, typeof data.issues>();
  for (const i of data.issues) if (i.itemId) issuesByItem.set(i.itemId, [...(issuesByItem.get(i.itemId) ?? []), i]);
  const open = data.proposals.filter((p) => p.status === "voting" || p.status === "proposed");
  const closed = data.proposals.filter((p) => p.status === "rejected" || p.status === "cancelled");
  const markers: MapMarker[] = graph.items
    .filter((i) => i.kind === "experience" && i.location)
    .sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime())
    .map((i, n) => ({ lat: i.location!.lat, lng: i.location!.lng, label: i.title, kind: "experience" as const, order: n + 1 }));

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/travel-together/${groupId}`} className="text-sm font-semibold text-forest underline">← {group.name}</Link>
        <PageHeader
          className="mt-2"
          title="Shared itinerary"
          description={group.approvalPolicy === "majority"
            ? `Ideas are agreed when more than half of the group's ${data.activeMembers} member${data.activeMembers === 1 ? "" : "s"} vote yes.`
            : "Members vote to share their view; organizers make the final call."}
        />
      </div>

      <Alert tone="info" title="Agreeing isn't booking">
        Agreed activities appear in the plan below, but nothing is reserved or charged until someone books. Each traveller books and pays for their own place; private-group activities and guides are booked once by an organizer for everyone.
      </Alert>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {graph.days.map((day) => {
            const items = graph.items.filter((i) => i.dayId === day.id).sort((a, b) => (a.startsAt?.getTime() ?? Infinity) - (b.startsAt?.getTime() ?? Infinity));
            const proposals = open.filter((p) => p.day_date === day.date);
            let prev: (typeof items)[number] | null = null;
            return (
              <section key={day.id} aria-labelledby={`d-${day.id}`} className="rounded-[var(--radius-card)] border border-sand-300/70 bg-white p-4 sm:p-5">
                <h2 id={`d-${day.id}`} className="mb-3 text-lg font-bold text-forest">
                  Day {day.dayNumber} <span className="font-sans text-sm font-medium text-ink-subtle">· {formatDate(day.date, { weekday: "long", day: "numeric", month: "long", year: undefined })}</span>
                </h2>
                {items.length === 0 && proposals.length === 0 && <p className="rounded-xl border border-dashed border-sand-300 p-4 text-center text-sm text-ink-subtle">Nothing agreed yet. Propose something below.</p>}
                <ol className="space-y-3">
                  {items.map((i) => {
                    const p = itemToProposal.get(i.id);
                    const b = bookingLabel(data.bookings.get(i.id));
                    const mine = data.bookings.get(i.id)?.mine;
                    let travel: string | null = null;
                    if (i.kind === "experience" && prev?.location && i.location && prev.endsAt && i.startsAt) {
                      travel = `≈ ${formatDuration(estimateTravelMinutes(prev.location, i.location))} from previous stop (estimate)`;
                    }
                    if (i.kind === "experience") prev = i;
                    const cost = data.itemCosts.get(i.id);
                    const perGroup = i.kind === "guide" || i.pricing?.pricingModel === "per_group";
                    return (
                      <li key={i.id} className="rounded-2xl border border-l-4 border-sand-300/70 border-l-forest bg-sand/40 p-4">
                        {travel && <p className="mb-2 flex items-center gap-1.5 text-xs text-ink-subtle"><Car aria-hidden className="h-3.5 w-3.5" />{travel}</p>}
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap gap-1.5">
                              <Badge tone="success"><CheckCircle2 aria-hidden className="h-3 w-3" />Agreed</Badge>
                              {i.isOptional || p?.is_optional ? <Badge>Optional</Badge> : <Badge tone="forest">Planned for all</Badge>}
                              {i.kind !== "note" && b && <Badge tone={b.tone}>{b.label}</Badge>}
                            </div>
                            <p className="mt-1.5 font-semibold text-charcoal">{i.experience ? <Link href={`/experiences/${i.experience.slug}`} className="hover:underline">{i.title}</Link> : i.title}</p>
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                              {i.startsAt && i.endsAt && <span className="inline-flex items-center gap-1"><Clock aria-hidden className="h-3.5 w-3.5" />{formatTime(i.startsAt, i.timezone)}–{formatTime(i.endsAt, i.timezone)} ({formatDuration(Math.round((i.endsAt.getTime() - i.startsAt.getTime()) / 60000))})</span>}
                              {i.experience?.meetingPoint && <span className="inline-flex items-center gap-1"><MapPin aria-hidden className="h-3.5 w-3.5" />{i.experience.meetingPoint}</span>}
                              {i.providerName && <span className="inline-flex items-center gap-1"><UserRound aria-hidden className="h-3.5 w-3.5" />{i.providerName}</span>}
                            </div>
                            {(issuesByItem.get(i.id) ?? []).map((x, n) => (
                              <p key={n} className={cn("mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs", x.severity === "error" ? "bg-[#fdf0ed] text-[#8f2a17]" : "bg-gold-100 text-[#6b4e0b]")}>
                                <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />{x.message}
                              </p>
                            ))}
                          </div>
                          {cost !== undefined && (
                            <p className="text-right text-sm font-semibold text-forest">
                              ≈ {formatMoney(cost)}
                              <span className="block text-[11px] font-normal text-ink-subtle">per person{perGroup ? ` (shared by ${data.activeMembers})` : ""}</span>
                            </p>
                          )}
                        </div>
                        {p && i.kind !== "note" && active && (
                          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-sand-200 pt-3">
                            {mine ? (
                              <Link href={`/dashboard/bookings/${mine.bookingId}`} className="text-sm font-semibold text-forest underline">Your booking: {mine.status.replace(/_/g, " ")}</Link>
                            ) : perGroup ? (
                              isOrganizer ? (
                                <ActionButton action={bookAgreedAction.bind(null, p.id)} variant="primary" pendingLabel="Preparing…">Book for the group ({data.activeMembers})</ActionButton>
                              ) : (
                                <span className="text-xs text-ink-subtle">An organizer books this once for the whole group. You won&apos;t be charged unless you agree to pay them back.</span>
                              )
                            ) : (
                              <ActionButton action={bookAgreedAction.bind(null, p.id)} variant="primary" pendingLabel="Preparing…">Book my place</ActionButton>
                            )}
                            {isOrganizer && <ActionButton action={decideProposalAction.bind(null, p.id, "cancel")} variant="ghost" confirm="Remove this from the group plan? Bookings people already made are not cancelled." className="text-terracotta-700">Remove from plan</ActionButton>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>

                {proposals.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Ideas for this day</p>
                    {proposals.map((p) => (
                      <article key={p.id} className="rounded-2xl border border-dashed border-gold bg-gold-100/30 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                            <p className="mt-1.5 font-semibold">{p.title}{p.start_time ? ` · ${p.start_time.slice(0, 5)}` : ""}</p>
                            <p className="text-xs text-ink-subtle">Suggested by {p.proposer}{p.is_optional ? " · optional" : ""}</p>
                            {p.notes && <p className="mt-1 text-sm text-ink-muted">{p.notes}</p>}
                          </div>
                          <p className="text-sm font-semibold">
                            <span className="text-[#1d5b39]">{p.yes} yes</span> · <span className="text-terracotta-700">{p.no} no</span>
                            <span className="block text-[11px] font-normal text-ink-subtle">of {data.activeMembers} members</span>
                          </p>
                        </div>
                        {active && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <ActionButton action={voteAction.bind(null, p.id, "yes")} variant={p.my_vote === "yes" ? "primary" : "secondary"} ariaLabel="Vote yes" showSuccess><ThumbsUp aria-hidden className="h-4 w-4" />Yes{p.my_vote === "yes" ? " (your vote)" : ""}</ActionButton>
                            <ActionButton action={voteAction.bind(null, p.id, "no")} variant={p.my_vote === "no" ? "danger" : "secondary"} ariaLabel="Vote no" showSuccess><ThumbsDown aria-hidden className="h-4 w-4" />No{p.my_vote === "no" ? " (your vote)" : ""}</ActionButton>
                            {isOrganizer && group.approvalPolicy === "organizer" && (
                              <>
                                <ActionButton action={decideProposalAction.bind(null, p.id, "approve")} variant="primary">Approve</ActionButton>
                                <ActionButton action={decideProposalAction.bind(null, p.id, "reject")} variant="ghost">Decline</ActionButton>
                              </>
                            )}
                            {(isOrganizer || p.proposed_by === viewer.userId) && <ActionButton action={decideProposalAction.bind(null, p.id, "cancel")} variant="ghost" className="text-terracotta-700">Withdraw</ActionButton>}
                          </div>
                        )}
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs font-semibold text-forest">Discussion ({p.comments.length})</summary>
                          <ul className="mt-2 space-y-1.5">
                            {p.comments.map((c, n) => <li key={n} className="rounded-lg bg-white px-3 py-2 text-sm"><strong>{c.author}:</strong> {c.body}</li>)}
                          </ul>
                          {active && (
                            <ActionForm action={commentAction.bind(null, p.id)} resetOnSuccess className="mt-2 flex gap-2">
                              <Input name="body" aria-label="Add a comment" placeholder="Add a comment" maxLength={1000} required className="h-9" />
                              <SubmitButton size="sm" variant="secondary" className="h-9">Post</SubmitButton>
                            </ActionForm>
                          )}
                        </details>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {closed.length > 0 && (
            <details className="rounded-2xl bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-forest">Past ideas ({closed.length})</summary>
              <ul className="mt-2 space-y-1 text-sm text-ink-muted">
                {closed.map((p) => <li key={p.id}>{p.title} — {STATUS[p.status].label.toLowerCase()} ({p.yes} yes, {p.no} no)</li>)}
              </ul>
            </details>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:h-fit">
          <Card className="p-5">
            <h2 className="font-bold text-forest">Estimated cost per person</h2>
            <p className="mt-1 text-3xl font-bold text-forest">{formatMoney(data.perPersonMinor)}</p>
            <p className="text-xs text-ink-subtle">For agreed, non-optional activities. Shared-group prices are split across {data.activeMembers} member{data.activeMembers === 1 ? "" : "s"}. Fees, park entry and transport are extra. Final prices are confirmed at booking.</p>
            {group.maxBudgetMinor !== null && (
              <p className={cn("mt-2 text-sm font-semibold", data.perPersonMinor > group.maxBudgetMinor ? "text-terracotta-700" : "text-[#1d5b39]")}>
                Group budget up to {formatMoney(group.maxBudgetMinor)}{data.perPersonMinor > group.maxBudgetMinor ? " — currently over" : ""}
              </p>
            )}
          </Card>
          {markers.length > 0 && <TripMap markers={markers} connect className="h-56" ariaLabel="Map of agreed activities" />}
          {active ? (
            <Card className="p-5">
              <h2 className="mb-3 font-bold text-forest">Propose something</h2>
              <ProposeForm groupId={groupId} options={options} />
            </Card>
          ) : (
            <Alert tone="info">This group isn&apos;t active, so the plan is read-only.</Alert>
          )}
        </aside>
      </div>
    </div>
  );
}
