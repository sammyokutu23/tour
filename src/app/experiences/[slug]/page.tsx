import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, Accessibility, Backpack, Check, Clock, MapPin, ShieldCheck, Users, X } from "lucide-react";
import { DestinationArt } from "@/components/art/destination-art";
import { GuideAvatar, Rating, VerificationBadge } from "@/components/catalogue/cards";
import { SlotPicker } from "@/components/catalogue/slot-picker";
import { FavouriteButton } from "@/components/catalogue/favourite-button";
import { TripMap } from "@/components/map/trip-map";
import { Alert, Badge, Card, Container, DemoBadge, PageSkeleton, Skeleton } from "@/components/ui";
import { getActor, getSession, requestDb } from "@/server/auth/session";
import { getExperience } from "@/server/services/catalogue";
import { listTripsForOwner } from "@/server/services/trips";
import { track } from "@/server/services/analytics";
import { POLICY_SUMMARY } from "@/domain/cancellation";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDuration } from "@/lib/time";

type Params = Promise<{ slug: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const e = await getExperience(await requestDb(), slug);
  if (!e) return { title: "Experience not found" };
  return { title: e.title, description: e.summary, alternates: { canonical: `/experiences/${e.slug}` } };
}

export default function ExperiencePage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Container className="py-12"><PageSkeleton /></Container>}>
      <Experience params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Experience({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { slug } = await params;
  const sp = await searchParams;
  const db = await requestDb();
  const e = await getExperience(db, slug);
  if (!e) notFound();
  const actor = await getActor();
  await track(db, "experience_viewed", { experience: e.slug }, actor?.userId ?? null);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: e.title,
    description: e.summary,
    provider: { "@type": "Organization", name: e.provider.name },
    offers: { "@type": "Offer", price: (e.basePriceMinor / 100).toFixed(0), priceCurrency: e.currency },
    ...(e.reviewCount > 0 && e.ratingAvg !== null ? { aggregateRating: { "@type": "AggregateRating", ratingValue: e.ratingAvg, reviewCount: e.reviewCount } } : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Container className="py-10">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-subtle">
          <Link href="/experiences" className="hover:text-forest hover:underline">Experiences</Link> /{" "}
          <Link href={`/destinations/${e.destination.slug}`} className="hover:text-forest hover:underline">{e.destination.name}</Link>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge tone="dark">{e.category.name}</Badge>
              {e.isDemo && <DemoBadge />}
            </div>
            <h1 className="text-balance text-3xl font-bold text-forest sm:text-5xl">{e.title}</h1>
            <p className="mt-3 text-lg text-ink-muted">{e.summary}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden className="h-4 w-4" />{e.destination.name}</span>
              <span className="inline-flex items-center gap-1.5"><Clock aria-hidden className="h-4 w-4" />{formatDuration(e.durationMinutes)}</span>
              <span className="inline-flex items-center gap-1.5"><Users aria-hidden className="h-4 w-4" />{e.pricingModel === "per_group" ? `Private group up to ${e.maxGroupSize}` : `Up to ${e.maxGroupSize} guests`}</span>
              <Rating avg={e.ratingAvg} count={e.reviewCount} />
            </div>
          </div>
          <FavouriteButton targetType="experience" targetId={e.id} />
        </div>
        {e.isDemo && (
          <Alert tone="warning" className="mt-6" title="This is a demo listing">
            The provider, schedule and price are fictional sample data for development. Bookings use the sandbox payment provider and no real money changes hands.
          </Alert>
        )}
      </Container>

      <Container className="pb-10">
        <div className="relative h-56 overflow-hidden rounded-[1.75rem] sm:h-72 lg:h-[380px]">
          {e.gallery[0] ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin-managed licensed media
            <img src={e.gallery[0].url} alt={e.gallery[0].altText} className="h-full w-full object-cover" />
          ) : (
            <DestinationArt variant={e.destination.artVariant} seed={e.slug} label={`Illustration of ${e.destination.name}`} />
          )}
          <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-forest-950/70 px-3 py-1.5 text-xs font-semibold text-sand backdrop-blur">{formatDuration(e.durationMinutes)}</span>
            <span className="rounded-full bg-forest-950/70 px-3 py-1.5 text-xs font-semibold text-sand backdrop-blur">{e.pricingModel === "per_group" ? "Private group" : "Small group"}</span>
          </div>
        </div>
      </Container>

      <Container className="grid gap-10 pb-16 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-10">

          <section>
            <h2 className="mb-3 text-2xl font-bold text-forest">What you&apos;ll do</h2>
            <p className="whitespace-pre-line leading-relaxed">{e.description}</p>
          </section>

          <section className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-3 font-bold text-forest">Included</h3>
              <ul className="space-y-2 text-sm">
                {e.inclusions.map((i) => <li key={i} className="flex gap-2"><Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-forest-600" />{i}</li>)}
                {!e.inclusions.length && <li className="text-ink-subtle">Not specified</li>}
              </ul>
            </div>
            <div>
              <h3 className="mb-3 font-bold text-forest">Not included</h3>
              <ul className="space-y-2 text-sm">
                {e.exclusions.map((i) => <li key={i} className="flex gap-2"><X aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-700" />{i}</li>)}
                {!e.exclusions.length && <li className="text-ink-subtle">Not specified</li>}
              </ul>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <MapPin aria-hidden className="h-5 w-5 text-terracotta-700" />
              <p className="mt-2 font-semibold text-forest">Meeting point</p>
              <p className="mt-1 text-sm text-ink-muted">{e.meetingPoint}</p>
            </Card>
            {e.preparationNotes && (
              <Card className="p-5">
                <Backpack aria-hidden className="h-5 w-5 text-terracotta-700" />
                <p className="mt-2 font-semibold text-forest">How to prepare</p>
                <p className="mt-1 text-sm text-ink-muted">{e.preparationNotes}</p>
              </Card>
            )}
            {e.accessibilityNotes && (
              <Card className="p-5">
                <Accessibility aria-hidden className="h-5 w-5 text-terracotta-700" />
                <p className="mt-2 font-semibold text-forest">Accessibility</p>
                <p className="mt-1 text-sm text-ink-muted">{e.accessibilityNotes}</p>
              </Card>
            )}
            {(e.restrictions || e.minAge !== null) && (
              <Card className="p-5">
                <AlertTriangle aria-hidden className="h-5 w-5 text-terracotta-700" />
                <p className="mt-2 font-semibold text-forest">Restrictions</p>
                <p className="mt-1 text-sm text-ink-muted">{[e.minAge !== null ? `Minimum age ${e.minAge}.` : null, e.restrictions].filter(Boolean).join(" ")}</p>
              </Card>
            )}
          </section>

          {e.meetingLat !== null && e.meetingLng !== null && (
            <TripMap markers={[{ lat: e.meetingLat, lng: e.meetingLng, label: `Meeting point: ${e.meetingPoint}`, kind: "meeting" }]} className="h-72" ariaLabel="Meeting point map" zoom={12} />
          )}

          <section>
            <h2 className="mb-4 text-2xl font-bold text-forest">Your provider</h2>
            <Card className="flex flex-wrap items-center gap-4 p-5">
              <GuideAvatar name={e.provider.name} photoUrl={null} className="h-14 w-14 text-lg" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-forest">{e.provider.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <VerificationBadge verified={e.provider.verified} isDemo={e.provider.isDemo} />
                  <Badge tone="neutral" className="capitalize">{e.provider.kind}</Badge>
                </div>
              </div>
              {e.provider.kind === "guide" && <Link href={`/guides/${e.provider.slug}`} className="text-sm font-semibold text-forest underline">View profile</Link>}
            </Card>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold text-forest">Reviews</h2>
            {e.reviews.length ? (
              <div className="space-y-4">
                {e.reviews.map((r) => (
                  <Card key={r.id} className="p-5">
                    <p aria-label={`${r.rating} out of 5`} className="text-gold">{"★".repeat(r.rating)}<span className="text-sand-300">{"★".repeat(5 - r.rating)}</span></p>
                    {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
                    <p className="mt-1 text-sm leading-relaxed">{r.body}</p>
                    <p className="mt-2 text-xs text-ink-subtle">{r.reviewerName} · {formatDate(r.createdAt)}</p>
                    {r.providerResponse && <p className="mt-3 rounded-xl bg-sand p-3 text-sm"><strong>Response from {e.provider.name}:</strong> {r.providerResponse}</p>}
                  </Card>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-white p-5 text-sm text-ink-muted">No reviews yet. Only travellers who complete this experience can review it.</p>
            )}
          </section>
        </div>

        <aside className="order-first min-w-0 lg:order-none lg:sticky lg:top-24 lg:h-fit">
          <Card className="p-6">
            <p className="text-sm text-ink-subtle">{e.pricingModel === "per_group" ? "Price per group" : "Price per person"}</p>
            <p className="font-display text-3xl font-bold text-forest">{formatMoney(e.basePriceMinor, e.currency)}</p>
            {e.childPriceMinor !== null && e.pricingModel === "per_person" && <p className="text-sm text-ink-muted">Children: {formatMoney(e.childPriceMinor, e.currency)}</p>}
            {e.groupDiscounts.map((g) => (
              <p key={g.minTravellers} className="mt-1 text-sm font-medium text-[#1d5b39]">{g.percentOffBps / 100}% off for groups of {g.minTravellers}+</p>
            ))}
            <p className="mt-2 text-xs text-ink-subtle">Final price, fees and availability are confirmed on the server when you request a quote.</p>
            <div className="mt-6">
              <Suspense fallback={<Skeleton className="h-56" />}>
                <Booker slots={e.slots.map((s) => ({ id: s.id, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), remaining: s.remaining }))} timezone={e.destinationTimezone} slug={e.slug} perGroup={e.pricingModel === "per_group"} initialDate={Array.isArray(sp.date) ? sp.date[0] : sp.date} />
              </Suspense>
            </div>
            <div className="mt-6 flex gap-3 rounded-xl bg-sand p-4 text-sm">
              <ShieldCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-forest" />
              <div>
                <p className="font-semibold capitalize text-forest">{e.cancellationPolicy} cancellation</p>
                <p className="text-ink-muted">{POLICY_SUMMARY[e.cancellationPolicy]}</p>
                <p className="mt-1 text-xs text-ink-subtle">Book at least {e.minNoticeHours} hours ahead.</p>
              </div>
            </div>
          </Card>
        </aside>
      </Container>
    </>
  );
}

async function Booker(props: { slots: { id: string; startsAt: string; endsAt: string; remaining: number }[]; timezone: string; slug: string; perGroup: boolean; initialDate?: string }) {
  const session = await getSession();
  const trips = session
    ? (await listTripsForOwner(await requestDb(), session.actor))
        .filter((t) => t.status === "draft" || t.status === "quoted")
        .map((t) => ({ id: t.id, title: t.title, startDate: t.start_date, endDate: t.end_date }))
    : [];
  return <SlotPicker {...props} trips={trips} signedIn={!!session} returnTo={`/experiences/${props.slug}`} />;
}
