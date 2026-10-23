import Link from "next/link";
import { CalendarDays, Globe2, Lock, MapPin, ShieldCheck, Sparkles, Users } from "lucide-react";
import { DestinationArt } from "@/components/art/destination-art";
import { Badge, DemoBadge, cn } from "@/components/ui";
import { GuideAvatar } from "@/components/catalogue/cards";
import type { GroupCard } from "@/server/services/travel-groups";
import { INTEREST_LABEL } from "@/domain/travel-groups";
import { formatMoney } from "@/lib/money";
import { daysBetween, formatDate } from "@/lib/time";

export function GroupCover({ id, hasCover, art, className }: { id: string; hasCover: boolean; art: GroupCard["coverArt"]; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-forest-100", className)}>
      {hasCover ? (
        // eslint-disable-next-line @next/next/no-img-element -- served from private storage through an authorizing route
        <img src={`/travel-together/${id}/cover`} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <DestinationArt variant={art} seed={id} />
      )}
    </div>
  );
}

export function VisibilityBadge({ visibility }: { visibility: GroupCard["visibility"] }) {
  if (visibility === "public") return <Badge tone="success"><Globe2 aria-hidden className="h-3 w-3" />Open to join</Badge>;
  if (visibility === "approval") return <Badge tone="info"><ShieldCheck aria-hidden className="h-3 w-3" />Request to join</Badge>;
  return <Badge tone="dark"><Lock aria-hidden className="h-3 w-3" />Invite only</Badge>;
}

export function budgetLabel(g: Pick<GroupCard, "minBudgetMinor" | "maxBudgetMinor" | "currency">) {
  if (g.minBudgetMinor === null && g.maxBudgetMinor === null) return null;
  if (g.minBudgetMinor !== null && g.maxBudgetMinor !== null) return `${formatMoney(g.minBudgetMinor, g.currency)}–${formatMoney(g.maxBudgetMinor, g.currency)}`;
  return g.minBudgetMinor !== null ? `from ${formatMoney(g.minBudgetMinor, g.currency)}` : `up to ${formatMoney(g.maxBudgetMinor!, g.currency)}`;
}

export function PlacesBar({ memberCount, maxMembers }: { memberCount: number; maxMembers: number }) {
  const left = Math.max(0, maxMembers - memberCount);
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="inline-flex items-center gap-1 text-ink-muted"><Users aria-hidden className="h-3.5 w-3.5" />{memberCount} of {maxMembers} going</span>
        <span className={left === 0 ? "text-terracotta-700" : left <= 2 ? "text-[#8a6410]" : "text-[#1d5b39]"}>{left === 0 ? "Full" : `${left} place${left === 1 ? "" : "s"} left`}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sand-200" role="meter" aria-valuemin={0} aria-valuemax={maxMembers} aria-valuenow={memberCount} aria-label="Places taken">
        <div className={cn("h-full rounded-full", left === 0 ? "bg-terracotta" : "bg-forest")} style={{ width: `${Math.min(100, (memberCount / maxMembers) * 100)}%` }} />
      </div>
    </div>
  );
}

export function GroupCardView({ g, className }: { g: GroupCard; className?: string }) {
  const nights = daysBetween(g.startDate, g.endDate);
  const budget = budgetLabel(g);
  return (
    <Link
      href={`/travel-together/${g.id}`}
      className={cn("group flex flex-col overflow-hidden rounded-[var(--radius-card)] border-2 border-forest bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]", className)}
    >
      <div className="relative">
        <GroupCover id={g.id} hasCover={g.hasCover} art={g.coverArt} className="aspect-[16/9]" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <VisibilityBadge visibility={g.visibility} />
          {g.isDemo && <DemoBadge />}
        </div>
        {g.viewerStatus && (
          <span className="absolute bottom-3 right-3 rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-forest-950 shadow-sm">
            {g.viewerStatus === "organizer" ? "You organise" : g.viewerStatus === "member" ? "You're going" : g.viewerStatus === "requested" ? "Requested" : "Invited"}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-terracotta-700"><MapPin aria-hidden className="h-3.5 w-3.5" />{g.destination.name}</p>
          <h3 className="mt-1 text-lg font-bold leading-snug text-forest">{g.name}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
            <CalendarDays aria-hidden className="h-4 w-4" />
            {formatDate(g.startDate, { day: "numeric", month: "short", year: undefined })} – {formatDate(g.endDate)} · {nights + 1} day{nights === 0 ? "" : "s"}
          </p>
        </div>
        <p className="line-clamp-2 text-sm text-ink-muted">{g.description}</p>
        {g.interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {g.interests.slice(0, 3).map((i) => <Badge key={i} tone="forest">{INTEREST_LABEL[i] ?? i}</Badge>)}
            {g.interests.length > 3 && <Badge>+{g.interests.length - 3}</Badge>}
          </div>
        )}
        {g.match?.label && (
          <p className="flex items-start gap-1.5 rounded-xl bg-gold-100/70 px-3 py-2 text-xs text-[#6b4e0b]">
            <Sparkles aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span><strong>{g.match.label}:</strong> {g.match.reasons.slice(0, 3).join(" · ")}</span>
          </p>
        )}
        <div className="mt-auto space-y-3 pt-1">
          <PlacesBar memberCount={g.memberCount} maxMembers={g.maxMembers} />
          <div className="flex items-center justify-between gap-2 border-t border-sand-200 pt-3">
            <span className="flex min-w-0 items-center gap-2 text-xs text-ink-muted">
              <GuideAvatar name={g.organizer.name} photoUrl={g.organizer.photoUrl} className="h-7 w-7 text-[10px]" />
              <span className="truncate">by <strong className="text-charcoal">{g.organizer.name}</strong></span>
            </span>
            {budget && (
              <span className="shrink-0 text-right text-xs">
                <span className="block text-[10px] uppercase tracking-wider text-ink-subtle">est. per person</span>
                <span className="font-bold text-forest">{budget}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function AvatarStack({ people, max = 5 }: { people: { name: string; photoUrl: string | null; visible: boolean }[]; max?: number }) {
  return (
    <div className="flex -space-x-2">
      {people.slice(0, max).map((p, i) => (
        <GuideAvatar key={i} name={p.visible ? p.name : "?"} photoUrl={p.photoUrl} className="h-9 w-9 text-xs ring-2 ring-white" />
      ))}
      {people.length > max && <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sand-200 text-xs font-bold ring-2 ring-white">+{people.length - max}</span>}
    </div>
  );
}
