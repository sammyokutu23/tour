import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BadgeCheck, Clock, Languages, MapPin, PlayCircle, Users } from "lucide-react";
import { DestinationArt } from "@/components/art/destination-art";
import { ExperienceCardView, GuideAvatar, Rating, VerificationBadge } from "@/components/catalogue/cards";
import { GuideServicePicker } from "@/components/catalogue/guide-service-picker";
import { FavouriteButton } from "@/components/catalogue/favourite-button";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Alert, Badge, Card, Container, DemoBadge, PageSkeleton, Skeleton, Textarea, cn } from "@/components/ui";
import { getActor, getSession, requestDb } from "@/server/auth/session";
import { getGuide } from "@/server/services/catalogue";
import { listEditableTripsWithDays } from "@/server/services/trips";
import { track } from "@/server/services/analytics";
import { enquiryAction } from "@/app/actions/catalogue";
import { POLICY_SUMMARY } from "@/domain/cancellation";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDuration, minutesToTime } from "@/lib/time";

type Params = Promise<{ slug: string }>;

const VERIFICATION_LABEL: Record<string, string> = {
  identity: "Identity checked",
  tourism_license: "Tourism licence checked",
  guide_certification: "Guiding certification checked",
  business_registration: "Business registration checked",
  insurance: "Insurance checked",
};

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const g = await getGuide(await requestDb(), slug);
  if (!g) return { title: "Guide not found" };
  return { title: `${g.name} — local guide`, description: g.headline ?? undefined, alternates: { canonical: `/guides/${g.slug}` } };
}

export default function GuidePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Container className="py-12"><PageSkeleton /></Container>}>
      <Guide params={params} />
    </Suspense>
  );
}

