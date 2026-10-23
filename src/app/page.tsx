import Link from "next/link";
import { Suspense } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import { SavannaSkyline } from "@/components/art/savanna-skyline";
import { DestinationCardView, ExperienceCardView, GuideCardView } from "@/components/catalogue/cards";
import { SearchBar } from "@/components/catalogue/search-bar";
import { CardGridSkeleton, Container, LinkButton, SectionHeading, Skeleton } from "@/components/ui";
import { cachedCategories, cachedDestinationsBrief, cachedFeaturedDestinations } from "@/server/cached";
import { requestDb } from "@/server/auth/session";
import { listExperiences, listGuides, listReviews } from "@/server/services/catalogue";
import { journeys } from "@/content/journeys";
import { FAQS } from "@/content/faqs";
import { brand } from "@/config/brand";

export default function HomePage() {
  return (
    <>
      <Hero />
      <SearchBand />

      <section id="destinations" className="scroll-mt-24 py-24" aria-labelledby="featured-destinations">
        <Container>
          <SectionHeading
            eyebrow="Destinations"
            title="From the Mara's plains to the Swahili coast."
            description="Start with a place, then shape the days around it. Every destination shows real listings and the guides who work there."
            action={<LinkButton href="/destinations" variant="gold">All destinations <ArrowRight aria-hidden className="h-4 w-4" /></LinkButton>}
          />
          <Suspense fallback={<CardGridSkeleton count={6} />}>
            <FeaturedDestinations />
          </Suspense>
        </Container>
      </section>

      <StudioIntro />

      <section className="py-24" aria-labelledby="featured-experiences">
        <Container>
          <SectionHeading eyebrow="Experiences" title="Things worth getting up early for." description="Small-group and private experiences from local providers, bookable on dates with real availability." action={<LinkButton href="/experiences" variant="gold">Browse experiences <ArrowRight aria-hidden className="h-4 w-4" /></LinkButton>} />
          <Suspense fallback={<CardGridSkeleton count={6} />}>
            <FeaturedExperiences />
          </Suspense>
        </Container>
      </section>

      <JourneyList />

      <section id="guides" className="scroll-mt-24 py-24" aria-labelledby="guides-heading">
        <Container>
          <SectionHeading eyebrow="Choose your guide" title="The person beside you matters most." description="Compare guides by language, region and specialty, check their calendar, and pick the one who fits your trip." action={<LinkButton href="/guides" variant="gold">Find a guide <ArrowRight aria-hidden className="h-4 w-4" /></LinkButton>} />
          <Suspense fallback={<CardGridSkeleton count={4} className="lg:grid-cols-4" />}>
            <FeaturedGuides />
          </Suspense>
        </Container>
      </section>

      <HowItWorks />
      <PaymentStrip />
      <TrustSection />

      <Suspense fallback={null}>
        <RecentReviews />
      </Suspense>

      <Faq />
      <FinalCta />
    </>
  );
}

