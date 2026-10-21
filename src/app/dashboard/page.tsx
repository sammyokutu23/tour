import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, CalendarClock, Compass, Heart, MapPin, Plus, Receipt } from "lucide-react";
import { DestinationArt } from "@/components/art/destination-art";
import { Ring } from "@/components/dashboard/ring";
import { TripMap, type MapMarker } from "@/components/map/trip-map";
import { Alert, Badge, LinkButton, PageSkeleton, cn } from "@/components/ui";
import { requestDb, requireSession } from "@/server/auth/session";
import { listTripsForOwner, loadOwnedTrip, loadTripGraph, nextScheduledItem } from "@/server/services/trips";
import { listTravellerBookings } from "@/server/services/bookings";
import { listFavourites } from "@/server/services/community";
import { BOOKING_STATUS_LABEL, PAYMENT_STATUS_LABEL, TRIP_STATUS_LABEL } from "@/domain/states";
import { formatMoney } from "@/lib/money";
import { daysBetween, formatDate, formatTime, toZoned } from "@/lib/time";

export const metadata = { title: "Overview" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default function DashboardPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await requireSession("/dashboard");
  const db = await requestDb();
  const [trips, bookings, favourites] = await Promise.all([listTripsForOwner(db, session.actor), listTravellerBookings(db, session.actor), listFavourites(db, session.actor)]);
  const today = toZoned(new Date(), "Africa/Nairobi").date;

  const upcoming = trips.filter((t) => t.end_date >= today && !["cancelled", "archived", "completed"].includes(t.status));
  const next = upcoming.find((t) => ["confirmed", "in_progress", "pending_booking"].includes(t.status)) ?? upcoming[0] ?? null;
  const graph = next ? await loadTripGraph(db, await loadOwnedTrip(db, session.actor, next.id)) : null;
  const nextBooking = next ? bookings.find((b) => b.trip_id === next.id && !["cancelled", "expired", "provider_declined"].includes(b.status)) : undefined;

  const destinationsPlanned = new Set(trips.map((t) => t.destination_name).filter(Boolean)).size;
  const bookedDays = bookings
    .filter((b) => ["confirmed", "in_progress", "completed"].includes(b.status))
    .reduce((s, b) => s + daysBetween(b.start_date, b.end_date) + 1, 0);
  const readiness = graph ? graph.days.filter((d) => graph.items.some((i) => i.dayId === d.id && i.kind !== "note")).length / Math.max(graph.days.length, 1) : 0;

  const nextActivity = graph ? nextScheduledItem(graph) : undefined;
  const markers: MapMarker[] = (graph?.items ?? [])
    .filter((i) => i.kind === "experience" && i.location)
    .sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime())
    .map((i, idx) => ({ lat: i.location!.lat, lng: i.location!.lng, label: i.title, kind: "experience" as const, order: idx + 1 }));
  if (!markers.length && graph?.primaryDestination) markers.push({ lat: graph.primaryDestination.latitude, lng: graph.primaryDestination.longitude, label: graph.primaryDestination.name });

  const daysUntil = next ? daysBetween(today, next.start_date) : null;
  const firstName = session.displayName.split(" ")[0];

  return (
    <div className="space-y-6">
      {sp.denied && <Alert tone="warning">You don&apos;t have access to that area.</Alert>}
      <div className="relative overflow-hidden rounded-[2rem] bg-forest-950 p-4 shadow-[var(--shadow-lift)] sm:p-6">
        <div className="pointer-events-none absolute inset-0 opacity-35 blur-[2px]"><DestinationArt variant={next?.art_variant ?? "forest"} seed="dash-bg" /></div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-forest-950/70 via-forest-950/50 to-forest-950/80" />

        <div className="relative">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-sand/70">Habari, {firstName}</p>
              <h1 className="text-3xl font-bold text-sand">Your journeys</h1>
            </div>
            <LinkButton href="/studio/new" variant="gold" size="sm"><Plus aria-hidden className="h-4 w-4" />New trip</LinkButton>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            {/* Hero: next trip */}
            <section aria-label="Next trip" className="relative min-h-[360px] overflow-hidden rounded-[1.6rem] ring-1 ring-sand/15">
              <div className="absolute inset-0"><DestinationArt variant={next?.art_variant ?? "savanna"} seed={next?.id ?? "none"} /></div>
              <div className="absolute inset-0 bg-gradient-to-t from-forest-950/95 via-forest-950/35 to-forest-950/10" />
              <div className="relative flex h-full min-h-[360px] flex-col p-5 sm:p-7">
                {next ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-forest-950/50 px-3 py-1 text-xs font-semibold text-sand ring-1 ring-sand/25 backdrop-blur">
                        <MapPin aria-hidden className="h-3.5 w-3.5 text-gold" />{next.destination_name ?? "Kenya"}
                      </span>
                      <span className="rounded-full bg-gold px-3 py-1 text-xs font-bold text-forest-950">{TRIP_STATUS_LABEL[next.status]}</span>
                    </div>
                    {graph && graph.days.length > 1 && (
                      <ol aria-label="Days" className="mt-5 flex w-fit flex-col gap-2 rounded-2xl bg-forest-950/40 p-1.5 ring-1 ring-sand/15 backdrop-blur max-sm:hidden">
                        {graph.days.slice(0, 4).map((d) => {
                          const count = graph.items.filter((i) => i.dayId === d.id && i.kind !== "note").length;
                          return (
                            <li key={d.id} title={`Day ${d.dayNumber}: ${count} planned`} className="relative h-12 w-14 overflow-hidden rounded-xl ring-1 ring-sand/20">
                              <DestinationArt variant={next.art_variant ?? "savanna"} seed={d.id} />
                              <span className="absolute inset-0 flex items-center justify-center bg-forest-950/35 text-xs font-bold text-sand">D{d.dayNumber}</span>
                            </li>
                          );
                        })}
                        {graph.days.length > 4 && <li className="flex h-12 w-14 items-center justify-center rounded-xl bg-sand/85 text-sm font-bold text-forest">+{graph.days.length - 4}</li>}
                      </ol>
                    )}
                    <div className="mt-auto">
                      <h2 className="text-3xl font-bold text-sand sm:text-4xl">{next.title}</h2>
                      <p className="mt-2 max-w-lg text-sand/85">
                        {formatDate(next.start_date)} – {formatDate(next.end_date)} · {next.item_count} planned
                        {daysUntil !== null && daysUntil >= 0 ? ` · ${daysUntil === 0 ? "starts today" : `${daysUntil} day${daysUntil === 1 ? "" : "s"} to go`}` : ""}
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <LinkButton href={`/studio/${next.id}`} variant="light" size="sm">Open itinerary</LinkButton>
                        {nextBooking && <LinkButton href={`/dashboard/bookings/${nextBooking.id}`} variant="outlineLight" size="sm">Booking {nextBooking.reference}</LinkButton>}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mt-auto max-w-md">
                    <h2 className="text-3xl font-bold text-sand">No upcoming trips yet</h2>
                    <p className="mt-2 text-sand/80">Start with a destination or a curated route, then shape each day in Journey Studio.</p>
                    <div className="mt-5 flex gap-2">
                      <LinkButton href="/studio/new" variant="gold" size="sm">Plan a trip</LinkButton>
                      <LinkButton href="/journeys" variant="outlineLight" size="sm">Browse journeys</LinkButton>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <section aria-label="Next activity" className="rounded-[1.4rem] bg-[#ece7d3] p-5 text-charcoal">
                <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-forest"><CalendarClock aria-hidden className="h-4 w-4 text-terracotta-700" />Next up</p>
                {nextActivity ? (
                  <>
                    <p className="mt-3 font-display text-3xl font-bold text-forest">{formatTime(nextActivity.startsAt!, nextActivity.timezone)}</p>
                    <p className="text-xs text-ink-subtle">{formatDate(nextActivity.startsAt!, { weekday: "short", day: "numeric", month: "short", year: undefined }, nextActivity.timezone)}</p>
                    <p className="mt-2 line-clamp-2 font-semibold">{nextActivity.title}</p>
                    {nextActivity.experience?.meetingPoint && <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{nextActivity.experience.meetingPoint}</p>}
                  </>
                ) : (
                  <p className="mt-3 text-sm text-ink-muted">Nothing scheduled yet. Add experiences to your days to see them here.</p>
                )}
              </section>
              <section aria-label="Booking status" className="rounded-[1.4rem] bg-terracotta-100 p-5 text-charcoal">
                <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-terracotta-700"><Receipt aria-hidden className="h-4 w-4" />Booking</p>
                {nextBooking ? (
                  <>
                    <p className="mt-3 font-mono text-sm font-semibold">{nextBooking.reference}</p>
                    <p className="mt-1 font-display text-xl font-bold text-forest">{BOOKING_STATUS_LABEL[nextBooking.status]}</p>
                    <p className="text-xs text-ink-muted">{PAYMENT_STATUS_LABEL[nextBooking.payment_status]} · {formatMoney(nextBooking.total_minor, nextBooking.currency)}</p>
                    <Link href={`/dashboard/bookings/${nextBooking.id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-forest underline">Details <ArrowRight aria-hidden className="h-3.5 w-3.5" /></Link>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-ink-muted">{next ? "Not booked yet. Request a quote from your itinerary when you're ready." : "Your bookings will appear here."}</p>
                )}
              </section>
              <section aria-label="Trip map" className="glass overflow-hidden rounded-[1.4rem] p-2 sm:col-span-2">
                <p className="flex items-center gap-2 px-3 pb-2 pt-2 font-display text-lg text-sand"><Compass aria-hidden className="h-5 w-5 text-gold" />Where you&apos;re headed</p>
                {markers.length ? <TripMap markers={markers} connect className="h-56" ariaLabel="Map of your next trip" /> : <p className="px-3 pb-6 text-sm text-sand/70">Your stops will appear here once you plan a trip.</p>}
              </section>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <section aria-label="Saved" className="glass rounded-[1.4rem] p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-2 font-display text-lg text-sand"><Heart aria-hidden className="h-5 w-5 text-terracotta" />Saved for later</p>
                <Link href="/dashboard/saved" className="rounded-full px-3 py-1 text-xs font-semibold text-sand ring-1 ring-sand/30 hover:bg-sand/10">View all</Link>
              </div>
              {favourites.length ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {favourites.slice(0, 3).map((f) => (
                    <Link key={f.target_id} href={`/${f.target_type === "guide" ? "guides" : f.target_type === "destination" ? "destinations" : "experiences"}/${f.slug}`} className="group overflow-hidden rounded-2xl bg-sand/95">
                      <div className="h-20"><DestinationArt variant={f.target_type === "destination" ? "savanna" : f.target_type === "guide" ? "forest" : "lake"} seed={f.slug} /></div>
                      <div className="p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-terracotta-700">{f.target_type}</p>
                        <p className="line-clamp-1 text-sm font-semibold text-forest group-hover:underline">{f.name}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-sand/70">Tap “Save” on destinations, experiences and guides to keep them here.</p>
              )}
            </section>
            <section aria-label="Your stats" className="glass rounded-[1.4rem] p-5">
              <div className="grid grid-cols-3 gap-2">
                <Ring fraction={Math.min(1, trips.length / 5)} value={trips.length} label="Trips planned" />
                <Ring fraction={Math.min(1, destinationsPlanned / 12)} value={destinationsPlanned} label="Destinations" color="#D96C43" />
                <Ring fraction={Math.min(1, bookedDays / 30)} value={bookedDays} label="Days booked" color="#DFE9E4" />
              </div>
              {next && (
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-sm text-sand/85">
                    <span>Days with plans in your next trip</span>
                    <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-bold text-forest">{Math.round(readiness * 100)}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-sand/20" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(readiness * 100)} aria-label="Days with plans">
                    <div className="h-full rounded-full bg-[repeating-linear-gradient(135deg,#F6F1E8_0_6px,#DDD2BD_6px_12px)]" style={{ width: `${Math.round(readiness * 100)}%` }} />
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {upcoming.length > 1 && (
        <section>
          <h2 className="mb-3 text-xl font-bold text-forest">Other upcoming trips</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {upcoming.filter((t) => t.id !== next?.id).map((t) => (
              <Link key={t.id} href={`/studio/${t.id}`} className="flex items-center justify-between rounded-2xl border border-sand-300 bg-white px-4 py-3 hover:shadow-[var(--shadow-card)]">
                <span><span className="font-semibold text-forest">{t.title}</span><span className="block text-xs text-ink-subtle">{formatDate(t.start_date)} – {formatDate(t.end_date)}</span></span>
                <Badge tone={t.status === "draft" ? "neutral" : "gold"}>{TRIP_STATUS_LABEL[t.status]}</Badge>
              </Link>
            ))}
          </div>
        </section>
      )}
      <p className={cn("text-xs text-ink-subtle")}>All figures on this page come from your own trips and bookings.</p>
    </div>
  );
}
