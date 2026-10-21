import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, BadgeCheck, CalendarCheck2, HandCoins, MessagesSquare, Route, ShieldCheck, Users } from "lucide-react";
import { DestinationArt } from "@/components/art/destination-art";
import { DestinationCardView, ExperienceCardView, GuideCardView } from "@/components/catalogue/cards";
import { SearchBar } from "@/components/catalogue/search-bar";
import { CardGridSkeleton, Container, LinkButton, SectionHeading, Skeleton, Badge } from "@/components/ui";
import { cachedCategories, cachedDestinationsBrief, cachedFeaturedDestinations } from "@/server/cached";
import { requestDb } from "@/server/auth/session";
import { listExperiences, listGuides, listReviews } from "@/server/services/catalogue";
import { journeys } from "@/content/journeys";
import { brand } from "@/config/brand";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Container className="relative z-10 -mt-14 sm:-mt-16">
        <Suspense fallback={<Skeleton className="h-[76px] rounded-[1.5rem]" />}>
          <HeroSearch />
        </Suspense>
      </Container>

      <section className="py-20" aria-labelledby="featured-destinations">
        <Container>
          <SectionHeading
            eyebrow="Destinations"
            title="From the Mara's plains to the Swahili coast"
            description="Start with a place, then shape the days around it. Every destination shows real listings and the guides who work there."
            action={<LinkButton href="/destinations" variant="secondary">All destinations <ArrowRight aria-hidden className="h-4 w-4" /></LinkButton>}
          />
          <Suspense fallback={<CardGridSkeleton count={6} />}>
            <FeaturedDestinations />
          </Suspense>
        </Container>
      </section>

      <StudioIntro />

      <section className="py-20" aria-labelledby="featured-experiences">
        <Container>
          <SectionHeading eyebrow="Experiences" title="Things worth getting up early for" description="Small-group and private experiences from local providers, bookable on dates with real availability." action={<LinkButton href="/experiences" variant="secondary">Browse experiences <ArrowRight aria-hidden className="h-4 w-4" /></LinkButton>} />
          <Suspense fallback={<CardGridSkeleton count={6} />}>
            <FeaturedExperiences />
          </Suspense>
        </Container>
      </section>

      <section className="bg-white py-20" aria-labelledby="guides">
        <Container>
          <SectionHeading eyebrow="Choose your guide" title="The person beside you matters most" description="Compare guides by language, region and specialty, check their calendar, and pick the one who fits your trip." action={<LinkButton href="/guides" variant="secondary">Find a guide <ArrowRight aria-hidden className="h-4 w-4" /></LinkButton>} />
          <Suspense fallback={<CardGridSkeleton count={4} className="lg:grid-cols-4" />}>
            <FeaturedGuides />
          </Suspense>
        </Container>
      </section>

      <section className="py-20" aria-labelledby="journeys">
        <Container>
          <SectionHeading eyebrow="Curated journeys" title="Start from a route, make it yours" description="Editorial day-by-day ideas you can open in Journey Studio and adjust — every booking still checks live availability." action={<LinkButton href="/journeys" variant="secondary">All journeys <ArrowRight aria-hidden className="h-4 w-4" /></LinkButton>} />
          <div className="grid gap-6 md:grid-cols-2">
            {journeys.slice(0, 4).map((j) => (
              <Link key={j.slug} href={`/journeys/${j.slug}`} className="group grid overflow-hidden rounded-[var(--radius-card)] border border-sand-300/70 bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)] sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="aspect-[4/3] sm:aspect-auto">
                  <DestinationArt variant={j.art} seed={j.slug} />
                </div>
                <div className="flex flex-col p-6">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-terracotta-700">{j.length} days · {j.pace}</p>
                  <h3 className="mt-2 text-xl font-bold text-forest">{j.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{j.summary}</p>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                    {j.bestFor.map((b) => (
                      <Badge key={b} tone="forest">{b}</Badge>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      <TrustSection />

      <Suspense fallback={null}>
        <RecentReviews />
      </Suspense>

      <section className="py-20">
        <Container>
          <div className="relative overflow-hidden rounded-[2rem] bg-forest px-6 py-14 text-center sm:px-14">
            <div className="absolute inset-0 opacity-25">
              <DestinationArt variant="savanna" seed="cta" />
            </div>
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-balance text-3xl font-bold text-sand sm:text-4xl">{brand.tagline}</h2>
              <p className="mt-4 text-sand/80">Sketch your trip in minutes. Nothing is charged until your providers accept and you choose to pay.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <LinkButton href="/studio" variant="gold" size="lg">Open Journey Studio</LinkButton>
                <LinkButton href="/register?type=guide" variant="outlineLight" size="lg">I&apos;m a guide</LinkButton>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-forest-950">
      <div className="absolute inset-0 -z-10 opacity-90">
        <DestinationArt variant="savanna" seed="hero-mara" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-forest-950/90 via-forest-950/55 to-transparent" />
      <Container className="pb-32 pt-20 sm:pb-40 sm:pt-28">
        <div className="max-w-2xl animate-fade-up">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-sand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold ring-1 ring-sand/20">
            Kenya, planned your way
          </p>
          <h1 className="text-balance text-5xl leading-[1.02] text-sand sm:text-7xl">
            Your journey, with <span className="text-gold">a guide you chose.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-sand/85">
            Build your trip day by day, compare local guides and experiences on the dates you&apos;re actually travelling, and book it all with transparent prices.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/studio" variant="gold" size="lg">Plan your trip</LinkButton>
            <LinkButton href="/guides" variant="outlineLight" size="lg">Meet the guides</LinkButton>
          </div>
        </div>
      </Container>
    </section>
  );
}

async function HeroSearch() {
  await requestDb();
  const [destinations, categories] = await Promise.all([cachedDestinationsBrief(), cachedCategories()]);
  return <SearchBar destinations={destinations} categories={categories} />;
}

async function FeaturedDestinations() {
  await requestDb();
  const items = await cachedFeaturedDestinations(6);
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((d) => (
        <DestinationCardView key={d.id} d={d} />
      ))}
    </div>
  );
}

async function FeaturedExperiences() {
  const db = await requestDb();
  const { items } = await listExperiences(db, { pageSize: 6 });
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((e) => (
        <ExperienceCardView key={e.id} e={e} />
      ))}
    </div>
  );
}

async function FeaturedGuides() {
  const db = await requestDb();
  const { items } = await listGuides(db, {});
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {items.slice(0, 4).map((g) => (
        <GuideCardView key={g.id} g={g} />
      ))}
    </div>
  );
}

