import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarHeart, Compass, MessagesSquare, Search, ShieldCheck, Sparkles, UsersRound, Vote } from "lucide-react";
import { DestinationArt } from "@/components/art/destination-art";
import { GroupCardView } from "@/components/travel/group-card";
import { Alert, Button, CardGridSkeleton, Container, EmptyState, Input, LinkButton, Pagination, SectionHeading, Select } from "@/components/ui";
import { getActor, requestDb } from "@/server/auth/session";
import { discoverGroups, discoverySections, type GroupFilters } from "@/server/services/travel-groups";
import { cachedDestinationsBrief } from "@/server/cached";
import { track } from "@/server/services/analytics";
import { INTEREST_LABEL, MATCH_WEIGHTS } from "@/domain/travel-groups";

export const metadata: Metadata = {
  title: "Travel Together — find travel buddies in Kenya",
  description: "Join or create small travel groups with people who share your dates, budget and interests, then plan and book your Kenya trip together.",
  alternates: { canonical: "/travel-together" },
};

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export default function TravelTogetherPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-forest-950">
        <div className="absolute inset-0 -z-10 opacity-80"><DestinationArt variant="coast" seed="travel-together" /></div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-forest-950/95 via-forest-950/70 to-forest-950/20" />
        <Container className="py-16 sm:py-20">
          <p className="inline-flex items-center gap-2 rounded-full bg-sand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold ring-1 ring-sand/20">
            <UsersRound aria-hidden className="h-3.5 w-3.5" /> Travel Together
          </p>
          <h1 className="mt-5 max-w-3xl text-balance text-4xl leading-[1.02] text-sand sm:text-6xl">
            Explore together. <span className="text-gold">Meet your kind of people.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-sand/85">
            Travelling solo? Join a small group heading where you&apos;re going, on your dates and budget — or start your own. You decide what to share, and nobody pays for anyone else.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="#find" variant="gold" size="lg"><Search aria-hidden className="h-4 w-4" />Find travel buddies</LinkButton>
            <LinkButton href="/travel-together/create" variant="outlineLight" size="lg">Create a travel group</LinkButton>
          </div>
        </Container>
      </section>

      <Container id="find" className="scroll-mt-24 py-12">
        <Suspense fallback={<CardGridSkeleton className="mt-6" />}>
          <Discovery searchParams={searchParams} />
        </Suspense>
      </Container>

      <section className="bg-white py-16" aria-labelledby="how">
        <Container>
          <SectionHeading eyebrow="How it works" title="From strangers to travel companions" />
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { Icon: Compass, t: "Find or create a group", d: "Filter by destination, dates, budget and interests. We explain why a group suits you." },
              { Icon: UsersRound, t: "Join on your terms", d: "Open groups let you join instantly; others ask the organizer first. Private groups are invite-only." },
              { Icon: Vote, t: "Plan the days together", d: "Suggest activities, vote, and watch agreed plans appear in the shared itinerary." },
              { Icon: CalendarHeart, t: "Book your own place", d: "Each traveller books and pays for themselves through our normal checkout. A vote never charges anyone." },
            ].map(({ Icon, t, d }, i) => (
              <li key={t} className="rounded-[var(--radius-card)] bg-sand p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest text-sm font-bold text-gold">{i + 1}</span>
                <Icon aria-hidden className="mt-4 h-6 w-6 text-terracotta-700" />
                <h3 className="mt-2 text-lg font-bold text-forest">{t}</h3>
                <p className="mt-1 text-sm text-ink-muted">{d}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section className="py-16" aria-labelledby="safety">
        <Container className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-terracotta-700">Safety first</p>
            <h2 id="safety" className="text-3xl text-forest sm:text-4xl">Meet people, keep control</h2>
            <p className="mt-3 text-ink-muted">Group members are fellow travellers, not vetted staff — we don&apos;t background-check them. These features help you stay safe:</p>
            <div className="mt-6 flex gap-3">
              <LinkButton href="/travel-together/guidelines" variant="secondary">Read the guidelines</LinkButton>
              <LinkButton href="/contact?kind=safety" variant="ghost">Report a safety concern</LinkButton>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              { Icon: ShieldCheck, t: "Your details stay private", d: "Email, phone and bookings are never shown to other travellers." },
              { Icon: MessagesSquare, t: "Chat on the platform", d: "Group chat is members-only, and you can report or block anyone." },
              { Icon: UsersRound, t: "Organizers moderate", d: "Organizers can remove members; our team reviews every report." },
              { Icon: Sparkles, t: "Adults only", d: "Travel Together is for travellers aged 18 and over." },
            ].map(({ Icon, t, d }) => (
              <li key={t} className="rounded-2xl border border-sand-300/70 bg-white p-4">
                <Icon aria-hidden className="h-5 w-5 text-forest" />
                <p className="mt-2 font-semibold text-forest">{t}</p>
                <p className="text-sm text-ink-muted">{d}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  );
}

async function Discovery({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await requestDb();
  const actor = await getActor();
  const budget = Number(one(sp.budget));
  const filters: GroupFilters = {
    q: one(sp.q).slice(0, 80) || undefined,
    destination: one(sp.destination) || undefined,
    from: isDate(one(sp.from)) ? one(sp.from) : undefined,
    to: isDate(one(sp.to)) ? one(sp.to) : undefined,
    budgetMaxMinor: budget > 0 ? budget * 100 : undefined,
    interests: many(sp.interest).filter((i) => i in INTEREST_LABEL),
    language: one(sp.language) || undefined,
    pace: (["relaxed", "balanced", "adventurous"].includes(one(sp.pace)) ? one(sp.pace) : undefined) as GroupFilters["pace"],
    maxSize: Number(one(sp.size)) || undefined,
    visibility: one(sp.visibility) === "public" || one(sp.visibility) === "approval" ? (one(sp.visibility) as "public" | "approval") : undefined,
    hasPlaces: one(sp.places) !== "any",
    sort: (["match", "soonest", "newest"].includes(one(sp.sort)) ? one(sp.sort) : undefined) as GroupFilters["sort"],
    page: Number(one(sp.page)) || 1,
  };
  const searching = Object.keys(sp).some((k) => !["page", "sort"].includes(k) && one(sp[k]));
  const [result, sections, destinations] = await Promise.all([discoverGroups(db, actor, filters), searching ? null : discoverySections(db, actor), cachedDestinationsBrief()]);
  await track(db, searching ? "group_search" : "travel_together_viewed", { results: result.total }, actor?.userId ?? null);
  const qs = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== "page") for (const x of many(v)) p.append(k, x);
    p.set("page", String(page));
    return `/travel-together?${p}#find`;
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
      <form method="get" action="/travel-together#find" aria-label="Filter travel groups" className="h-fit space-y-4 rounded-[var(--radius-card)] border border-sand-300/70 bg-white p-5 lg:sticky lg:top-24">
        <div>
          <label htmlFor="destination" className="mb-1.5 block text-sm font-semibold">Destination</label>
          <Select id="destination" name="destination" defaultValue={filters.destination ?? ""}>
            <option value="">Anywhere in Kenya</option>
            {destinations.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="from" className="mb-1.5 block text-sm font-semibold">Travelling from</label>
          <Input id="from" name="from" type="date" defaultValue={filters.from} />
        </div>
        <div>
          <label htmlFor="to" className="mb-1.5 block text-sm font-semibold">Until</label>
          <Input id="to" name="to" type="date" defaultValue={filters.to} />
        </div>
        <div>
          <label htmlFor="budget" className="mb-1.5 block text-sm font-semibold">My budget per person (KES)</label>
          <Input id="budget" name="budget" type="number" min={0} step={1000} defaultValue={one(sp.budget)} placeholder="e.g. 40000" />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Interests</legend>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(INTEREST_LABEL).map(([slug, label]) => (
              <label key={slug} className="cursor-pointer rounded-full border border-sand-300 px-2.5 py-1 text-xs font-medium has-[:checked]:border-forest has-[:checked]:bg-forest has-[:checked]:text-sand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold">
                <input type="checkbox" name="interest" value={slug} defaultChecked={filters.interests?.includes(slug)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pace" className="mb-1.5 block text-sm font-semibold">Pace</label>
            <Select id="pace" name="pace" defaultValue={filters.pace ?? ""}>
              <option value="">Any</option>
              <option value="relaxed">Relaxed</option>
              <option value="balanced">Balanced</option>
              <option value="adventurous">Adventurous</option>
            </Select>
          </div>
          <div>
            <label htmlFor="size" className="mb-1.5 block text-sm font-semibold">Group size</label>
            <Select id="size" name="size" defaultValue={one(sp.size)}>
              <option value="">Any</option>
              <option value="4">Up to 4</option>
              <option value="8">Up to 8</option>
              <option value="15">Up to 15</option>
            </Select>
          </div>
        </div>
        <div>
          <label htmlFor="language" className="mb-1.5 block text-sm font-semibold">Group language</label>
          <Input id="language" name="language" defaultValue={filters.language} placeholder="e.g. English, Swahili" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="visibility" className="mb-1.5 block text-sm font-semibold">Joining</label>
            <Select id="visibility" name="visibility" defaultValue={filters.visibility ?? ""}>
              <option value="">Any</option>
              <option value="public">Open to join</option>
              <option value="approval">Request to join</option>
            </Select>
          </div>
          <div>
            <label htmlFor="places" className="mb-1.5 block text-sm font-semibold">Places</label>
            <Select id="places" name="places" defaultValue={one(sp.places) || "open"}>
              <option value="open">Has places</option>
              <option value="any">Include full</option>
            </Select>
          </div>
        </div>
        <div>
          <label htmlFor="sort" className="mb-1.5 block text-sm font-semibold">Sort by</label>
          <Select id="sort" name="sort" defaultValue={filters.sort ?? ""}>
            <option value="">Best match</option>
            <option value="soonest">Leaving soonest</option>
            <option value="newest">Newest</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">Search</Button>
          <LinkButton href="/travel-together#find" variant="ghost">Reset</LinkButton>
        </div>
      </form>

      <div className="min-w-0 space-y-10">
        {/* Highlight sections only add value once there are more groups than fit in the main list. */}
        {sections && result.total > 6 && (sections.leavingSoon.length > 0 || sections.newGroups.length > 0) && (
          <>
            {sections.leavingSoon.length > 0 && (
              <section aria-labelledby="soon">
                <h2 id="soon" className="mb-4 text-2xl text-forest">Leaving soon</h2>
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{sections.leavingSoon.map((g) => <GroupCardView key={g.id} g={g} />)}</div>
              </section>
            )}
            {sections.newGroups.length > 0 && (
              <section aria-labelledby="new">
                <h2 id="new" className="mb-4 text-2xl text-forest">New groups looking for members</h2>
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{sections.newGroups.map((g) => <GroupCardView key={g.id} g={g} />)}</div>
              </section>
            )}
          </>
        )}
        <section aria-labelledby="all">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="all" className="text-2xl text-forest">{searching ? "Matching groups" : "All upcoming groups"}</h2>
            <p className="text-sm text-ink-muted" aria-live="polite">{result.total} group{result.total === 1 ? "" : "s"}</p>
          </div>
          {!actor && <Alert tone="info" className="mb-4"><Link href="/login?next=/travel-together" className="font-semibold underline">Sign in</Link> to see how well each group matches your travel profile.</Alert>}
          {result.items.length ? (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{result.items.map((g) => <GroupCardView key={g.id} g={g} />)}</div>
          ) : (
            <EmptyState
              icon={<UsersRound className="h-6 w-6" />}
              title={searching ? "No groups match yet" : "No upcoming groups yet"}
              description="Be the first: create a group for your dates and destination, and others can find you."
              action={<LinkButton href="/travel-together/create">Create a travel group</LinkButton>}
            />
          )}
          <Pagination page={result.page} pageCount={result.pageCount} hrefFor={qs} />
          <p className="mt-6 text-xs text-ink-subtle">
            How matching works: we compare dates ({MATCH_WEIGHTS.dates}%), destination ({MATCH_WEIGHTS.destination}%), shared interests ({MATCH_WEIGHTS.interests}%), budget ({MATCH_WEIGHTS.budget}%), pace ({MATCH_WEIGHTS.pace}%) and language ({MATCH_WEIGHTS.language}%) using only what you entered and your travel profile. It&apos;s a guide, not a prediction — read the group details before joining.
          </p>
        </section>
      </div>
    </div>
  );
}
