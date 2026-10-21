import Link from "next/link";
import { BadgeCheck, Binoculars, Bird, Clock, Compass, Landmark, Languages, MapPin, Mountain, Star, Users, UtensilsCrossed, Waves, type LucideIcon } from "lucide-react";

const CATEGORY_ICON: Record<string, LucideIcon> = {
  "wildlife-safari": Binoculars,
  culture: Users,
  adventure: Mountain,
  "beach-marine": Waves,
  food: UtensilsCrossed,
  history: Landmark,
  nature: Bird,
};
import { DestinationArt } from "@/components/art/destination-art";
import { Badge, DemoBadge, cn } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDuration } from "@/lib/time";
import type { DestinationCard as DCard, ExperienceCard as ECard, GuideCard as GCard, Media } from "@/server/services/catalogue";

function Cover({ media, variant, seed, className }: { media: Media | null; variant: DCard["artVariant"]; seed: string; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-forest-100", className)}>
      {media ? (
        // eslint-disable-next-line @next/next/no-img-element -- licensed media URLs are admin-managed; avoid open image-proxy surface
        <img src={media.url} alt={media.altText} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      ) : (
        <DestinationArt variant={variant} seed={seed} className="transition-transform duration-500 group-hover:scale-[1.03]" />
      )}
    </div>
  );
}

export function Rating({ avg, count, className }: { avg: number | null; count: number; className?: string }) {
  if (!count || avg === null) return <span className={cn("text-xs text-ink-subtle", className)}>No reviews yet</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-semibold text-charcoal", className)}>
      <Star aria-hidden className="h-4 w-4 fill-gold text-gold" />
      {avg.toFixed(1)}
      <span className="font-normal text-ink-subtle">({count} review{count === 1 ? "" : "s"})</span>
    </span>
  );
}

export function DestinationCardView({ d, className }: { d: DCard; className?: string }) {
  return (
    <Link
      href={`/destinations/${d.slug}`}
      className={cn("group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand-300/70 bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]", className)}
    >
      <Cover media={d.media} variant={d.artVariant} seed={d.slug} className="aspect-[4/3]" />
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-terracotta-700">
          <MapPin aria-hidden className="h-3.5 w-3.5" />
          {d.region}
          {d.county ? ` · ${d.county}` : ""}
        </p>
        <h3 className="text-xl font-bold text-forest">{d.name}</h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-ink-muted">{d.summary}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-xs font-medium text-ink-subtle">
          <span>{d.experienceCount} experience{d.experienceCount === 1 ? "" : "s"}</span>
          <span>{d.guideCount} guide{d.guideCount === 1 ? "" : "s"}</span>
          {d.fromPriceMinor !== null && <span className="ml-auto text-sm font-semibold text-forest">from {formatMoney(d.fromPriceMinor)}</span>}
        </div>
      </div>
    </Link>
  );
}