async function RecentReviews() {
  const db = await requestDb();
  const reviews = await listReviews(db, {}, 3);
  // Only genuine reviews from completed bookings exist in the system; show nothing otherwise.
  if (!reviews.length) return null;
  return (
    <section className="py-20" aria-labelledby="reviews">
      <Container>
        <SectionHeading eyebrow="From travellers" title="Reviews from completed trips" description="Only travellers who completed a booking can leave a review." />
        <div className="grid gap-6 md:grid-cols-3">
          {reviews.map((r) => (
            <figure key={r.id} className="rounded-[var(--radius-card)] border border-sand-300/70 bg-white p-6">
              <p aria-label={`${r.rating} out of 5`} className="text-gold">{"★".repeat(r.rating)}<span className="text-sand-300">{"★".repeat(5 - r.rating)}</span></p>
              <blockquote className="mt-3 text-sm leading-relaxed text-charcoal">“{r.body}”</blockquote>
              <figcaption className="mt-4 text-xs text-ink-subtle">{r.reviewerName}{r.experienceTitle ? ` · ${r.experienceTitle}` : ""}</figcaption>
            </figure>
          ))}
        </div>
      </Container>
    </section>
  );
}

function StudioIntro() {
  const days = [
    { day: "Day 1", place: "Lake Naivasha", items: [{ t: "08:00", title: "Boat ride", tag: "Experience" }, { t: "08:00–16:00", title: "Private guide", tag: "Guide" }] },
    { day: "Day 2", place: "Hell's Gate", items: [{ t: "08:00", title: "Cycle & gorge walk", tag: "Experience" }] },
    { day: "Day 3", place: "Maasai Mara", items: [{ t: "15:00", title: "Afternoon game drive", tag: "Experience" }] },
  ];
  return (
    <section className="relative overflow-hidden bg-forest py-20 text-sand" aria-labelledby="studio-intro">
      <Container className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-gold">Journey Studio</p>
          <h2 id="studio-intro" className="text-balance text-3xl font-bold sm:text-[2.6rem] sm:leading-[1.1]">Plan every day on one canvas</h2>
          <p className="mt-4 max-w-lg leading-relaxed text-sand/80">
            Drop experiences onto days, add your guide, and see the map, timings and price update as you go. We check overlaps, travel buffers and live availability before anything is booked.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              { Icon: Route, text: "Day-by-day timeline with travel-time estimates between stops" },
              { Icon: CalendarCheck2, text: "Live availability for guides and experience time slots" },
              { Icon: HandCoins, text: "Server-calculated price breakdown against your budget" },
            ].map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="rounded-full bg-gold/15 p-2 text-gold"><Icon aria-hidden className="h-4 w-4" /></span>
                <span className="pt-1 text-sm text-sand/90">{text}</span>
              </li>
            ))}
          </ul>
          <LinkButton href="/studio" variant="gold" size="lg" className="mt-8">Start planning</LinkButton>
        </div>
        <div aria-hidden className="relative rounded-[1.75rem] glass p-4 shadow-2xl sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-display text-lg">Rift Valley & Mara</p>
            <span className="rounded-full bg-gold px-3 py-1 text-xs font-bold text-forest-950">Illustration</span>
          </div>
          <div className="space-y-3">
            {days.map((d) => (
              <div key={d.day} className="rounded-2xl bg-sand/95 p-4 text-charcoal">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-ink-subtle">
                  <span className="text-forest">{d.day}</span>
                  <span>{d.place}</span>
                </div>
                <div className="space-y-2">
                  {d.items.map((it) => (
                    <div key={it.title} className="flex items-center gap-3 rounded-xl border border-sand-300 bg-white px-3 py-2.5">
                      <span className="w-20 text-xs font-semibold text-forest">{it.t}</span>
                      <span className="flex-1 text-sm font-semibold">{it.title}</span>
                      <span className="rounded-full bg-forest-100 px-2 py-0.5 text-[11px] font-semibold text-forest">{it.tag}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

function TrustSection() {
  const points = [
    { Icon: BadgeCheck, title: "Verified means checked", text: "A guide is only marked verified after our team checks their identity and a professional credential. Unverified profiles are clearly labelled." },
    { Icon: ShieldCheck, title: "Pay only after acceptance", text: "Providers confirm your request first. Payment is verified with the payment provider before a booking is confirmed." },
    { Icon: MessagesSquare, title: "Talk on the platform", text: "Message your guides and providers from your booking, so details and changes are kept together." },
    { Icon: Users, title: "Reviews from real trips", text: "Only travellers with a completed booking can review it — one review per booked experience." },
  ];
  return (
    <section className="bg-white py-20" aria-labelledby="trust">
      <Container>
        <SectionHeading eyebrow="Safety & trust" title="Built so you can book with confidence" action={<LinkButton href="/safety" variant="secondary">How we keep trips safe</LinkButton>} />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {points.map(({ Icon, title, text }) => (
            <div key={title} className="rounded-[var(--radius-card)] bg-sand p-6">
              <Icon aria-hidden className="h-7 w-7 text-terracotta-700" />
              <h3 className="mt-4 text-lg font-bold text-forest">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{text}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
