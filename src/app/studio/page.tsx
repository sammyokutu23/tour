import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, Map, Plus, Wallet } from "lucide-react";
import { DestinationArt } from "@/components/art/destination-art";
import { Badge, Card, Container, LinkButton, PageHeader, Skeleton } from "@/components/ui";
import { getSession, requestDb } from "@/server/auth/session";
import { listTripsForOwner } from "@/server/services/trips";
import { TRIP_STATUS_LABEL } from "@/domain/states";
import { formatDate } from "@/lib/time";
import { journeys } from "@/content/journeys";

export const metadata: Metadata = {
  title: "Journey Studio — plan your Kenya trip day by day",
  description: "A visual itinerary builder: add experiences and guides to each day, check timings and availability, and see your price as you plan.",
  alternates: { canonical: "/studio" },
};

export default function StudioLanding() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-forest-950">
        <div className="absolute inset-0 -z-10 opacity-70"><DestinationArt variant="lake" seed="studio" /></div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-forest-950/95 to-forest-950/40" />
        <Container className="py-20">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Journey Studio</p>
          <h1 className="mt-3 max-w-2xl text-balance text-4xl font-bold text-sand sm:text-5xl">Your whole visit, one day at a time</h1>
          <p className="mt-4 max-w-xl text-lg text-sand/85">Pick your dates, add experiences and a guide to each day, and watch the map and price update. We validate timings and availability before you book.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/studio/new" variant="gold" size="lg"><Plus aria-hidden className="h-4 w-4" />Start a new trip</LinkButton>
            <LinkButton href="/journeys" variant="outlineLight" size="lg">Start from a curated journey</LinkButton>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {[
              { Icon: CalendarDays, t: "Day-by-day timeline", d: "Drag activities between days and see overlaps and tight transfers flagged." },
              { Icon: Map, t: "Map of every stop", d: "See where each day takes you, with travel times clearly marked as estimates." },
              { Icon: Wallet, t: "Live price breakdown", d: "Prices come from the catalogue on our servers and are compared with your budget." },
            ].map(({ Icon, t, d }) => (
              <div key={t} className="glass rounded-2xl p-5 text-sand">
                <Icon aria-hidden className="h-5 w-5 text-gold" />
                <p className="mt-3 font-semibold">{t}</p>
                <p className="mt-1 text-sm text-sand/75">{d}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>
      <Container className="py-14">
        <Suspense fallback={<Skeleton className="h-40" />}>
          <MyTrips />
        </Suspense>
        <div className="mt-14">
          <h2 className="mb-6 text-2xl font-bold text-forest">Or start from a route</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {journeys.map((j) => (
              <Link key={j.slug} href={`/studio/new?journey=${j.slug}`} className="group overflow-hidden rounded-2xl border border-sand-300/70 bg-white transition-shadow hover:shadow-[var(--shadow-lift)]">
                <div className="aspect-[16/9]"><DestinationArt variant={j.art} seed={j.slug} /></div>
                <div className="p-4">
                  <p className="text-xs font-semibold text-terracotta-700">{j.length} days</p>
                  <p className="font-semibold text-forest">{j.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </Container>
    </>
  );
}

async function MyTrips() {
  const session = await getSession();
  if (!session) return null;
  const trips = await listTripsForOwner(await requestDb(), session.actor);
  if (!trips.length) return null;
  return (
    <section>
      <PageHeader title="Your trips" />
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {trips.map((t) => (
          <Link key={t.id} href={`/studio/${t.id}`} className="block">
            <Card className="flex h-full gap-4 p-4 transition-shadow hover:shadow-[var(--shadow-lift)]">
              <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl"><DestinationArt variant={t.art_variant ?? "savanna"} seed={t.id} /></div>
              <div className="min-w-0">
                <Badge tone={t.status === "confirmed" ? "success" : t.status === "draft" ? "neutral" : "gold"}>{TRIP_STATUS_LABEL[t.status]}</Badge>
                <p className="mt-1 truncate font-semibold text-forest">{t.title}</p>
                <p className="text-xs text-ink-subtle">{formatDate(t.start_date)} – {formatDate(t.end_date)} · {t.item_count} planned</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