function Hero() {
  return (
    <section className="relative -mt-[4.5rem] overflow-hidden pt-28 sm:pt-32">
      <Container className="relative z-10 flex justify-center">
        <div className="w-full max-w-[34rem] animate-fade-up rounded-[1.2rem] border-[3px] border-forest bg-white px-5 pb-7 pt-6 text-center shadow-[8px_8px_0_0_#111] sm:px-9">
          <p className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-forest bg-gold px-3 py-0.5 text-[0.7rem] font-extrabold uppercase tracking-[0.04em] text-forest">
            <span aria-hidden>🇰🇪</span> Kenya, planned your way
          </p>
          <h1 className="mt-5 text-[2.6rem] leading-[1.12] text-forest sm:text-[4rem]">
            Your <span className="highlight">journey</span>, with a <span className="highlight">guide</span> you <span className="highlight">chose</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-md text-[0.95rem] leading-relaxed text-ink-muted">
            Build your trip day by day, compare local guides and experiences on the dates you&apos;re actually travelling, and book it all with transparent prices.
          </p>
          <LinkButton href="/studio" variant="gold" size="lg" className="mt-6 w-full max-w-xs">
            Plan your trip <ArrowRight aria-hidden className="h-4 w-4" />
          </LinkButton>
          <p className="mt-3">
            <Link href="/guides" className="text-sm font-bold text-forest underline underline-offset-4 hover:text-ink-muted">
              Meet the guides
            </Link>
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-forest/10 pt-5 text-left sm:text-center">
            <a href="#guides" className="group">
              <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-forest underline-offset-4 group-hover:underline">
                <span aria-hidden>🧭</span> Choose your guide <ArrowDown aria-hidden className="h-3.5 w-3.5" />
              </span>
              <span className="mt-1 block text-xs text-ink-subtle">Verified profiles, clearly labelled.</span>
            </a>
            <a href="#studio-intro" className="group">
              <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-forest underline-offset-4 group-hover:underline">
                <span aria-hidden>🗺️</span> Plan day by day <ArrowDown aria-hidden className="h-3.5 w-3.5" />
              </span>
              <span className="mt-1 block text-xs text-ink-subtle">Pay only after providers accept.</span>
            </a>
          </div>
        </div>
      </Container>
      <div className="relative -mt-36 h-[15rem] sm:-mt-44 sm:h-[22rem]">
        <SavannaSkyline />
      </div>
    </section>
  );
}

function SearchBand() {
  return (
    <section className="bg-forest pb-20 pt-6 text-white" aria-label="Search">
      <Container className="max-w-6xl">
        <div className="text-forest">
          <Suspense fallback={<Skeleton className="h-[72px] rounded-[1.4rem]" />}>
            <HeroSearch />
          </Suspense>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-white/60">Search</p>
            <p className="mt-1 text-2xl font-extrabold tracking-[-0.05em] sm:text-3xl">See what&apos;s open on your dates.</p>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-white/65">Pick where and when, and we&apos;ll show experiences with live availability — or send it all straight into Journey Studio.</p>
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
    <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
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
    <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
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
    <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
      {items.slice(0, 4).map((g) => (
        <GuideCardView key={g.id} g={g} />
      ))}
    </div>
  );
}