async function Guide({ params }: { params: Params }) {
  const { slug } = await params;
  const db = await requestDb();
  const g = await getGuide(db, slug);
  if (!g) notFound();
  const actor = await getActor();
  await track(db, "guide_viewed", { guide: g.slug }, actor?.userId ?? null);
  const returnTo = `/guides/${g.slug}`;

  return (
    <>
      <section className="relative isolate overflow-hidden bg-forest-950">
        <div className="absolute inset-0 -z-10 opacity-60">
          <DestinationArt variant={g.baseDestination?.artVariant ?? "savanna"} seed={g.slug} />
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-forest-950/95 to-forest-950/50" />
        <Container className="flex flex-col gap-6 py-14 sm:flex-row sm:items-end">
          <GuideAvatar name={g.name} photoUrl={g.photoUrl} className="h-28 w-28 text-3xl ring-4 ring-sand/20" />
          <div className="flex-1">
            <div className="flex flex-wrap gap-2">
              <VerificationBadge verified={g.verified} isDemo={g.isDemo} />
              {g.isDemo && <DemoBadge />}
            </div>
            <h1 className="mt-3 text-4xl font-bold text-sand">{g.name}</h1>
            {g.headline && <p className="mt-2 text-lg text-sand/85">{g.headline}</p>}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-sand/80">
              <span className="inline-flex items-center gap-1.5"><Languages aria-hidden className="h-4 w-4" />{g.languages.join(", ")}</span>
              {g.baseDestination && <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden className="h-4 w-4" />Based in {g.baseDestination.name}</span>}
              {g.yearsExperience !== null && <span>{g.yearsExperience} years guiding (self-reported)</span>}
            </div>
          </div>
          <FavouriteButton targetType="guide" targetId={g.id} tone="light" />
        </Container>
      </section>

      <Container className="grid gap-10 py-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-10">
          {g.isDemo && <Alert tone="warning" title="Demo profile">This guide is fictional sample data. Services, prices and availability are for demonstration only.</Alert>}
          <section>
            <h2 className="mb-3 text-2xl font-bold text-forest">About</h2>
            <p className="whitespace-pre-line leading-relaxed">{g.bio}</p>
            {g.introVideoUrl && (
              <a href={g.introVideoUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-forest underline">
                <PlayCircle aria-hidden className="h-5 w-5" /> Watch introduction video (opens external site)
              </a>
            )}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {g.specialties.map((s) => <Badge key={s} tone="forest" className="capitalize">{s}</Badge>)}
            </div>
          </section>

          <section>
            <h2 className="mb-1 text-2xl font-bold text-forest">Services &amp; prices</h2>
            <p className="mb-4 text-sm text-ink-muted">Add a service to a day in your trip. The guide accepts the request before you pay.</p>
            <div className="space-y-4">
              {g.services.map((s) => (
                <Card key={s.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-xl">
                      <h3 className="text-lg font-bold text-forest">{s.title}</h3>
                      <p className="mt-1 text-sm text-ink-muted">{s.description}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-subtle">
                        <span className="inline-flex items-center gap-1"><Clock aria-hidden className="h-3.5 w-3.5" />{formatDuration(s.durationMinutes)}</span>
                        <span className="inline-flex items-center gap-1"><Users aria-hidden className="h-3.5 w-3.5" />Up to {s.maxGroupSize}</span>
                        <span>Book {s.minNoticeHours}h ahead</span>
                        <span className="capitalize" title={POLICY_SUMMARY[s.cancellationPolicy]}>{s.cancellationPolicy} cancellation</span>
                      </div>
                    </div>
                    <p className="text-right">
                      <span className="block text-[11px] uppercase tracking-wider text-ink-subtle">{s.pricingModel === "per_group" ? "per group" : "per person"}</span>
                      <span className="font-display text-xl font-bold text-forest">{formatMoney(s.basePriceMinor, s.currency)}</span>
                    </p>
                  </div>
                  <div className="mt-4 border-t border-sand-200 pt-4">
                    <Suspense fallback={<Skeleton className="h-10" />}>
                      <ServicePicker serviceId={s.id} returnTo={returnTo} />
                    </Suspense>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {g.experiences.length > 0 && (
            <section>
              <h2 className="mb-4 text-2xl font-bold text-forest">Experiences hosted by {g.name.split(" ")[0]}</h2>
              <div className="grid gap-6 sm:grid-cols-2">{g.experiences.map((e) => <ExperienceCardView key={e.id} e={e} />)}</div>
            </section>
          )}

          <section>
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-2xl font-bold text-forest">Reviews</h2>
              <Rating avg={g.ratingAvg} count={g.reviewCount} />
            </div>
            {g.reviews.length ? (
              <div className="space-y-4">
                {g.reviews.map((r) => (
                  <Card key={r.id} className="p-5">
                    <p aria-label={`${r.rating} out of 5`} className="text-gold">{"★".repeat(r.rating)}<span className="text-sand-300">{"★".repeat(5 - r.rating)}</span></p>
                    {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
                    <p className="mt-1 text-sm leading-relaxed">{r.body}</p>
                    <p className="mt-2 text-xs text-ink-subtle">{r.reviewerName}{r.experienceTitle ? ` · ${r.experienceTitle}` : ""} · {formatDate(r.createdAt)}</p>
                    {r.providerResponse && <p className="mt-3 rounded-xl bg-sand p-3 text-sm"><strong>Response:</strong> {r.providerResponse}</p>}
                  </Card>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-white p-5 text-sm text-ink-muted">No reviews yet. Reviews can only be written after a completed booking.</p>
            )}
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:h-fit">
          <Card className="p-6">
            <h2 className="text-lg font-bold text-forest">Availability</h2>
            <p className="mb-4 text-xs text-ink-subtle">Open time over the next three weeks ({g.timezone.replace("_", " ")} time). Existing bookings are already removed.</p>
            <ul className="grid grid-cols-7 gap-1.5" aria-label="Availability calendar">
              {g.calendar.map((c) => {
                const free = c.windows.reduce((s, w) => s + (w.end - w.start), 0);
                const label = `${formatDate(c.date, { weekday: "short", day: "numeric", month: "short", year: undefined })}: ${free ? c.windows.map((w) => `${minutesToTime(w.start)}–${minutesToTime(w.end === 1440 ? 1439 : w.end)}`).join(", ") : "unavailable"}`;
                return (
                  <li key={c.date} title={label} aria-label={label} className={cn("flex aspect-square flex-col items-center justify-center rounded-lg text-xs font-semibold", free >= 240 ? "bg-forest text-sand" : free > 0 ? "bg-gold-100 text-[#6b4e0b]" : "bg-sand-200 text-ink-subtle line-through")}>
                    {Number(c.date.slice(8))}
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex gap-4 text-[11px] text-ink-subtle">
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-forest" />4h+ free</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-gold-100" />Partly free</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-sand-200" />Unavailable</span>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-bold text-forest">Verification</h2>
            {g.verifications.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {g.verifications.map((v) => (
                  <li key={v.type} className="flex items-center gap-2"><BadgeCheck aria-hidden className="h-4 w-4 text-[#1d5b39]" />{VERIFICATION_LABEL[v.type] ?? v.type}{v.expiresAt ? ` (valid to ${formatDate(v.expiresAt)})` : ""}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">No checks have been completed for this profile yet.</p>
            )}
            <Link href="/safety" className="mt-3 inline-block text-xs font-semibold text-forest underline">What our checks cover</Link>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-bold text-forest">Ask {g.name.split(" ")[0]} a question</h2>
            <p className="mb-3 text-xs text-ink-subtle">Messages stay on the platform. Please don&apos;t share payment details.</p>
            <Suspense fallback={<Skeleton className="h-28" />}>
              <Enquiry providerId={g.id} returnTo={returnTo} />
            </Suspense>
          </Card>
        </aside>
      </Container>
    </>
  );
}

async function ServicePicker({ serviceId, returnTo }: { serviceId: string; returnTo: string }) {
  const session = await getSession();
  const trips = session ? await listEditableTripsWithDays(await requestDb(), session.actor) : [];
  return <GuideServicePicker serviceId={serviceId} trips={trips} signedIn={!!session} returnTo={returnTo} />;
}

async function Enquiry({ providerId, returnTo }: { providerId: string; returnTo: string }) {
  const session = await getSession();
  if (!session) {
    return <Link href={`/login?next=${encodeURIComponent(returnTo)}`} className="text-sm font-semibold text-forest underline">Sign in to send a message</Link>;
  }
  if (session.actor.providerId === providerId) return <p className="text-sm text-ink-muted">This is your profile.</p>;
  return (
    <ActionForm action={enquiryAction.bind(null, providerId)}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <label htmlFor="message" className="sr-only">Message</label>
      <Textarea id="message" name="message" required maxLength={4000} placeholder="Hi! We're visiting in March with two children…" />
      <SubmitButton size="sm" pendingLabel="Sending…">Send message</SubmitButton>
    </ActionForm>
  );
}
