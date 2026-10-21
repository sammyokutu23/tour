import type { Metadata } from "next";
import { Suspense } from "react";
import { Compass } from "lucide-react";
import { DestinationCardView } from "@/components/catalogue/cards";
import { CardGridSkeleton, Container, EmptyState, Input, LinkButton, PageHeader, Pagination, Select, Button } from "@/components/ui";
import { cachedCategories, cachedDestinations, cachedRegions } from "@/server/cached";
import { requestDb } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Destinations in Kenya",
  description: "Explore Kenyan destinations — safari reserves, the Swahili coast, mountains, lakes and forests — and the guides and experiences in each.",
  alternates: { canonical: "/destinations" },
};

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function DestinationsPage({ searchParams }: { searchParams: SP }) {
  return (
    <Container className="py-12">
      <PageHeader eyebrow="Destinations" title="Where in Kenya?" description="Filter by region, travel style, budget and how much time you have. Each destination lists live experiences and the guides who work there." />
      <Suspense fallback={<CardGridSkeleton className="mt-10" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

const STYLES = ["wildlife", "culture", "beach", "marine", "history", "hiking", "adventure", "birding", "nature", "food", "photography", "relaxation"];

async function Results({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  await requestDb();
  const filters = {
    q: one(sp.q) || undefined,
    region: one(sp.region) || undefined,
    style: one(sp.style) || undefined,
    category: one(sp.category) || undefined,
    maxPriceMinor: one(sp.budget) ? Number(one(sp.budget)) * 100 : undefined,
    maxDurationMinutes: one(sp.duration) ? Number(one(sp.duration)) * 60 : undefined,
    sort: (one(sp.sort) || "featured") as "featured" | "name" | "price",
    page: Number(one(sp.page)) || 1,
  };
  const [result, regions, categories] = await Promise.all([cachedDestinations(filters), cachedRegions(), cachedCategories()]);
  const qs = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== "page" && one(v)) p.set(k, one(v));
    p.set("page", String(page));
    return `/destinations?${p}`;
  };

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
      <form method="get" aria-label="Filter destinations" className="h-fit space-y-4 rounded-[var(--radius-card)] border border-sand-300/70 bg-white p-5 lg:sticky lg:top-24">
        <div>
          <label htmlFor="q" className="mb-1.5 block text-sm font-semibold">Search</label>
          <Input id="q" name="q" type="search" placeholder="e.g. coast, rhino, Lamu" defaultValue={filters.q} />
        </div>
        <div>
          <label htmlFor="region" className="mb-1.5 block text-sm font-semibold">Region</label>
          <Select id="region" name="region" defaultValue={filters.region ?? ""}>
            <option value="">All regions</option>
            {regions.map((r) => <option key={r}>{r}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="category" className="mb-1.5 block text-sm font-semibold">Activity type</label>
          <Select id="category" name="category" defaultValue={filters.category ?? ""}>
            <option value="">Any activity</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="style" className="mb-1.5 block text-sm font-semibold">Travel style</label>
          <Select id="style" name="style" defaultValue={filters.style ?? ""}>
            <option value="">Any style</option>
            {STYLES.map((s) => <option key={s} value={s} className="capitalize">{s[0].toUpperCase() + s.slice(1)}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="budget" className="mb-1.5 block text-sm font-semibold">Max price (KES)</label>
            <Input id="budget" name="budget" type="number" min={0} step={500} inputMode="numeric" defaultValue={one(sp.budget)} />
          </div>
          <div>
            <label htmlFor="duration" className="mb-1.5 block text-sm font-semibold">Max hours</label>
            <Input id="duration" name="duration" type="number" min={1} max={24} defaultValue={one(sp.duration)} />
          </div>
        </div>
        <div>
          <label htmlFor="sort" className="mb-1.5 block text-sm font-semibold">Sort by</label>
          <Select id="sort" name="sort" defaultValue={filters.sort}>
            <option value="featured">Featured</option>
            <option value="name">Name</option>
            <option value="price">Lowest starting price</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">Apply</Button>
          <LinkButton href="/destinations" variant="ghost">Reset</LinkButton>
        </div>
      </form>

      <div>
        <p className="mb-4 text-sm text-ink-muted" aria-live="polite">{result.total} destination{result.total === 1 ? "" : "s"}</p>
        {result.items.length ? (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {result.items.map((d) => <DestinationCardView key={d.id} d={d} />)}
          </div>
        ) : (
          <EmptyState icon={<Compass className="h-6 w-6" />} title="No destinations match" description="Try removing a filter or widening your budget." action={<LinkButton href="/destinations" variant="secondary">Clear filters</LinkButton>} />
        )}
        <Pagination page={result.page} pageCount={result.pageCount} hrefFor={qs} />
      </div>
    </div>
  );
}
