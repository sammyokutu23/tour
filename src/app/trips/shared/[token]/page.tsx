import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { TripMap } from "@/components/map/trip-map";
import { Card, Container, LinkButton, PageSkeleton } from "@/components/ui";
import { requestDb } from "@/server/auth/session";
import { getSharedTrip } from "@/server/services/trips";
import { formatDate, formatTime } from "@/lib/time";

export const metadata: Metadata = { title: "Shared itinerary", robots: { index: false, follow: false }, referrer: "no-referrer" };
type Params = Promise<{ token: string }>;

export default function SharedTripPage({ params }: { params: Params }) {
  return (
    <Container className="max-w-4xl py-12">
      <Suspense fallback={<PageSkeleton />}>
        <Shared params={params} />
      </Suspense>
    </Container>
  );
}

async function Shared({ params }: { params: Params }) {
  const { token } = await params;
  const trip = await getSharedTrip(await requestDb(), token).catch(() => notFound());
  const markers = trip.days.flatMap((d) => d.items.filter((i) => i.location).map((i) => ({ lat: i.location!.lat, lng: i.location!.lng, label: i.title })));
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta-700">Shared itinerary · read-only</p>
        <h1 className="mt-2 text-4xl text-forest">{trip.title}</h1>
        <p className="mt-2 text-ink-muted">{formatDate(trip.startDate)} – {formatDate(trip.endDate)} · {trip.party} travellers{trip.destination ? ` · ${trip.destination.name}` : ""}</p>
      </div>
      {markers.length > 0 && <TripMap markers={markers.map((m, i) => ({ ...m, order: i + 1, kind: "experience" as const }))} connect className="h-72" ariaLabel="Map of shared itinerary" />}
      {trip.days.map((d) => (
        <Card key={d.dayNumber} className="p-5">
          <h2 className="text-lg font-bold text-forest">Day {d.dayNumber} · {formatDate(d.date, { weekday: "long", day: "numeric", month: "long", year: undefined })}</h2>
          {d.items.length ? (
            <ul className="mt-3 space-y-2">
              {d.items.map((i) => (
                <li key={i.id} className="flex gap-4 rounded-xl bg-sand px-3 py-2 text-sm">
                  <span className="w-28 shrink-0 font-semibold text-forest">{i.startsAt && i.endsAt ? `${formatTime(i.startsAt, i.timezone)}–${formatTime(i.endsAt, i.timezone)}` : "—"}</span>
                  <span>{i.experienceSlug ? <Link href={`/experiences/${i.experienceSlug}`} className="font-medium underline">{i.title}</Link> : i.title}{i.providerName && <span className="block text-xs text-ink-subtle">{i.providerName}</span>}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-ink-subtle">Free day</p>}
        </Card>
      ))}
      <p className="text-xs text-ink-subtle">A shared plan is not a booking. Availability and prices may change.</p>
      <LinkButton href="/studio/new">Plan your own trip</LinkButton>
    </div>
  );
}
