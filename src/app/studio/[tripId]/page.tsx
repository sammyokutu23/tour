import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import { AlertTriangle, CalendarDays, Copy, Link2, Pencil, Users } from "lucide-react";
import { Timeline } from "@/components/studio/timeline";
import { CataloguePanel, type PanelExperience } from "@/components/studio/catalogue-panel";
import { TripForm } from "@/components/studio/trip-form";
import type { PlannerDay } from "@/components/studio/types";
import { TripMap, type MapMarker } from "@/components/map/trip-map";
import { ActionButton } from "@/components/forms/action-button";
import { Alert, Badge, Card, Container, LinkButton, PageSkeleton, cn } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { getStudioView } from "@/server/services/trips";
import { studioCatalogue, alternativeSlots } from "@/server/services/studio-catalogue";
import { listAllDestinationsBrief, listCategories } from "@/server/services/catalogue";
import { archiveTripAction, duplicateTripAction, quoteAction, requestBookingAction, shareTripAction, updateTripAction } from "@/app/actions/studio";
import { BOOKING_STATUS_LABEL, TRIP_STATUS_LABEL, isTripEditable, type BookingStatus } from "@/domain/states";
import { POLICY_SUMMARY } from "@/domain/cancellation";
import { estimateTravelMinutes } from "@/domain/geo";
import { formatMoney } from "@/lib/money";
import { daysBetween, formatDate, formatDuration, formatTime, toZoned } from "@/lib/time";
import { appUrl } from "@/config/brand";

export const metadata: Metadata = { title: "Journey Studio", robots: { index: false } };