export function ExperienceCardView({ e, className }: { e: ECard; className?: string }) {
  return (
    <Link
      href={`/experiences/${e.slug}`}
      className={cn("group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand-300/70 bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]", className)}
    >
      <div className="relative">
        <Cover media={e.media} variant={e.destination.artVariant} seed={e.slug} className="aspect-[16/10]" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <Badge tone="dark">{e.category.name}</Badge>
          {e.isDemo && <DemoBadge />}
        </div>
        {(() => {
          const Icon = CATEGORY_ICON[e.category.slug] ?? Compass;
          return (
            <span aria-hidden className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-sand/90 text-forest shadow-sm">
              <Icon className="h-5 w-5" />
            </span>
          );
        })()}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="flex items-center gap-1 text-xs font-semibold text-ink-subtle">
          <MapPin aria-hidden className="h-3.5 w-3.5" />
          {e.destination.name}
        </p>
        <h3 className="text-lg font-bold leading-snug text-forest">{e.title}</h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-ink-muted">{e.summary}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-subtle">
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden className="h-3.5 w-3.5" />
            {formatDuration(e.durationMinutes)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users aria-hidden className="h-3.5 w-3.5" />
            {e.pricingModel === "per_group" ? `Private, up to ${e.maxGroupSize}` : `Up to ${e.maxGroupSize}`}
          </span>
        </div>
        <div className="mt-auto flex items-end justify-between pt-3">
          <Rating avg={e.ratingAvg} count={e.reviewCount} />
          <p className="text-right">
            <span className="block text-[11px] uppercase tracking-wider text-ink-subtle">{e.pricingModel === "per_group" ? "per group" : "per person"}</span>
            <span className="font-display text-lg font-bold text-forest">{formatMoney(e.basePriceMinor, e.currency)}</span>
          </p>
        </div>
      </div>
    </Link>
  );
}

export function GuideAvatar({ name, photoUrl, className }: { name: string; photoUrl: string | null; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- provider-supplied https URL, not proxied
    return <img src={photoUrl} alt="" referrerPolicy="no-referrer" className={cn("rounded-full object-cover", className)} />;
  }
  return (
    <div aria-hidden className={cn("flex items-center justify-center rounded-full bg-forest font-display font-semibold text-gold", className)}>
      {initials}
    </div>
  );
}

export function VerificationBadge({ verified, isDemo }: { verified: boolean; isDemo?: boolean }) {
  if (verified)
    return (
      <Badge tone="success" title="Identity and a professional credential were checked by our team">
        <BadgeCheck aria-hidden className="h-3.5 w-3.5" />
        Verified
      </Badge>
    );
  return (
    <Badge tone="neutral" title={isDemo ? "Demo profiles are never verified" : "Verification has not been completed"}>
      Not yet verified
    </Badge>
  );
}

export function GuideCardView({ g, query, className }: { g: GCard; query?: string; className?: string }) {
  return (
    <Link
      href={`/guides/${g.slug}${query ? `?${query}` : ""}`}
      className={cn("group flex flex-col rounded-[var(--radius-card)] border border-sand-300/70 bg-white p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]", className)}
    >
      <div className="flex items-start gap-4">
        <GuideAvatar name={g.name} photoUrl={g.photoUrl} className="h-16 w-16 text-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <VerificationBadge verified={g.verified} isDemo={g.isDemo} />
            {g.isDemo && <DemoBadge />}
          </div>
          <h3 className="mt-1.5 text-lg font-bold text-forest">{g.name}</h3>
          {g.headline && <p className="line-clamp-2 text-sm text-ink-muted">{g.headline}</p>}
        </div>
      </div>
      <div className="mt-4 space-y-2 text-xs text-ink-muted">
        <p className="flex items-center gap-1.5">
          <Languages aria-hidden className="h-3.5 w-3.5 shrink-0" />
          {g.languages.join(", ")}
        </p>
        <p className="flex items-center gap-1.5">
          <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-1">{g.regions.map((r) => r.name).join(", ")}</span>
        </p>
      </div>
      {g.specialties.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {g.specialties.slice(0, 4).map((s) => (
            <Badge key={s} tone="forest" className="capitalize">
              {s}
            </Badge>
          ))}
        </div>
      )}
      {g.availableOnDate !== null && (
        <p className={cn("mt-3 text-xs font-semibold", g.availableOnDate ? "text-[#1d5b39]" : "text-ink-subtle")}>
          {g.availableOnDate ? "✓ Has open time on your date" : "No open time on your date"}
        </p>
      )}
      <div className="mt-auto flex items-end justify-between pt-4">
        <Rating avg={g.ratingAvg} count={g.reviewCount} />
        {g.fromPriceMinor !== null && (
          <p className="text-right">
            <span className="block text-[11px] uppercase tracking-wider text-ink-subtle">from</span>
            <span className="font-display text-lg font-bold text-forest">{formatMoney(g.fromPriceMinor, g.currency)}</span>
          </p>
        )}
      </div>
    </Link>
  );
}
