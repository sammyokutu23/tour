import type { Metadata } from "next";
import { Suspense } from "react";
import { UserSearch } from "lucide-react";
import { GuideCardView } from "@/components/catalogue/cards";
import { Alert, Button, CardGridSkeleton, Container, EmptyState, Input, LinkButton, PageHeader, Pagination, Select } from "@/components/ui";
import { cachedDestinationsBrief } from "@/server/cached";
import { requestDb } from "@/server/auth/session";
import { listGuides, listLanguagesAndSpecialties } from "@/server/services/catalogue";
import { DEFAULT_WEIGHTS } from "@/domain/ranking";

export const metadata: Metadata = {
  title: "Find a local guide in Kenya",
  description: "Compare Kenyan tour guides by region, language, specialty, availability and price — then choose your own.",
  alternates: { canonical: "/guides" },
};

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function GuidesPage({ searchParams }: { searchParams: SP }) {
  return (
    <Container className="py-12">
      <PageHeader eyebrow="Guides" title="Choose the guide who fits your trip" description="Filter by where you're going, the language you speak and what you love. Add a date to see who actually has time free." />
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
  const filters = {
    destination: one(sp.destination) || undefined,
    language: one(sp.language) || undefined,
    specialty: one(sp.specialty) || undefined,
    date,
    maxPriceMinor: one(sp.budget) ? Number(one(sp.budget)) * 100 : undefined,
    minRating: one(sp.rating) ? Number(one(sp.rating)) : undefined,
    party: one(sp.party) ? Math.max(1, Number(one(sp.party))) : undefined,
    sort: (one(sp.sort) || "recommended") as "recommended" | "price" | "rating" | "experience",
    page: Number(one(sp.page)) || 1,
  };
  const [result, destinations, facets] = await Promise.all([listGuides(db, filters), cachedDestinationsBrief(), listLanguagesAndSpecialties(db)]);
  const carry = new URLSearchParams();
  if (date) carry.set("date", date);
  const qs = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== "page" && one(v)) p.set(k, one(v));
    p.set("page", String(page));
    return `/guides?${p}`;
  };

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
      <form method="get" aria-label="Filter guides" className="h-fit space-y-4 rounded-[var(--radius-card)] border border-sand-300/70 bg-white p-5 lg:sticky lg:top-24">
        <div>
          <label htmlFor="destination" className="mb-1.5 block text-sm font-semibold">Region served</label>
          <Select id="destination" name="destination" defaultValue={filters.destination ?? ""}>
            <option value="">Anywhere</option>
            {destinations.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="date" className="mb-1.5 block text-sm font-semibold">Available on</label>
          <Input id="date" name="date" type="date" defaultValue={date} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="language" className="mb-1.5 block text-sm font-semibold">Language</label>
            <Select id="language" name="language" defaultValue={filters.language ?? ""}>
              <option value="">Any</option>
              {facets.languages.map((l) => <option key={l}>{l}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="party" className="mb-1.5 block text-sm font-semibold">Group size</label>
            <Input id="party" name="party" type="number" min={1} max={60} defaultValue={one(sp.party)} />
          </div>
        </div>
        <div>
          <label htmlFor="specialty" className="mb-1.5 block text-sm font-semibold">Specialty</label>
          <Select id="specialty" name="specialty" defaultValue={filters.specialty ?? ""}>
            <option value="">Any</option>
            {facets.specialties.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="budget" className="mb-1.5 block text-sm font-semibold">Max price (KES)</label>
            <Input id="budget" name="budget" type="number" min={0} step={500} defaultValue={one(sp.budget)} />
          </div>
          <div>
            <label htmlFor="rating" className="mb-1.5 block text-sm font-semibold">Min rating</label>
            <Select id="rating" name="rating" defaultValue={one(sp.rating)}>
              <option value="">Any</option>
              <option value="4">4★ +</option>
              <option value="4.5">4.5★ +</option>
            </Select>
          </div>
        </div>
        <div>
          <label htmlFor="sort" className="mb-1.5 block text-sm font-semibold">Sort by</label>
          <Select id="sort" name="sort" defaultValue={filters.sort}>
            <option value="recommended">Best match</option>
            <option value="price">Lowest price</option>
            <option value="rating">Highest rated</option>
            <option value="experience">Most experienced</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">Apply</Button>
          <LinkButton href="/guides" variant="ghost">Reset</LinkButton>
        </div>
      </form>
      <div>
        <p className="mb-4 text-sm text-ink-muted" aria-live="polite">{result.total} guide{result.total === 1 ? "" : "s"}{date ? ` with open time on ${date}` : ""}</p>
        {result.items.length ? (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {result.items.map((g) => <GuideCardView key={g.id} g={g} query={carry.toString()} />)}
          </div>
        ) : (
          <EmptyState icon={<UserSearch className="h-6 w-6" />} title="No guides match those filters" description={date ? "No matching guide has open time on that date. Try another date or region." : "Try a different region or language."} action={<LinkButton href="/guides" variant="secondary">Clear filters</LinkButton>} />
        )}
        <Pagination page={result.page} pageCount={result.pageCount} hrefFor={qs} />
        <Alert tone="info" className="mt-10" title="How “Best match” works">
          Guides who can&apos;t take your date or group size are excluded first. The rest are ordered by language match ({DEFAULT_WEIGHTS.languages * 100}%), relevant expertise ({DEFAULT_WEIGHTS.expertise * 100}%), review quality ({DEFAULT_WEIGHTS.reviews * 100}%), booking reliability ({DEFAULT_WEIGHTS.reliability * 100}%) and price ({DEFAULT_WEIGHTS.price * 100}%). There are no paid placements.
        </Alert>
      </div>
    </div>
  );
}
