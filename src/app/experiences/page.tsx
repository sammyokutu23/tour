import type { Metadata } from "next";
import { Suspense } from "react";
import { Binoculars } from "lucide-react";
import { ExperienceCardView } from "@/components/catalogue/cards";
import { Button, CardGridSkeleton, Container, EmptyState, Input, LinkButton, PageHeader, Pagination, Select } from "@/components/ui";
import { cachedCategories, cachedDestinationsBrief } from "@/server/cached";
import { getActor, requestDb } from "@/server/auth/session";
import { listExperiences } from "@/server/services/catalogue";
import { track } from "@/server/services/analytics";

export const metadata: Metadata = {
  title: "Experiences in Kenya",
  description: "Game drives, cultural visits, snorkelling, hikes and food walks from local Kenyan providers, bookable on real dates.",
  alternates: { canonical: "/experiences" },
};

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function ExperiencesPage({ searchParams }: { searchParams: SP }) {
  return (
    <Container className="py-12">
      <PageHeader eyebrow="Experiences" title="Find something unforgettable" description="Search by place, date and type. Dates show only experiences with open places for your group." />
      <Suspense fallback={<CardGridSkeleton className="mt-10" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Results({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = await requestDb();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.date)) ? one(sp.date) : undefined;
  const party = Math.min(60, Math.max(1, Number(one(sp.party)) || 1));
  const filters = {
    q: one(sp.q).slice(0, 100) || undefined,
    destination: one(sp.destination) || undefined,
    category: one(sp.category) || undefined,
    maxPriceMinor: one(sp.budget) ? Number(one(sp.budget)) * 100 : undefined,
    maxDurationMinutes: one(sp.duration) ? Number(one(sp.duration)) * 60 : undefined,
    date,
    party,
    sort: (one(sp.sort) || "recommended") as "recommended" | "price_asc" | "price_desc" | "duration" | "rating",
    page: Number(one(sp.page)) || 1,
  };
  const [result, destinations, categories] = await Promise.all([listExperiences(db, filters), cachedDestinationsBrief(), cachedCategories()]);
  if (filters.q || date) {
    const actor = await getActor();
    await track(db, "search_submitted", { hasQuery: !!filters.q, hasDate: !!date, destination: filters.destination ?? null, results: result.total }, actor?.userId ?? null);
  }
  const qs = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== "page" && one(v)) p.set(k, one(v));
    p.set("page", String(page));
    return `/experiences?${p}`;
  };

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
      <form method="get" aria-label="Filter experiences" className="h-fit space-y-4 rounded-[var(--radius-card)] border border-sand-300/70 bg-white p-5 lg:sticky lg:top-24">
        <div>
          <label htmlFor="q" className="mb-1.5 block text-sm font-semibold">Keyword</label>
          <Input id="q" name="q" type="search" placeholder="snorkel, rhino, cooking…" defaultValue={filters.q} />
        </div>
        <div>
          <label htmlFor="destination" className="mb-1.5 block text-sm font-semibold">Destination</label>
          <Select id="destination" name="destination" defaultValue={filters.destination ?? ""}>
            <option value="">Anywhere</option>
            {destinations.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="category" className="mb-1.5 block text-sm font-semibold">Type</label>
          <Select id="category" name="category" defaultValue={filters.category ?? ""}>
            <option value="">All types</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="date" className="mb-1.5 block text-sm font-semibold">Date</label>
          <Input id="date" name="date" type="date" defaultValue={date} />
        </div>
        <div>
          <label htmlFor="party" className="mb-1.5 block text-sm font-semibold">Travellers</label>
          <Input id="party" name="party" type="number" min={1} max={60} defaultValue={party} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="budget" className="mb-1.5 block text-sm font-semibold">Max price (KES)</label>
            <Input id="budget" name="budget" type="number" min={0} step={500} defaultValue={one(sp.budget)} />
          </div>
          <div>
            <label htmlFor="duration" className="mb-1.5 block text-sm font-semibold">Max hours</label>
            <Input id="duration" name="duration" type="number" min={1} max={24} defaultValue={one(sp.duration)} />
          </div>
        </div>
        <div>
          <label htmlFor="sort" className="mb-1.5 block text-sm font-semibold">Sort by</label>
          <Select id="sort" name="sort" defaultValue={filters.sort}>
            <option value="recommended">Recommended</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="duration">Shortest first</option>
            <option value="rating">Best rated</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">Search</Button>
          <LinkButton href="/experiences" variant="ghost">Reset</LinkButton>
        </div>
      </form>
      <div>
        <p className="mb-4 text-sm text-ink-muted" aria-live="polite">
          {result.total} experience{result.total === 1 ? "" : "s"}
          {date ? ` with space for ${party} on ${date}` : ""}
        </p>
        {result.items.length ? (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {result.items.map((e) => <ExperienceCardView key={e.id} e={e} />)}
          </div>
        ) : (
          <EmptyState icon={<Binoculars className="h-6 w-6" />} title="Nothing matches yet" description={date ? "No experiences have open places for your group on that date. Try another date or destination." : "Try a different keyword or remove some filters."} action={<LinkButton href="/experiences" variant="secondary">Clear filters</LinkButton>} />
        )}
        <Pagination page={result.page} pageCount={result.pageCount} hrefFor={qs} />
      </div>
    </div>
  );
}
