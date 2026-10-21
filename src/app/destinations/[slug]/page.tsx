import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarRange, Info, MapPin } from "lucide-react";
import { DestinationArt } from "@/components/art/destination-art";
import { ExperienceCardView, GuideCardView } from "@/components/catalogue/cards";
import { TripMap } from "@/components/map/trip-map";
import { Badge, Card, CardGridSkeleton, Container, EmptyState, LinkButton, PageSkeleton, SectionHeading } from "@/components/ui";
import { cachedDestination } from "@/server/cached";
import { getActor, requestDb } from "@/server/auth/session";
import { listExperiences, listGuides } from "@/server/services/catalogue";
import { track } from "@/server/services/analytics";
import { journeys } from "@/content/journeys";
import { FavouriteButton } from "@/components/catalogue/favourite-button";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  await requestDb();
  const d = await cachedDestination(slug);
  if (!d) return { title: "Destination not found" };
  return { title: d.name, description: d.summary, alternates: { canonical: `/destinations/${d.slug}` } };
}

export default function DestinationPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Container className="py-12"><PageSkeleton /></Container>}>
      <Destination params={params} />
    </Suspense>
  );
}

async function Destination({ params }: { params: Params }) {
  const { slug } = await params;
  const db = await requestDb();
  const d = await cachedDestination(slug);
  if (!d) notFound();
  const actor = await getActor();
  await track(db, "destination_viewed", { destination: d.slug }, actor?.userId ?? null);
  const related = journeys.filter((j) => j.days.some((x) => x.destination === d.slug));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristDestination",
    name: d.name,
    description: d.summary,
    geo: { "@type": "GeoCoordinates", latitude: d.latitude, longitude: d.longitude },
    containedInPlace: { "@type": "Country", name: "Kenya" },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <section className="relative isolate overflow-hidden bg-forest-950">
        <div className="absolute inset-0 -z-10">
          {d.gallery[0] ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin-managed licensed media
            <img src={d.gallery[0].url} alt={d.gallery[0].altText} className="h-full w-full object-cover" />
          ) : (
            <DestinationArt variant={d.artVariant} seed={d.slug} />
          )}
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-forest-950/90 via-forest-950/40 to-transparent" />
        <Container className="flex min-h-[420px] flex-col justify-end pb-12 pt-32">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-gold">
            <MapPin aria-hidden className="h-4 w-4" /> {d.region}{d.county ? ` · ${d.county} County` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <h1 className="max-w-3xl text-balance text-4xl font-bold text-sand sm:text-5xl">{d.name}</h1>
            <div className="flex gap-2">
              <FavouriteButton targetType="destination" targetId={d.id} tone="light" />
              <LinkButton href={`/studio/new?destination=${d.slug}`} variant="gold">Plan a trip here</LinkButton>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-lg text-sand/85">{d.summary}</p>
          {d.gallery[0] && <p className="mt-3 text-xs text-sand/60">Photo: {d.gallery[0].credit} ({d.gallery[0].license})</p>}
        </Container>
      </section>

      <Container className="grid gap-10 py-14 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-forest">About {d.name}</h2>
          <p className="leading-relaxed text-charcoal">{d.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {d.travelStyles.map((s) => <Badge key={s} tone="forest" className="capitalize">{s}</Badge>)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {d.bestTimeToVisit && (
              <Card className="p-5">
                <CalendarRange aria-hidden className="h-5 w-5 text-terracotta-700" />
                <p className="mt-3 font-semibold text-forest">When to go</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{d.bestTimeToVisit}</p>
              </Card>
            )}
            {d.travelInfo && (
              <Card className="p-5">
                <Info aria-hidden className="h-5 w-5 text-terracotta-700" />
                <p className="mt-3 font-semibold text-forest">Getting there</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{d.travelInfo}</p>
              </Card>
            )}
          </div>
          <p className="text-xs text-ink-subtle">Travel information is general guidance. Check park fees, entry rules and travel advisories with the relevant authorities before you travel.</p>
        </div>
        <TripMap markers={[{ lat: d.latitude, lng: d.longitude, label: d.name }]} className="h-80 lg:h-full lg:min-h-96" ariaLabel={`Map of ${d.name}`} zoom={9} />
      </Container>

      <section className="py-10">
        <Container>
          <SectionHeading eyebrow="Things to do" title={`Experiences in ${d.name}`} action={<LinkButton href={`/experiences?destination=${d.slug}`} variant="secondary">See all</LinkButton>} />
          <Suspense fallback={<CardGridSkeleton count={3} />}>
            <DestinationExperiences slug={d.slug} />
          </Suspense>
        </Container>
      </section>

      <section className="bg-white py-14">
        <Container>
          <SectionHeading eyebrow="Local guides" title={`Guides who work in ${d.name}`} action={<LinkButton href={`/guides?destination=${d.slug}`} variant="secondary">Compare guides</LinkButton>} />
          <Suspense fallback={<CardGridSkeleton count={3} />}>
            <DestinationGuides slug={d.slug} />
          </Suspense>
        </Container>
      </section>

      {related.length > 0 && (
        <section className="py-14">
          <Container>
            <SectionHeading eyebrow="Suggested itineraries" title="Journeys that include this place" />
            <div className="grid gap-4 md:grid-cols-2">
              {related.map((j) => (
                <Card key={j.slug} className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <p className="font-semibold text-forest">{j.title}</p>
                    <p className="text-sm text-ink-muted">{j.length} days · {j.summary}</p>
                  </div>
                  <LinkButton href={`/journeys/${j.slug}`} variant="secondary" size="sm">View</LinkButton>
                </Card>
              ))}
            </div>
          </Container>
        </section>
      )}
    </>
  );
}

async function DestinationExperiences({ slug }: { slug: string }) {
  const db = await requestDb();
  const { items } = await listExperiences(db, { destination: slug, pageSize: 6 });
  if (!items.length) return <EmptyState title="No experiences listed yet" description="Local providers haven't published experiences here yet. You can still plan the day with a guide." />;
  return <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{items.map((e) => <ExperienceCardView key={e.id} e={e} />)}</div>;
}

async function DestinationGuides({ slug }: { slug: string }) {
  const db = await requestDb();
  const { items } = await listGuides(db, { destination: slug });
  if (!items.length) return <EmptyState title="No guides here yet" description="We're still welcoming guides in this area." />;
  return <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{items.slice(0, 6).map((g) => <GuideCardView key={g.id} g={g} />)}</div>;
}
