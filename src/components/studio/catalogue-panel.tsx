"use client";

import Link from "next/link";
import { Clock, Plus, Search, Sparkles, Users } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Badge, cn, DemoBadge } from "@/components/ui";
import { addGuideServiceAction, addSlotAction } from "@/app/actions/studio";

export interface PanelExperience {
  id: string;
  slug: string;
  title: string;
  destinationName: string;
  categoryName: string;
  durationLabel: string;
  priceLabel: string;
  isDemo: boolean;
  perGroup: boolean;
  maxGroupSize: number;
  slots: { id: string; label: string; dayNumber: number | null; remaining: number }[];
}

export interface PanelGuide {
  id: string;
  slug: string;
  name: string;
  headline: string | null;
  languages: string[];
  verified: boolean;
  isDemo: boolean;
  services: { id: string; title: string; durationLabel: string; priceLabel: string; maxGroupSize: number }[];
}

export function CataloguePanel({
  tripId,
  editable,
  tab,
  experiences,
  suggestions,
  guides,
  days,
  party,
  filters,
  destinations,
  categories,
}: {
  tripId: string;
  editable: boolean;
  tab: "experiences" | "guides";
  experiences: PanelExperience[];
  suggestions: PanelExperience[];
  guides: PanelGuide[];
  days: { id: string; dayNumber: number; label: string }[];
  party: number;
  filters: { q: string; destination: string; category: string };
  destinations: { slug: string; name: string }[];
  categories: { slug: string; name: string }[];
}) {
  const base = `/studio/${tripId}`;
  return (
    <div className="space-y-4">
      <nav className="grid grid-cols-2 gap-1 rounded-full border border-sand-300 bg-white p-1" aria-label="Catalogue type">
        {(["experiences", "guides"] as const).map((t) => (
          <Link
            key={t}
            href={`${base}?tab=${t}${filters.destination ? `&dest=${filters.destination}` : ""}#catalogue`}
            scroll={false}
            aria-current={tab === t ? "page" : undefined}
            className={cn("rounded-full py-2 text-center text-sm font-semibold capitalize", tab === t ? "bg-forest text-sand" : "text-ink-muted hover:bg-forest-50")}
          >
            {t}
          </Link>
        ))}
      </nav>

      <form method="get" action={base} className="space-y-2" role="search" aria-label="Search the catalogue">
        <input type="hidden" name="tab" value={tab} />
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <label htmlFor="cat-q" className="sr-only">Search</label>
          <input id="cat-q" name="q" type="search" defaultValue={filters.q} placeholder={tab === "guides" ? "Guides are filtered by region" : "Search experiences"} disabled={tab === "guides"} className="h-10 w-full rounded-xl border border-sand-300 bg-white pl-9 pr-3 text-sm disabled:bg-sand-200" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="sr-only" htmlFor="cat-dest">Destination</label>
          <select id="cat-dest" name="dest" defaultValue={filters.destination} className="h-10 rounded-xl border border-sand-300 bg-white px-2 text-sm">
            <option value="">Trip destination</option>
            {destinations.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </select>
          <label className="sr-only" htmlFor="cat-cat">Category</label>
          <select id="cat-cat" name="cat" defaultValue={filters.category} disabled={tab === "guides"} className="h-10 rounded-xl border border-sand-300 bg-white px-2 text-sm disabled:bg-sand-200">
            <option value="">All types</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <button type="submit" className="h-9 w-full rounded-xl bg-forest-50 text-sm font-semibold text-forest hover:bg-forest-100">Update results</button>
      </form>

      {tab === "experiences" && suggestions.length > 0 && (
        <div className="rounded-2xl bg-gold-100/70 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#6b4e0b]">
            <Sparkles aria-hidden className="h-3.5 w-3.5" /> Matches your interests
          </p>
          <div className="space-y-2">
            {suggestions.map((e) => <ExperienceRow key={e.id} e={e} tripId={tripId} editable={editable} party={party} compact />)}
          </div>
        </div>
      )}

      {tab === "experiences" && (
        <div className="space-y-2">
          {experiences.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-ink-muted">No experiences found. Try another destination or remove the category filter.</p>}
          {experiences.map((e) => <ExperienceRow key={e.id} e={e} tripId={tripId} editable={editable} party={party} />)}
        </div>
      )}

      {tab === "guides" && (
        <div className="space-y-3">
          {guides.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-ink-muted">No guides serve this destination yet. Try another destination.</p>}
          {guides.map((g) => (
            <div key={g.id} className="rounded-2xl border border-sand-300/70 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/guides/${g.slug}`} className="font-semibold text-forest hover:underline">{g.name}</Link>
                  <p className="line-clamp-1 text-xs text-ink-muted">{g.headline}</p>
                  <p className="text-xs text-ink-subtle">{g.languages.join(", ")}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {g.verified ? <Badge tone="success">Verified</Badge> : <Badge>Not yet verified</Badge>}
                  {g.isDemo && <DemoBadge />}
                </div>
              </div>
              {g.services.map((s) => (
                <div key={s.id} className="mt-3 rounded-xl bg-sand/60 p-2.5">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-medium">{s.title}</span>
                    <span className="shrink-0 font-semibold text-forest">{s.priceLabel}</span>
                  </div>
                  <p className="text-xs text-ink-subtle">{s.durationLabel} · up to {s.maxGroupSize}{party > s.maxGroupSize ? " — too small for your group" : ""}</p>
                  {editable && party <= s.maxGroupSize && (
                    <ActionForm action={addGuideServiceAction.bind(null, tripId, s.id)} className="mt-2 flex items-end gap-2">
                      <div className="flex-1">
                        <label htmlFor={`gd-${s.id}`} className="sr-only">Day</label>
                        <select id={`gd-${s.id}`} name="dayId" className="h-9 w-full rounded-lg border border-sand-300 bg-white px-2 text-xs">
                          {days.map((d) => <option key={d.id} value={d.id}>Day {d.dayNumber}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`gt-${s.id}`} className="sr-only">Start time</label>
                        <input id={`gt-${s.id}`} name="startTime" type="time" step={900} defaultValue="08:00" className="h-9 rounded-lg border border-sand-300 bg-white px-2 text-xs" />
                      </div>
                      <SubmitButton size="sm" className="h-9" pendingLabel="…"><Plus aria-hidden className="h-3.5 w-3.5" />Add</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExperienceRow({ e, tripId, editable, party, compact }: { e: PanelExperience; tripId: string; editable: boolean; party: number; compact?: boolean }) {
  const usable = e.slots.filter((s) => s.dayNumber !== null && (e.perGroup || s.remaining >= party));
  const tooBig = e.perGroup && party > e.maxGroupSize;
  return (
    <details className="group rounded-2xl border border-sand-300/70 bg-white p-3 open:shadow-[var(--shadow-card)]">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold leading-snug text-forest">{e.title}</p>
            <p className="text-xs text-ink-subtle">{e.destinationName} · {e.categoryName}</p>
          </div>
          <p className="shrink-0 text-right text-sm font-semibold text-forest">{e.priceLabel}</p>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
          <span className="inline-flex items-center gap-1"><Clock aria-hidden className="h-3 w-3" />{e.durationLabel}</span>
          <span className="inline-flex items-center gap-1"><Users aria-hidden className="h-3 w-3" />{e.perGroup ? `private, up to ${e.maxGroupSize}` : `up to ${e.maxGroupSize}`}</span>
          {e.isDemo && <DemoBadge />}
          <span className={cn("ml-auto font-semibold", usable.length ? "text-[#1d5b39]" : "text-ink-subtle")}>{usable.length ? `${usable.length} time${usable.length === 1 ? "" : "s"} on your dates` : "No times on your dates"}</span>
        </div>
      </summary>
      <div className="mt-3 border-t border-sand-200 pt-3">
        {tooBig ? (
          <p className="text-xs text-ink-muted">This private experience takes up to {e.maxGroupSize}; your group is {party}.</p>
        ) : usable.length === 0 ? (
          <p className="text-xs text-ink-muted">No open times during your trip for a group of {party}.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {usable.slice(0, compact ? 6 : 20).map((s) => (
              editable ? (
                <ActionButton key={s.id} action={() => addSlotAction(tripId, s.id)} size="sm" className="h-8 px-3 text-xs" pendingLabel="Adding…">
                  <Plus aria-hidden className="h-3 w-3" />Day {s.dayNumber} · {s.label}
                </ActionButton>
              ) : (
                <span key={s.id} className="rounded-full bg-sand px-3 py-1 text-xs">Day {s.dayNumber} · {s.label}</span>
              )
            ))}
          </div>
        )}
        <Link href={`/experiences/${e.slug}`} className="mt-3 inline-block text-xs font-semibold text-forest underline">Full details</Link>
      </div>
    </details>
  );
}