type Params = Promise<{ tripId: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function PlannerPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Container className="py-10"><PageSkeleton /></Container>}>
      <Planner params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Planner({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { tripId } = await params;
  const sp = await searchParams;
  const session = await requireSession(`/studio/${tripId}`);
  const db = await requestDb();
  const view = await getStudioView(db, session.actor, tripId);
  const { trip } = view;
  const editable = isTripEditable(trip.status);
  const party = trip.adults + trip.children;

  const [destinations, categories, alternatives] = await Promise.all([listAllDestinationsBrief(db), listCategories(db), alternativeSlots(db, tripId)]);
  const destById = new Map(destinations.map((d) => [d.id, d]));
  const tripDestSlugs = [...new Set([view.primaryDestination?.slug, ...view.days.map((d) => (d.destinationId ? destById.get(d.destinationId)?.slug : undefined))].filter(Boolean) as string[])];
  const catalogue = await studioCatalogue(db, trip, tripDestSlugs, { tab: one(sp.tab), q: one(sp.q), destination: one(sp.dest), category: one(sp.cat) });

  const tz = view.primaryDestination?.timezone ?? "Africa/Nairobi";
  const dayByDate = new Map(view.days.map((d) => [d.date, d]));
  const lineByKey = new Map(view.estimate?.lines.map((l) => [l.key, l]) ?? []);
  const issuesByItem = new Map<string, typeof view.issues>();
  for (const i of view.issues) if (i.itemId) issuesByItem.set(i.itemId, [...(issuesByItem.get(i.itemId) ?? []), i]);
  const errorCount = view.issues.filter((i) => i.severity === "error").length;
  const warningCount = view.issues.filter((i) => i.severity === "warning").length;

  const plannerDays: PlannerDay[] = view.days.map((d) => {
    const items = view.items.filter((i) => i.dayId === d.id);
    const timed = items.filter((i) => i.startsAt).sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime());
    const notes = items.filter((i) => !i.startsAt).sort((a, b) => a.position - b.position);
    let prevExp: (typeof items)[number] | null = null;
    return {
      id: d.id,
      dayNumber: d.dayNumber,
      date: d.date,
      dateLabel: formatDate(d.date, { weekday: "long", day: "numeric", month: "long", year: undefined }),
      destinationId: d.destinationId,
      destinationName: d.destinationId ? destById.get(d.destinationId)?.name ?? null : null,
      notes: d.notes,
      items: [...timed, ...notes].map((i) => {
        let travel: string | null = null;
        if (i.kind === "experience") {
          if (prevExp?.location && i.location && prevExp.endsAt && i.startsAt) {
            const mins = estimateTravelMinutes(prevExp.location, i.location);
            const gap = Math.round((i.startsAt.getTime() - prevExp.endsAt.getTime()) / 60_000);
            travel = mins === 0 ? `Same area · ${gap} min between activities` : `≈ ${formatDuration(mins)} travel (estimate, not a verified route) · ${gap >= 0 ? `${formatDuration(Math.max(gap, 0))} gap` : "overlaps"}`;
          }
          prevExp = i;
        }
        const line = lineByKey.get(i.id);
        const remaining = i.slot ? i.slot.capacity - i.slot.reserved : null;
        return {
          id: i.id,
          kind: i.kind,
          title: i.title,
          notes: i.notes,
          timeLabel: i.startsAt && i.endsAt ? `${formatTime(i.startsAt, i.timezone)}–${formatTime(i.endsAt, i.timezone)}` : null,
          startTime: i.startsAt ? formatTime(i.startsAt, i.timezone) : null,
          durationLabel: i.startsAt && i.endsAt ? formatDuration(Math.round((i.endsAt.getTime() - i.startsAt.getTime()) / 60_000)) : null,
          providerName: i.providerName,
          providerSlug: i.providerSlug,
          experienceSlug: i.experience?.slug ?? null,
          meetingPoint: i.experience?.meetingPoint ?? null,
          inclusions: i.experience?.inclusions ?? [],
          exclusions: i.experience?.exclusions ?? [],
          preparationNotes: i.experience?.preparationNotes ?? null,
          cancellationLabel: i.cancellationPolicy ? `${i.cancellationPolicy[0].toUpperCase()}${i.cancellationPolicy.slice(1)} — ${POLICY_SUMMARY[i.cancellationPolicy]}` : null,
          priceLabel: line ? `${line.quantityLabel}${line.discountMinor ? ` · −${formatMoney(line.discountMinor)}` : ""}` : null,
          lineTotal: line ? formatMoney(line.totalMinor) : null,
          capacityLabel: remaining === null ? null : i.pricing?.pricingModel === "per_group" ? (remaining > 0 ? "Open for your group" : "Fully booked") : `${remaining} place${remaining === 1 ? "" : "s"} left`,
          alternatives: (alternatives[i.id] ?? []).map((a) => ({ id: a.id, label: `${formatTime(a.startsAt, i.timezone)}–${formatTime(a.endsAt, i.timezone)}` })),
          currentSlotId: i.slot?.id ?? null,
          issues: (issuesByItem.get(i.id) ?? []).map((x) => ({ severity: x.severity, message: x.message })),
          travelFromPrevious: travel,
          bookingStatus: view.itemBookingStatus[i.id] ?? null,
          compareHref: i.experience ? `/studio/${tripId}?tab=experiences&cat=${encodeURIComponent(categories.find((c) => c.id === i.experience!.categoryId)?.slug ?? "")}#catalogue` : null,
        };
      }),
    };
  });

  const dayNumberFor = (d: Date) => dayByDate.get(toZoned(d, tz).date)?.dayNumber ?? null;
  const toPanel = (e: (typeof catalogue.experiences)[number]): PanelExperience => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    destinationName: e.destination.name,
    categoryName: e.category.name,
    durationLabel: formatDuration(e.durationMinutes),
    priceLabel: `${formatMoney(e.basePriceMinor)}${e.pricingModel === "per_group" ? "/group" : "/pp"}`,
    isDemo: e.isDemo,
    perGroup: e.pricingModel === "per_group",
    maxGroupSize: e.maxGroupSize,
    slots: e.slots.map((s) => ({ id: s.id, label: formatTime(s.startsAt, tz), dayNumber: dayNumberFor(s.startsAt), remaining: s.remaining })),
  });

  const markers: MapMarker[] = [];
  let order = 0;
  for (const d of plannerDays) {
    for (const i of view.items.filter((x) => x.dayId === d.id && x.kind === "experience" && x.location).sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime())) {
      markers.push({ lat: i.location!.lat, lng: i.location!.lng, label: `Day ${d.dayNumber}: ${i.title}`, kind: "experience", order: ++order, href: i.experience ? `/experiences/${i.experience.slug}` : undefined });
    }
  }
  if (!markers.length && view.primaryDestination) markers.push({ lat: view.primaryDestination.latitude, lng: view.primaryDestination.longitude, label: view.primaryDestination.name });

  const nights = daysBetween(trip.start_date, trip.end_date);
  const estimateTotal = view.estimate?.totalMinor ?? 0;
  const budget = trip.budget_minor;
  const quoteValid = view.latestQuote?.validUntil && view.latestQuote.validUntil > new Date();
  const activeBooking = view.bookings.find((b) => !["cancelled", "expired", "provider_declined"].includes(b.status));
  const shareUrl = trip.share_token ? `${appUrl()}/trips/shared/${trip.share_token}` : null;

  return (
    <div className="bg-sand">
      <div className="border-b border-sand-300/70 bg-white">
        <Container className="py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={trip.status === "confirmed" ? "success" : trip.status === "quoted" ? "gold" : trip.status === "pending_booking" ? "info" : "neutral"}>{TRIP_STATUS_LABEL[trip.status]}</Badge>
                {trip.status === "draft" && <span className="text-xs text-ink-subtle">Drafts are not bookings — nothing is reserved yet.</span>}
              </div>
              <h1 className="mt-2 text-3xl font-bold text-forest">{trip.title}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden className="h-4 w-4" />{formatDate(trip.start_date)} – {formatDate(trip.end_date)} ({nights + 1} days)</span>
                <span className="inline-flex items-center gap-1"><Users aria-hidden className="h-4 w-4" />{trip.adults} adult{trip.adults === 1 ? "" : "s"}{trip.children ? `, ${trip.children} child${trip.children === 1 ? "" : "ren"}` : ""}</span>
                {view.primaryDestination && <span>Based around {view.primaryDestination.name}</span>}
                <span className="capitalize">{trip.pace} pace · {trip.tour_type}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <ActionButton action={duplicateTripAction.bind(null, tripId)} pendingLabel="Copying…"><Copy aria-hidden className="h-4 w-4" />Duplicate</ActionButton>
              <ActionButton action={shareTripAction.bind(null, tripId, !trip.share_token)}><Link2 aria-hidden className="h-4 w-4" />{trip.share_token ? "Stop sharing" : "Share read-only link"}</ActionButton>
              {(trip.status === "draft" || trip.status === "quoted" || trip.status === "completed") && (
                <ActionButton action={archiveTripAction.bind(null, tripId)} variant="ghost" confirm="Archive this trip?">Archive</ActionButton>
              )}
            </div>
          </div>
          {shareUrl && (
            <p className="mt-3 rounded-xl bg-forest-50 px-3 py-2 text-xs text-forest">
              Anyone with this link can view (not edit) your plan, without your personal notes: <span className="break-all font-mono">{shareUrl}</span>
            </p>
          )}
          {editable && (
            <details className="mt-4 rounded-2xl border border-sand-300 bg-sand/40 p-4">
              <summary className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-forest"><Pencil aria-hidden className="h-4 w-4" />Edit trip details, dates and travellers</summary>
              <div className="mt-4">
                <TripForm
                  action={updateTripAction.bind(null, tripId)}
                  destinations={destinations}
                  minDate={toZoned(new Date(), "Africa/Nairobi").date}
                  submitLabel="Save changes"
                  defaults={{
                    title: trip.title,
                    primaryDestinationId: trip.primary_destination_id,
                    startDate: trip.start_date,
                    endDate: trip.end_date,
                    adults: trip.adults,
                    children: trip.children,
                    budgetMajor: trip.budget_minor !== null ? trip.budget_minor / 100 : null,
                    interests: trip.interests,
                    pace: trip.pace,
                    tourType: trip.tour_type,
                    languages: trip.languages,
                    accessibilityNotes: trip.accessibility_notes,
                    dietaryNotes: trip.dietary_notes,
                    accommodationNotes: trip.accommodation_notes,
                    transportNotes: trip.transport_notes,
                  }}
                />
              </div>
            </details>
          )}
        </Container>
      </div>

      <nav aria-label="Planner sections" className="sticky top-16 z-30 border-b border-sand-300/70 bg-sand/95 backdrop-blur lg:hidden">
        <Container className="flex gap-1 py-2 text-sm font-semibold">
          {[["#timeline", "Itinerary"], ["#catalogue", "Add"], ["#summary", "Map & price"]].map(([href, label]) => (
            <a key={href} href={href} className="flex-1 rounded-full py-2 text-center text-forest hover:bg-forest-50">{label}</a>
          ))}
        </Container>
      </nav>

      <Container className="grid gap-6 py-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside id="catalogue" aria-label="Catalogue" className="order-2 scroll-mt-32 lg:order-1 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pr-1">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-muted">Add to your days</h2>
          <CataloguePanel
            tripId={tripId}
            editable={editable}
            tab={catalogue.tab}
            experiences={catalogue.experiences.map(toPanel)}
            suggestions={catalogue.suggestions.map(toPanel)}
            guides={catalogue.guides.map((g) => ({
              id: g.id,
              slug: g.slug,
              name: g.name,
              headline: g.headline,
              languages: g.languages,
              verified: g.verified,
              isDemo: g.isDemo,
              services: g.services.map((s) => ({ id: s.id, title: s.title, durationLabel: formatDuration(s.durationMinutes), priceLabel: `${formatMoney(s.basePriceMinor)}${s.pricingModel === "per_group" ? "/group" : "/pp"}`, maxGroupSize: s.maxGroupSize })),
            }))}
            days={plannerDays.map((d) => ({ id: d.id, dayNumber: d.dayNumber, label: `Day ${d.dayNumber} · ${formatDate(d.date, { weekday: "short", day: "numeric", month: "short", year: undefined })}` }))}
            party={party}
            filters={{ q: one(sp.q), destination: one(sp.dest), category: one(sp.cat) }}
            destinations={destinations.map((d) => ({ slug: d.slug, name: d.name }))}
            categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
          />
        </aside>

        <section id="timeline" aria-label="Itinerary timeline" className="order-1 scroll-mt-32 lg:order-2">
          {!editable && (
            <Alert tone="info" className="mb-4" title="Itinerary locked">
              This itinerary has a booking in progress, so changes go through a change request on the booking.
              {activeBooking && <> <Link href={`/dashboard/bookings/${activeBooking.id}`} className="font-semibold underline">Open booking {activeBooking.reference}</Link></>}
            </Alert>
          )}
          <Timeline tripId={tripId} days={plannerDays} editable={editable} destinations={destinations.map((d) => ({ id: d.id, name: d.name }))} />
        </section>

        <aside id="summary" aria-label="Map and price" className="order-3 space-y-5 scroll-mt-32 lg:col-span-2 xl:sticky xl:top-24 xl:col-span-1 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto">
          <TripMap markers={markers} connect className="h-64" ariaLabel="Map of planned stops" />

          <Card className="p-5">
            <h2 className="text-lg font-bold text-forest">Price estimate</h2>
            {view.estimateError ? (
              <Alert tone="error" className="mt-3">{view.estimateError}</Alert>
            ) : view.estimate && view.estimate.lines.length ? (
              <>
                <ul className="mt-3 space-y-2 text-sm">
                  {view.estimate.lines.map((l) => (
                    <li key={l.key} className="flex justify-between gap-3">
                      <span className="min-w-0">
                        <span className="line-clamp-1">{l.title}</span>
                        <span className="text-xs text-ink-subtle">{formatMoney(l.unitPriceMinor)} {l.quantityLabel}</span>
                      </span>
                      <span className="shrink-0 font-medium">{formatMoney(l.grossMinor)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-4 space-y-1.5 border-t border-sand-200 pt-3 text-sm">
                  {view.estimate.discountMinor > 0 && <div className="flex justify-between text-[#1d5b39]"><dt>Group discounts</dt><dd>−{formatMoney(view.estimate.discountMinor)}</dd></div>}
                  <div className="flex justify-between"><dt>Service fee ({view.estimate.serviceFeeBps / 100}%)</dt><dd>{formatMoney(view.estimate.serviceFeeMinor)}</dd></div>
                  {view.estimate.taxBps > 0 && <div className="flex justify-between"><dt>Tax ({view.estimate.taxBps / 100}%)</dt><dd>{formatMoney(view.estimate.taxMinor)}</dd></div>}
                  <div className="flex justify-between border-t border-sand-200 pt-2 text-base font-semibold text-forest"><dt>Estimated total</dt><dd>{formatMoney(estimateTotal)}</dd></div>
                </dl>
                <p className="mt-2 text-xs text-ink-subtle">Calculated on our servers from current catalogue prices. Park fees and items marked “not included” are extra.</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">Add experiences or a guide to see your price.</p>
            )}
            {budget !== null && (
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs font-semibold">
                  <span>Budget {formatMoney(budget)}</span>
                  <span className={estimateTotal > budget ? "text-terracotta-700" : "text-[#1d5b39]"}>
                    {estimateTotal > budget ? `${formatMoney(estimateTotal - budget)} over` : `${formatMoney(budget - estimateTotal)} left`}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-sand-200" role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={Math.min(estimateTotal, budget)} aria-label="Spend against budget">
                  <div className={cn("h-full rounded-full", estimateTotal > budget ? "bg-terracotta" : "bg-forest")} style={{ width: `${Math.min(100, budget ? (estimateTotal / budget) * 100 : 0)}%` }} />
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-bold text-forest">Booking</h2>
            {(errorCount > 0 || warningCount > 0) && editable && (
              <p className={cn("mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm", errorCount ? "bg-[#fdf0ed] text-[#8f2a17]" : "bg-gold-100 text-[#6b4e0b]")}>
                <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                {errorCount ? `${errorCount} issue${errorCount === 1 ? "" : "s"} must be fixed before booking.` : `${warningCount} warning${warningCount === 1 ? "" : "s"} to review.`}
              </p>
            )}
            {trip.status === "draft" && (
              <div className="mt-4 space-y-2">
                <ActionButton action={quoteAction.bind(null, tripId)} variant="primary" size="md" className="w-full" disabled={errorCount > 0 || !view.estimate?.lines.length} pendingLabel="Checking availability…" showSuccess>
                  Get a confirmed quote
                </ActionButton>
                <p className="text-xs text-ink-subtle">We re-check every time slot and guide calendar and lock the price for a short time.</p>
              </div>
            )}
            {trip.status === "quoted" && view.latestQuote && (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-forest-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-forest">Quote v{view.latestQuote.version}</p>
                  <p className="font-display text-2xl font-bold text-forest">{formatMoney(view.latestQuote.totalMinor)}</p>
                  <p className="text-xs text-ink-muted">{quoteValid ? `Valid until ${formatTime(view.latestQuote.validUntil!)} today (${tz.replace("_", " ")})` : "Expired — refresh to continue"}</p>
                </div>
                {quoteValid ? (
                  <>
                    <ActionButton action={requestBookingAction.bind(null, tripId, view.latestQuote.id, randomUUID())} variant="gold" size="md" className="w-full" pendingLabel="Sending request…">
                      Request booking
                    </ActionButton>
                    <p className="text-xs text-ink-subtle">Providers confirm first. You&apos;ll pay only after everyone accepts.</p>
                  </>
                ) : (
                  <ActionButton action={quoteAction.bind(null, tripId)} variant="primary" size="md" className="w-full" pendingLabel="Refreshing…">Refresh quote</ActionButton>
                )}
              </div>
            )}
            {view.bookings.length > 0 && (
              <ul className="mt-4 space-y-2">
                {view.bookings.map((b) => (
                  <li key={b.id}>
                    <Link href={`/dashboard/bookings/${b.id}`} className="flex items-center justify-between rounded-xl border border-sand-300 px-3 py-2 text-sm hover:bg-sand">
                      <span><span className="font-mono text-xs">{b.reference}</span> · {BOOKING_STATUS_LABEL[b.status as BookingStatus]}</span>
                      <span className="font-semibold">{formatMoney(b.totalMinor)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {!editable && !activeBooking && trip.status !== "draft" && <LinkButton href="/dashboard" variant="secondary" className="mt-4 w-full">Back to dashboard</LinkButton>}
          </Card>
        </aside>
      </Container>
    </div>
  );
}