function StudioIntro() {
  const days = [
    { day: "Day 1", place: "Lake Naivasha", items: [{ t: "08:00", title: "Boat ride", tag: "Experience" }, { t: "08:00–16:00", title: "Private guide", tag: "Guide" }] },
    { day: "Day 2", place: "Hell's Gate", items: [{ t: "08:00", title: "Cycle & gorge walk", tag: "Experience" }] },
    { day: "Day 3", place: "Maasai Mara", items: [{ t: "15:00", title: "Afternoon game drive", tag: "Experience" }] },
  ];
  return (
    <section id="studio-intro" className="scroll-mt-20 bg-forest py-24 text-white" aria-labelledby="studio-heading">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] lg:items-end">
          <div>
            <p className="pill-label text-white">Journey Studio</p>
            <h2 id="studio-heading" className="mt-5 text-balance text-5xl text-white sm:text-[4.6rem] sm:leading-[0.98]">
              The easiest way to plan Kenya, day by day.
            </h2>
          </div>
          <p className="max-w-sm text-[0.95rem] leading-relaxed text-white/70">
            Drop experiences onto days, add your guide, and see the map, timings and price update as you go. We check overlaps, travel buffers and live availability before anything is booked.
          </p>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
          <div aria-hidden className="rounded-[1.4rem] border-[3px] border-white bg-white p-4 text-forest shadow-[8px_8px_0_0_rgb(255_255_255/0.25)] sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-lg font-extrabold tracking-[-0.04em]">Rift Valley &amp; Mara</p>
              <span className="rounded-full border-[1.5px] border-forest bg-gold px-3 py-0.5 text-xs font-extrabold">Illustration</span>
            </div>
            <div className="space-y-3">
              {days.map((d) => (
                <div key={d.day} className="rounded-2xl border-2 border-forest/10 bg-sand p-4">
                  <div className="mb-2 flex items-center justify-between text-xs font-bold text-ink-subtle">
                    <span className="text-forest">{d.day}</span>
                    <span>{d.place}</span>
                  </div>
                  <div className="space-y-2">
                    {d.items.map((it) => (
                      <div key={it.title} className="flex items-center gap-3 rounded-xl border-[1.5px] border-forest bg-white px-3 py-2.5">
                        <span className="w-20 text-xs font-bold">{it.t}</span>
                        <span className="flex-1 text-sm font-bold">{it.title}</span>
                        <span className={it.tag === "Guide" ? "rounded-full bg-gold px-2 py-0.5 text-[11px] font-extrabold" : "rounded-full bg-forest px-2 py-0.5 text-[11px] font-extrabold text-white"}>{it.tag}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <ol className="divide-y divide-white/15 border-y border-white/15">
            {[
              { title: "A timeline for every day", text: "Day-by-day plan with travel-time estimates between stops." },
              { title: "Live availability", text: "Real open slots for guides and experience time slots." },
              { title: "Prices you can trust", text: "Server-calculated price breakdown against your budget." },
            ].map((p, i) => (
              <li key={p.title} className="flex gap-5 py-5">
                <span className="pt-0.5 text-xs font-extrabold text-gold">0{i + 1}</span>
                <div>
                  <p className="font-extrabold tracking-[-0.03em]">{p.title}</p>
                  <p className="mt-1 text-sm text-white/65">{p.text}</p>
                </div>
              </li>
            ))}
            <li className="py-6">
              <LinkButton href="/studio" variant="gold" size="lg">
                Start planning <ArrowRight aria-hidden className="h-4 w-4" />
              </LinkButton>
            </li>
          </ol>
        </div>
      </Container>
    </section>
  );
}

function JourneyList() {
  return (
    <section className="bg-forest py-24 text-white" aria-labelledby="journeys">
      <Container>
        <p className="pill-label text-white">Curated journeys</p>
        <h2 id="journeys" className="mt-5 max-w-3xl text-balance text-5xl text-white sm:text-[4.2rem] sm:leading-[0.98]">
          Start from a route. Make it yours.
        </h2>
        <p className="mt-6 max-w-xl text-white/65">Editorial day-by-day ideas you can open in Journey Studio and adjust — every booking still checks live availability.</p>
        <ul className="mt-12 border-t-2 border-white">
          {journeys.map((j, i) => (
            <li key={j.slug} className="border-b border-white/20">
              <Link href={`/journeys/${j.slug}`} className="group grid items-center gap-3 py-5 sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <span className="text-xs font-extrabold text-white/50">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className="block text-xl font-extrabold tracking-[-0.04em] group-hover:text-gold">{j.title}</span>
                  <span className="text-xs font-bold uppercase tracking-[0.08em] text-white/50">{j.length} days · {j.pace}</span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {j.bestFor.map((b) => (
                    <span key={b} className="rounded-full border border-white/40 px-3 py-1 text-xs font-bold">{b}</span>
                  ))}
                </span>
                <ArrowUpRight aria-hidden className="hidden h-5 w-5 text-white/50 transition-colors group-hover:text-gold sm:block" />
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-12 grid gap-8 rounded-[1.2rem] border border-white/25 p-6 sm:p-9 lg:grid-cols-2">
          <div>
            <p className="pill-label text-white">A practical place to start</p>
            <h3 className="mt-4 text-3xl text-white sm:text-4xl">Not sure where to begin?</h3>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/65">Pick the journey closest to your trip, open it in Journey Studio, and swap days, guides and experiences until it fits your dates and budget.</p>
            <LinkButton href="/journeys" variant="gold" size="lg" className="mt-6">
              Browse all journeys <ArrowRight aria-hidden className="h-4 w-4" />
            </LinkButton>
          </div>
          <ol className="divide-y divide-white/15 border-y border-white/15 self-center">
            {[
              { t: "Pick a route", d: "Start from an editorial journey, or a blank trip." },
              { t: "Shape the days", d: "Add experiences and a guide; check timings and travel buffers." },
              { t: "Request to book", d: "Providers accept first — then you choose to pay." },
            ].map((s, i) => (
              <li key={s.t} className="flex gap-5 py-4">
                <span className="pt-0.5 text-xs font-extrabold text-gold">0{i + 1}</span>
                <div>
                  <p className="font-extrabold tracking-[-0.03em]">{s.t}</p>
                  <p className="mt-1 text-sm text-white/60">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { title: "Sketch your trip", text: "Add destinations, experiences and a guide to each day in Journey Studio." },
    { title: "Send a request", text: "Your chosen providers see the dates and confirm they can host you." },
    { title: "Pay when accepted", text: "Nothing is charged until every provider accepts and you choose to pay." },
    { title: "Travel with your guide", text: "Message providers from your booking, so details stay in one place." },
  ];
  return (
    <section className="py-24" aria-labelledby="how-it-works">
      <Container>
        <p className="pill-label text-forest">How it works</p>
        <h2 id="how-it-works" className="mt-5 max-w-3xl text-balance text-5xl text-forest sm:text-[4.6rem] sm:leading-[0.98]">
          From first idea to a guide at the gate.
        </h2>
        <ol className="mt-14 grid border-y border-forest/20 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="border-forest/20 p-6 sm:[&:nth-child(odd)]:border-r lg:border-r lg:last:border-r-0">
              <span className="text-xs font-extrabold text-ink-subtle">{String(i).padStart(2, "0")}</span>
              <h3 className="mt-14 text-3xl text-forest">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

function PaymentStrip() {
  return (
    <section className="border-y-2 border-forest bg-white py-16" aria-label="Payments">
      <Container className="grid items-center gap-8 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,20rem)]">
        <p className="pill-label self-start text-forest lg:self-center">Transparent pricing</p>
        <p className="text-4xl font-extrabold leading-[1.12] tracking-[-0.055em] text-forest sm:text-5xl">
          You pay <span className="highlight-gold">only after</span> your providers accept.
        </p>
        <div>
          <p className="inline-block rounded-lg border-2 border-forest bg-gold px-3 py-1.5 text-sm font-extrabold text-forest shadow-[3px_3px_0_0_#111]">Prices in KES, no surprises</p>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-ink-muted">Prices come from each provider&apos;s current catalogue, with any group discounts and our service fee shown line by line before you pay.</p>
        </div>
      </Container>
    </section>
  );
}

function TrustSection() {
  const points = [
    { title: "Verified means checked", text: "A guide is only marked verified after our team checks their identity and a professional credential. Unverified profiles are clearly labelled." },
    { title: "Pay only after acceptance", text: "Providers confirm your request first. Payment is verified with the payment provider before a booking is confirmed." },
    { title: "Talk on the platform", text: "Message your guides and providers from your booking, so details and changes are kept together." },
    { title: "Reviews from real trips", text: "Only travellers with a completed booking can review it — one review per booked experience." },
  ];
  return (
    <section className="bg-forest py-24 text-white" aria-labelledby="trust">
      <Container className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <p className="pill-label text-white">Safety &amp; trust</p>
          <h2 id="trust" className="mt-5 text-balance text-4xl text-white sm:text-5xl">Built so you can book with confidence.</h2>
          <p className="mt-5 max-w-sm text-white/65">Clear labels, real checks and payments that only move when everyone has agreed.</p>
          <Link href="/safety" className="mt-6 inline-flex items-center gap-1.5 border-b-2 border-white pb-0.5 text-sm font-extrabold hover:border-gold hover:text-gold">
            How we keep trips safe <ArrowUpRight aria-hidden className="h-4 w-4" />
          </Link>
        </div>
        <ol className="divide-y divide-white/15 border-y-2 border-white">
          {points.map((p, i) => (
            <li key={p.title} className="grid gap-2 py-6 sm:grid-cols-[3rem_minmax(0,14rem)_minmax(0,1fr)]">
              <span className="text-xs font-extrabold text-gold">0{i + 1}</span>
              <h3 className="text-xl text-white">{p.title}</h3>
              <p className="text-sm leading-relaxed text-white/65">{p.text}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

async function RecentReviews() {
  const db = await requestDb();
  const reviews = await listReviews(db, {}, 3);
  // Only genuine reviews from completed bookings exist in the system; show nothing otherwise.
  if (!reviews.length) return null;
  return (
    <section className="py-24" aria-labelledby="reviews">
      <Container>
        <SectionHeading eyebrow="From travellers" title="Reviews from completed trips." description="Only travellers who completed a booking can leave a review." />
        <div className="grid gap-7 md:grid-cols-3">
          {reviews.map((r) => (
            <figure key={r.id} className="brutal rounded-[var(--radius-card)] p-6">
              <p aria-label={`${r.rating} out of 5`} className="text-gold">{"★".repeat(r.rating)}<span className="text-sand-300">{"★".repeat(5 - r.rating)}</span></p>
              <blockquote className="mt-3 text-sm leading-relaxed text-charcoal">“{r.body}”</blockquote>
              <figcaption className="mt-4 text-xs font-bold text-ink-subtle">{r.reviewerName}{r.experienceTitle ? ` · ${r.experienceTitle}` : ""}</figcaption>
            </figure>
          ))}
        </div>
      </Container>
    </section>
  );
}

function Faq() {
  return (
    <section className="py-24" aria-labelledby="faq">
      <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
        <div>
          <p className="pill-label text-forest">Common questions</p>
          <h2 id="faq" className="mt-4 text-4xl text-forest">Before you book.</h2>
          <p className="mt-4 max-w-xs text-ink-muted">Simple answers about planning, paying and cancelling.</p>
          <Link href="/faq" className="mt-5 inline-flex items-center gap-1.5 border-b-2 border-forest pb-0.5 text-sm font-extrabold text-forest">
            All FAQs <ArrowUpRight aria-hidden className="h-4 w-4" />
          </Link>
        </div>
        <div className="border-t-2 border-forest">
          {FAQS.slice(0, 6).map((f, i) => (
            <details key={f.q} open={i === 0} className="group border-b border-forest/20">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-extrabold tracking-[-0.03em] text-forest [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-forest transition-transform group-open:rotate-45">
                  <Plus className="h-4 w-4" />
                </span>
              </summary>
              <p className="max-w-2xl pb-6 text-sm leading-relaxed text-ink-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="-mb-24 bg-forest py-24 text-white" aria-labelledby="final-cta">
      <Container className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div>
          <p className="pill-label text-white">Plan your trip</p>
          <h2 id="final-cta" className="mt-5 text-5xl text-white sm:text-[4.6rem] sm:leading-[0.98]">{brand.tagline}</h2>
          <p className="mt-6 max-w-lg text-white/65">Sketch your trip in minutes. Nothing is charged until your providers accept and you choose to pay.</p>
        </div>
        <div className="rounded-[1.2rem] bg-white p-7 text-forest">
          <p className="text-[0.7rem] font-extrabold uppercase tracking-[0.1em] text-ink-subtle">Your next step</p>
          <p className="mt-1 text-3xl font-extrabold tracking-[-0.055em]">Open Journey Studio today.</p>
          <p className="mt-2 text-sm text-ink-muted">Pick your dates, add a guide and a few experiences, and see the full price before you request anything.</p>
          <LinkButton href="/studio" variant="gold" size="lg" className="mt-6 w-full">
            Start planning <ArrowRight aria-hidden className="h-4 w-4" />
          </LinkButton>
          <Link href="/register?type=guide" className="mt-4 block text-center text-sm font-bold underline underline-offset-4">
            I&apos;m a guide
          </Link>
        </div>
      </Container>
    </section>
  );
}
